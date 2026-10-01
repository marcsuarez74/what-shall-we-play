'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, FORMAT_SCALE } from '@/lib/formats';
import type { UserLite } from '@/lib/types';
import UserMenu from './UserMenu';

interface Suggestion { bggId: number; name: string; }
interface Thing {
  bggId: number; title: string; year: number | null; publisher: string | null;
  minPlayers: number | null; maxPlayers: number | null; playtimeMin: number | null;
  weight: number | null; rating: number | null; designer: string | null;
  artist: string | null; bestPlayers: number | null; coverName: string | null;
}
type Stage = 'etiquette' | 'choix' | 'fiche';
type Mode = 'bgg' | 'manuel';

// Taille du plus grand carré (grand = 30×30) ; les autres suivent FORMAT_SCALE.
const BOX_PX = 76;

export default function AddGameForm({ me }: { me: UserLite }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState('grand');
  const [stage, setStage] = useState<Stage>('etiquette');
  const [mode, setMode] = useState<Mode>('bgg');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [thing, setThing] = useState<Thing | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [manual, setManual] = useState({ year: '', publisher: '', min_players: '', max_players: '', playtime_min: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchInfos() {
    const q = title.trim();
    setBusy(true); setError(null); setSuggestions([]);
    try {
      const res = await fetch(`/api/bgg/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error();
      const results: Suggestion[] = (await res.json()).results;
      if (results.length === 0) {
        setError(`Aucun jeu trouvé pour « ${q} » — essaie le titre anglais, ou saisis à la main.`);
        return;
      }
      if (results.length === 1) { await pick(results[0]); return; }
      setSuggestions(results.slice(0, 8));
      setStage('choix');
    } catch {
      setError('BGG ne répond pas encore (token en attente) — tu peux saisir à la main.');
    } finally { setBusy(false); }
  }

  async function pick(s: Suggestion) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/bgg/thing?id=${s.bggId}`);
      if (!res.ok) throw new Error();
      const t = (await res.json()) as Thing;
      setThing(t);
      setTitle(t.title || s.name);
      setMode('bgg');
      setStage('fiche');
    } catch {
      setError('Impossible de récupérer la fiche BGG — réessaie ou saisis à la main.');
    } finally { setBusy(false); }
  }

  function goManual() {
    setMode('manuel'); setThing(null); setSuggestions([]);
    setError(null); setStage('fiche');
  }

  function backToSearch() { setStage('etiquette'); setSuggestions([]); setError(null); }

  function reset() {
    setStage('etiquette'); setMode('bgg'); setThing(null); setSuggestions([]);
    setPhoto(null); setError(null);
    setManual({ year: '', publisher: '', min_players: '', max_players: '', playtime_min: '' });
  }

  async function submit() {
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('box_format', format);
    if (mode === 'bgg' && thing) {
      fd.append('bgg_id', String(thing.bggId));
      const vals: Record<string, string | number | null> = {
        year: thing.year, publisher: thing.publisher, min_players: thing.minPlayers,
        max_players: thing.maxPlayers, playtime_min: thing.playtimeMin,
        weight: thing.weight, bgg_rating: thing.rating, designer: thing.designer,
        artist: thing.artist, best_players: thing.bestPlayers,
      };
      for (const [k, v] of Object.entries(vals)) if (v !== null && v !== '') fd.append(k, String(v));
      if (thing.coverName) fd.append('cover_name', thing.coverName);
    } else {
      for (const [k, v] of Object.entries(manual)) if (v !== '') fd.append(k, v);
    }
    if (photo) fd.append('cover', photo);
    const res = await fetch('/api/games', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Erreur à l’enregistrement'); return; }
    router.push('/etagere'); router.refresh();
  }

  const FormatPicker = ({ mini = false }: { mini?: boolean }) => (
    <div role="group" aria-label="Format de boîte" className={`formats${mini ? ' mini' : ''}`}>
      {FORMATS.map((f) => (
        <button key={f} type="button" className="format-btn" aria-pressed={format === f}
                onClick={() => setFormat(f)}>
          <span className="box" style={{ width: BOX_PX * FORMAT_SCALE[f], height: BOX_PX * FORMAT_SCALE[f] }} />
          <span className="name">{f[0].toUpperCase() + f.slice(1)}</span>
        </button>
      ))}
    </div>
  );

  const joueurs = thing?.minPlayers && thing?.maxPlayers
    ? (thing.minPlayers === thing.maxPlayers ? `${thing.minPlayers}` : `${thing.minPlayers}–${thing.maxPlayers}`)
    : null;
  const cover = thing?.coverName ? `/api/cover/${thing.coverName}` : null;

  return (
    <form className="add-form" onSubmit={(e) => {
      e.preventDefault();
      if (stage === 'etiquette') fetchInfos();
      else if (stage === 'fiche') submit();
    }}>
      <div className="page-head">
        <h1>Ajouter un jeu</h1>
        <UserMenu me={me} />
      </div>
      {stage === 'etiquette' && (
        <>
          <label htmlFor="add-titre">Titre du jeu</label>
          <input id="add-titre" className="add-title" value={title} autoComplete="off"
                 onChange={(e) => setTitle(e.target.value)} placeholder="Through the Desert…" />
          <p className="help">Le titre BGG, souvent en anglais — ex. « Through the Desert ».</p>

          <p className="field-label">Format de boîte</p>
          <FormatPicker />

          <button type="button" className="btn-bgg" disabled={busy || title.trim().length < 2} onClick={fetchInfos}>
            <img src="/logos/powered-by-bgg.svg" alt="" />
            <span className="sep" aria-hidden />
            {busy ? 'Récupération…' : 'Récupérer les infos'}
          </button>
          <p className="btn-note">Année, éditeur, joueurs, durée, créateur, pochette…</p>
          <button type="button" className="link-manual" onClick={goManual}>Saisir à la main</button>
        </>
      )}

      {stage === 'choix' && (
        <>
          <p className="field-label">Plusieurs jeux correspondent — lequel ?</p>
          <ul className="suggestions">
            {suggestions.map((s) => (
              <li key={s.bggId}>
                <button type="button" onClick={() => pick(s)}>{s.name}</button>
              </li>
            ))}
          </ul>
          <button type="button" className="link-manual" onClick={backToSearch}>‹ Modifier la recherche</button>
        </>
      )}

      {stage === 'fiche' && (
        <div className="fiche">
          {mode === 'bgg' && thing ? (
            <>
              <div className="fiche-head">
                {cover
                  ? <img className="fiche-cover" src={cover} alt="" />
                  : <div className="fiche-cover is-ph" aria-hidden>♟</div>}
                <div className="fiche-id">
                  <input className="fiche-title" aria-label="Titre du jeu" value={title}
                         onChange={(e) => setTitle(e.target.value)} />
                  <p className="fiche-meta">{thing.year ?? '—'} · {thing.publisher ?? '—'}</p>
                </div>
              </div>
              <ul className="sheet-facts">
                {joueurs && <li><span>Joueurs</span><strong>{joueurs}</strong></li>}
                {thing.playtimeMin != null && <li><span>Durée</span><strong>{thing.playtimeMin} min</strong></li>}
                {thing.weight != null && <li><span>Complexité (BGG)</span><strong>⚖ {thing.weight.toLocaleString('fr-FR')} / 5</strong></li>}
                {thing.rating != null && <li><span>Note (BGG)</span><strong>⭐ {thing.rating.toLocaleString('fr-FR')} / 10</strong></li>}
                {thing.designer && <li><span>Créateur</span><strong>{thing.designer}</strong></li>}
                {thing.artist && <li><span>Illustrateur</span><strong>{thing.artist}</strong></li>}
              </ul>
              <div className="cover-row">
                <span className={thing.coverName ? 'cover-ok' : 'cover-miss'}>
                  {thing.coverName ? '✓ Pochette récupérée depuis BGG' : 'Pochette BGG indisponible'}
                </span>
                <label className="cover-replace">
                  {photo ? 'Photo choisie ✓' : 'Remplacer par une photo'}
                  <input type="file" accept=".jpg,.jpeg,.png,.webp" hidden
                         onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </>
          ) : (
            <>
              <label>Titre
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <div className="manual-pair">
                <label>Année
                  <input inputMode="numeric" value={manual.year}
                         onChange={(e) => setManual((m) => ({ ...m, year: e.target.value }))} />
                </label>
                <label>Éditeur
                  <input value={manual.publisher}
                         onChange={(e) => setManual((m) => ({ ...m, publisher: e.target.value }))} />
                </label>
              </div>
              <div className="manual-row">
                <label>Joueurs min
                  <input inputMode="numeric" value={manual.min_players}
                         onChange={(e) => setManual((m) => ({ ...m, min_players: e.target.value }))} />
                </label>
                <label>Joueurs max
                  <input inputMode="numeric" value={manual.max_players}
                         onChange={(e) => setManual((m) => ({ ...m, max_players: e.target.value }))} />
                </label>
                <label>Durée (min)
                  <input inputMode="numeric" value={manual.playtime_min}
                         onChange={(e) => setManual((m) => ({ ...m, playtime_min: e.target.value }))} />
                </label>
              </div>
              <label className="cover-replace as-block">
                {photo ? `Photo choisie ✓ (${photo.name})` : 'Ajouter une photo (optionnel)'}
                <input type="file" accept=".jpg,.jpeg,.png,.webp" hidden
                       onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </label>
            </>
          )}

          <p className="field-label">Format de boîte</p>
          <FormatPicker mini />

          <button type="button" className="btn-go" disabled={busy || !title.trim()} onClick={submit}>
            {busy ? 'Enregistrement…' : 'Ajouter à la ludothèque'}
          </button>
          <button type="button" className="cancel" onClick={reset}>Annuler</button>
        </div>
      )}

      {error && <p className="hint" role="alert">{error}</p>}
    </form>
  );
}
