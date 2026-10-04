'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { avatarSrc } from '@/lib/formats';
import { cropDisplaySize, cropSourceRect, clampCropOffset, AVATAR_SIZE, CROP_SQ } from '@/lib/crop';
import { ALLOWED_STICKERS } from '@/lib/stickers';
import type { Game } from '@/lib/types';
import PinInput from './PinInput';
import FoyerCard, { type FoyerData } from './FoyerCard';
import BoxImage from './BoxImage';
import UserMenu from './UserMenu';

type Me = { id: number; pseudo: string; sticker: string | null; avatar_path: string | null };
type Stats = { plays: number; nights: number; games: number; podiums: { un: number; deux: number; trois: number } };
type VerdictStat = { game_id: number; jeu: string; adore: number; total: number };
type Partie = {
  id: number; played_at: string; game_title: string | null;
  cover_path: string | null; cover_url: string | null; score: number | null; med: string;
  mon_verdict: string | null;
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

export default function ProfileClient({ me, stats, verdictStats, foyer, parties }: { me: Me; stats: Stats; verdictStats: VerdictStat[]; foyer: FoyerData | null; parties: Partie[] }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Photo → recadrage
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null); // dimensions réelles, connues au décodage
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
    reader.onload = () => {
      setCropSrc(String(reader.result));
      setNat(null); // le recadrage attend le décodage réel (onLoad)
      setZoom(1);
      setOff({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  }

  function onImgLoad() {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    setNat({ w: img.naturalWidth, h: img.naturalHeight });
    setOff({ x: 0, y: 0 }); // cadré juste : centré, l'axe court remplit le carré
  }

  function onCropPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y };
  }
  function onCropPointerMove(e: React.PointerEvent) {
    if (!drag.current || !nat) return;
    const c = clampCropOffset(nat.w, nat.h, zoom,
      drag.current.ox + (e.clientX - drag.current.px),
      drag.current.oy + (e.clientY - drag.current.py));
    setOff(c);
  }
  function onCropPointerUp() { drag.current = null; }
  function onZoom(z: number) {
    const nz = Math.max(1, Math.min(3, z));
    setZoom(nz);
    if (nat) setOff((o) => clampCropOffset(nat.w, nat.h, nz, o.x, o.y));
  }

  async function useCrop() {
    const img = imgRef.current;
    if (!img || !cropSrc) return;
    setBusy(true); setError(null);
    try {
      await img.decode().catch(() => undefined); // jamais de drawImage sur une image vide
      if (!img.naturalWidth) { setError('Photo pas encore chargée — réessaie'); return; }
      const r = cropSourceRect(img.naturalWidth, img.naturalHeight, zoom, off.x, off.y);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE; canvas.height = AVATAR_SIZE;
      canvas.getContext('2d')!.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) { setError('Recadrage impossible'); return; }
      const form = new FormData();
      form.set('avatar', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      const res = await fetch('/api/me/avatar', { method: 'POST', body: form });
      if (!res.ok) { setError((await res.json()).error); return; }
      setCropSrc(null);
      router.refresh();
    } catch {
      setError('Recadrage impossible');
    } finally {
      setBusy(false);
    }
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
      <UserMenu me={me} />
      <div className="avatar-zone">
        <button type="button" className="avatar" aria-label="Changer d'avatar" onClick={() => setPickerOpen(true)}>
          {src ? <img src={src} alt="" /> : sticker}
        </button>
        <p className="pseudo">{me.pseudo}</p>
      </div>

      <div className="stats">
        <div className="stat"><b>{stats.plays}</b><span>parties jouées</span></div>
        <div className="stat"><b>{stats.nights}</b><span>parties</span></div>
        <div className="stat"><b className="medailles">👑 {stats.podiums.un} · 🥈 {stats.podiums.deux} · 🥉 {stats.podiums.trois}</b><span>podiums</span></div>
      </div>
      {verdictStats.some((v) => v.adore > 0) && (
        <div className="verdict-stats">
          {verdictStats.filter((v) => v.adore > 0).map((v) => (
            <p key={v.game_id}>Tu as adoré <b>{v.jeu}</b> : {v.adore} fois sur {v.total}</p>
          ))}
        </div>
      )}

      <FoyerCard foyer={foyer} meId={me.id} />

      <p className="pod-lb">MES PARTIES</p>
      {parties.length === 0 ? (
        <p className="hint">Aucune partie terminée — tout est devant vous.</p>
      ) : (
        <div className="mes-parties">
          {parties.map((p) => (
            <Link key={p.id} href={`/nights/${p.id}`} className="mp-row">
              <span className="cov">
                <BoxImage game={{ title: p.game_title ?? '', cover_path: p.cover_path, cover_url: p.cover_url } as Game} />
              </span>
              <span className="mpd">
                <b>{p.game_title ?? 'Soirée de jeux'}</b>
                <span>{dateFmt.format(new Date(`${p.played_at}T12:00:00`))}</span>
                {p.mon_verdict === null && <span className="mp-verdict">🗳️ Donne ton verdict</span>}
              </span>
              <span className="dt"><b>{p.score ?? '—'}</b><span className="med">{p.med}</span></span>
            </Link>
          ))}
        </div>
      )}

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
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-input" onChange={openPhoto} />
            <input ref={galRef} type="file" accept="image/*" className="sr-input" onChange={openPhoto} />
          </div>
        </div>
      )}

      {/* Recadrage carré */}
      {cropSrc && (
        <div className="crop" role="dialog" aria-modal="true" aria-label="Recadrer ta photo">
          <div className="crop-head">
            <button type="button" aria-label="Annuler" onClick={() => setCropSrc(null)}>✕</button>
            <span>Recadre ta photo</span>
            <button type="button" className="ok" disabled={busy || !nat} onClick={useCrop}>Recadrer ✓</button>
          </div>
          <div className="crop-zone">
            <div className="crop-sq"
                 onPointerDown={onCropPointerDown} onPointerMove={onCropPointerMove}
                 onPointerUp={onCropPointerUp} onPointerCancel={onCropPointerUp}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imgRef} src={cropSrc} alt="" draggable={false} onLoad={onImgLoad}
                   style={{ width: nat ? cropDisplaySize(nat.w, nat.h, zoom).w : undefined,
                            transform: `translate(-50%, -50%) translate(${off.x}px, ${off.y}px)` }} />
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
              Les parties des autres restent, sans toi. <b>Irréversible.</b>
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
