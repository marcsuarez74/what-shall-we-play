'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { avatarSrc } from '@/lib/formats';
import { ALLOWED_STICKERS } from '@/lib/stickers';
import PinInput from './PinInput';

type Me = { pseudo: string; sticker: string | null; avatar_path: string | null };
type Stats = { plays: number; nights: number; games: number };

// Recadrage carré : la zone de cadrage fait 320 px, la sortie 256×256.
const SQ = 320;

export default function ProfileClient({ me, stats }: { me: Me; stats: Stats }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Photo → recadrage
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  // Changer le code — 3 étapes
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeStep, setCodeStep] = useState(1);
  const [c1, setC1] = useState(''); const [c2, setC2] = useState(''); const [c3, setC3] = useState('');
  const [codeMsg, setCodeMsg] = useState<string | null>(null);

  // Suppression
  const [delOpen, setDelOpen] = useState(false);
  const [delCode, setDelCode] = useState('');

  function openPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setCropSrc(String(reader.result)); setZoom(1); setOff({ x: 0, y: 0 }); };
    reader.readAsDataURL(file);
  }

  function clampOffset(x: number, y: number, zoom: number) {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const base = Math.max(SQ / img.naturalWidth, SQ / img.naturalHeight);
    const mx = Math.max(0, (img.naturalWidth * base * zoom - SQ) / 2);
    const my = Math.max(0, (img.naturalHeight * base * zoom - SQ) / 2);
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  }

  function onCropPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y };
  }
  function onCropPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setOff(clampOffset(drag.current.ox + (e.clientX - drag.current.px), drag.current.oy + (e.clientY - drag.current.py), zoom));
  }
  function onCropPointerUp() { drag.current = null; }
  function onZoom(z: number) {
    const img = imgRef.current;
    const nz = Math.max(1, Math.min(3, z));
    setZoom(nz);
    if (img) setOff((o) => clampOffset(o.x, o.y, nz));
  }

  async function useCrop() {
    const img = imgRef.current;
    if (!img || !cropSrc) return;
    setBusy(true); setError(null);
    const base = Math.max(SQ / img.naturalWidth, SQ / img.naturalHeight);
    const scale = base * zoom;
    const left = (SQ - img.naturalWidth * scale) / 2 + off.x;
    const top = (SQ - img.naturalHeight * scale) / 2 + off.y;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    canvas.getContext('2d')!.drawImage(img, -left / scale, -top / scale, SQ / scale, SQ / scale, 0, 0, 256, 256);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) { setBusy(false); setError('Recadrage impossible'); return; }
    const form = new FormData();
    form.set('avatar', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    const res = await fetch('/api/me/avatar', { method: 'POST', body: form });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    setCropSrc(null);
    router.refresh();
  }

  async function chooseSticker(s: string) {
    setBusy(true); setError(null);
    const res = await fetch('/api/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sticker: s }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    setPickerOpen(false);
    router.refresh();
  }

  async function submitCode() {
    if (c2 !== c3) { setCodeMsg('Les deux nouveaux codes diffèrent'); return; }
    setBusy(true); setCodeMsg(null);
    const res = await fetch('/api/me/code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: c1, next: c2 }),
    });
    setBusy(false);
    if (!res.ok) { setCodeMsg((await res.json()).error); return; }
    setCodeMsg('Code enregistré ✓');
    setTimeout(() => { setCodeOpen(false); setCodeStep(1); setC1(''); setC2(''); setC3(''); setCodeMsg(null); }, 900);
  }

  async function deleteMe() {
    setBusy(true); setError(null);
    const res = await fetch('/api/me', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: delCode }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    router.push('/register');
  }

  const src = avatarSrc(me);
  const sticker = me.sticker ?? '🎲';

  return (
    <div className="profile">
      <div className="avatar-zone">
        <button type="button" className="avatar" aria-label="Changer d'avatar" onClick={() => setPickerOpen(true)}>
          {src ? <img src={src} alt="" /> : sticker}
        </button>
        <p className="pseudo">{me.pseudo}</p>
      </div>

      <div className="stats">
        <div className="stat"><b>{stats.plays}</b><span>parties jouées</span></div>
        <div className="stat"><b>{stats.nights}</b><span>soirées</span></div>
        <div className="stat"><b>{stats.games}</b><span>jeux</span></div>
      </div>

      <div className="actions">
        <button type="button" className="action" onClick={() => { setCodeOpen(true); setCodeStep(1); }}>
          Changer mon code <span className="n">4 chiffres</span>
        </button>
        <button type="button" className="action danger" onClick={() => { setDelOpen(true); setDelCode(''); }}>
          Supprimer mon profil <span className="n">irréversible</span>
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {/* Sélecteur de sticker */}
      {pickerOpen && (
        <div className="sheet-backdrop" onClick={() => setPickerOpen(false)}>
          <div className="bottom-sheet picker" role="dialog" aria-modal="true" aria-label="Choisir un sticker"
               onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sheet-close" aria-label="Fermer" onClick={() => setPickerOpen(false)}>✕</button>
            <h2>Choisis ton sticker</h2>
            <p className="hint">Il remplace le dé partout : chips de joueurs, tirages, historique.</p>
            <div className="sticker-grid">
              {ALLOWED_STICKERS.map((s) => (
                <button key={s} type="button" className={s === sticker ? 'on' : ''} disabled={busy}
                        onClick={() => chooseSticker(s)}>{s}</button>
              ))}
            </div>
            <div className="photo-opts">
              <button type="button" onClick={() => camRef.current?.click()}>📷 Prendre une photo</button>
              <button type="button" onClick={() => galRef.current?.click()}>🖼 Choisir dans la galerie</button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={openPhoto} />
            <input ref={galRef} type="file" accept="image/*" hidden onChange={openPhoto} />
          </div>
        </div>
      )}

      {/* Recadrage carré */}
      {cropSrc && (
        <div className="crop" role="dialog" aria-modal="true" aria-label="Recadrer ta photo">
          <div className="crop-head">
            <button type="button" aria-label="Annuler" onClick={() => setCropSrc(null)}>✕</button>
            <span>Recadre ta photo</span>
            <button type="button" className="ok" disabled={busy} onClick={useCrop}>Recadrer ✓</button>
          </div>
          <div className="crop-zone">
            <div className="crop-sq"
                 onPointerDown={onCropPointerDown} onPointerMove={onCropPointerMove}
                 onPointerUp={onCropPointerUp} onPointerCancel={onCropPointerUp}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imgRef} src={cropSrc} alt="" draggable={false}
                   style={{ transform: `translate(-50%, -50%) translate(${off.x}px, ${off.y}px) scale(${zoom})` }} />
            </div>
          </div>
          <div className="crop-foot">
            <label htmlFor="crop-zoom">Zoom</label>
            <input id="crop-zoom" type="range" min={1} max={3} step={0.01} value={zoom}
                   onChange={(e) => onZoom(Number(e.target.value))} />
            <p>Glisse pour cadrer — <b>256×256</b> à l&apos;enregistrement</p>
          </div>
        </div>
      )}

      {/* Changer le code — 3 étapes */}
      {codeOpen && (
        <div className="sheet-backdrop" onClick={() => setCodeOpen(false)}>
          <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Changer mon code"
               onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sheet-close" aria-label="Fermer" onClick={() => setCodeOpen(false)}>✕</button>
            <h2>Changer mon code</h2>
            <div className="steps" aria-hidden="true"><i className={codeStep >= 1 ? 'on' : ''} /><i className={codeStep >= 2 ? 'on' : ''} /><i className={codeStep >= 3 ? 'on' : ''} /></div>
            {codeStep === 1 && (
              <>
                <p className="pin-label">Étape 1/3 — ton code actuel</p>
                <PinInput label="Code actuel" value={c1} onChange={setC1} autoComplete="current-password" />
                <button type="button" className="btn-go" disabled={c1.length !== 4}
                        onClick={() => setCodeStep(2)}>Continuer</button>
              </>
            )}
            {codeStep === 2 && (
              <>
                <p className="pin-label">Étape 2/3 — nouveau code</p>
                <PinInput label="Nouveau code" value={c2} onChange={setC2} autoComplete="new-password" />
                <button type="button" className="btn-go" disabled={c2.length !== 4}
                        onClick={() => setCodeStep(3)}>Continuer</button>
              </>
            )}
            {codeStep === 3 && (
              <>
                <p className="pin-label">Étape 3/3 — confirme le nouveau code</p>
                <PinInput label="Confirmer le nouveau code" value={c3} onChange={setC3} autoComplete="new-password" />
                {codeMsg && <p className={codeMsg.includes('✓') ? 'ok-msg' : 'error'} role="alert">{codeMsg}</p>}
                <button type="button" className="btn-go" disabled={busy || c3.length !== 4}
                        onClick={submitCode}>Enregistrer le nouveau code</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Suppression */}
      {delOpen && (
        <div className="sheet-backdrop" onClick={() => setDelOpen(false)}>
          <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Supprimer mon profil"
               onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sheet-close" aria-label="Fermer" onClick={() => setDelOpen(false)}>✕</button>
            <h2>Supprimer mon profil ?</h2>
            <p className="warn">
              Ton profil, tes <b>{stats.games} jeux</b> et tes tirages quittent l&apos;app.
              Les soirées des autres restent, sans toi. <b>Irréversible.</b>
            </p>
            <p className="pin-label">Confirme avec ton code secret</p>
            <PinInput label="Code secret" value={delCode} onChange={setDelCode} />
            {error && <p className="error" role="alert">{error}</p>}
            <button type="button" className="btn-danger" disabled={busy || delCode.length !== 4} onClick={deleteMe}>
              Supprimer définitivement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
