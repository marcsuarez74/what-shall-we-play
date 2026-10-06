'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FORMATS, FORMAT_SCALE, formatShort } from '@/lib/formats';
import { formatNombre } from '@/lib/i18n/format';
import type { UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import UserMenu from './UserMenu';

interface Suggestion { bggId: number; name: string; annee: number | null; }
interface Thing {
  bggId: number; title: string; year: number | null; publisher: string | null;
  minPlayers: number | null; maxPlayers: number | null; playtimeMin: number | null;
  weight: number | null; rating: number | null; designer: string | null;
  artist: string | null; bestPlayers: number | null; coverName: string | null;
}
type Stage = 'etiquette' | 'fiche';
type Mode = 'bgg' | 'manuel';

// Taille du plus grand carré (grand = 30×30) ; les autres suivent FORMAT_SCALE.
const BOX_PX = 76;
const DEBOUNCE_MS = 500;   // l'autocomplete attend la fin de frappe
const MAX_SUGGESTIONS = 8; // et précharge au plus 8 fiches (garde 1 req/s côté serveur)

export default function AddGameForm({ me }: { me: UserLite }) {
  const router = useRouter();
  const { lang, t } = useI18n();
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
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearDebounce() {
    if (debounce.current) { clearTimeout(debounce.current); debounce.current = null; }
  }

  // Autocomplete (v4.4.0, épurée v4.5.0) : la liste live remplace l'ancien écran
  // « choix » — [nom (année)], SANS pochette : /search ne donne aucune image et
  // le préchargement /thing coûtait des requêtes pour rien. La requête est un
  // paramètre explicite : le debounce capture la valeur de la frappe, pas le
  // state du rendu (closure stale sinon).
  async function chercher(q: string) {
    if (q.length < 2) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/bgg/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error();
      const results: Suggestion[] = (await res.json()).results;
      if (results.length === 0) { setSuggestions([]); setError(t('ajout.errAucunJeu', { q })); return; }
      setSuggestions(results.slice(0, MAX_SUGGESTIONS));
    } catch {
      setSuggestions([]); setError(t('ajout.errBggToken'));
    } finally { setBusy(false); }
  }

  function onTitre(v: string) {
    setTitle(v);
    clearDebounce();
    setSuggestions([]); setError(null); // nouvelle frappe : la liste repart de zéro
    if (stage === 'etiquette' && v.trim().length >= 2) {
      debounce.current = setTimeout(() => { void chercher(v.trim()); }, DEBOUNCE_MS);
    }
  }

  async function pick(s: Suggestion) {
    clearDebounce();
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
      setError(t('ajout.errFicheBgg'));
    } finally { setBusy(false); }
  }

  function goManual() {
    clearDebounce();
    setMode('manuel'); setThing(null); setSuggestions([]);
    setError(null); setStage('fiche');
  }

  function backToSearch() { setStage('etiquette'); setSuggestions([]); setError(null); }

  function reset() {
    clearDebounce();
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
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? t('ajout.errEnregistrement')); return; }
    router.push('/etagere'); // push suffit (Next 15) — cf. UserMenu.logout
  }

  const FormatPicker = ({ mini = false }: { mini?: boolean }) => (
    <div role="group" aria-label={t('ajout.fmtBoite')} className={`formats${mini ? ' mini' : ''}`}>
      {FORMATS.map((f) => (
        <button key={f} type="button" className="format-btn" aria-pressed={format === f}
                onClick={() => setFormat(f)}>
          <span className="box" style={{ width: BOX_PX * FORMAT_SCALE[f], height: BOX_PX * FORMAT_SCALE[f] }} />
          <span className="name">{formatShort(f, lang)}</span>
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
      if (stage === 'etiquette') void chercher(title.trim());
      else if (stage === 'fiche') submit();
    }}>
      <div className="page-head">
        <h1>{t('ajout.titre')}</h1>
        <UserMenu me={me} />
      </div>
      {stage === 'etiquette' && (
        <>
          <label htmlFor="add-titre">{t('ajout.titreLabel')}</label>
          <input id="add-titre" className="add-title" value={title} autoComplete="off"
                 onChange={(e) => onTitre(e.target.value)} placeholder="Through the Desert…" />
          <p className="help">{t('ajout.titreAide')}</p>

          {suggestions.length > 0 && (
            <ul className="suggestions" aria-label={t('ajout.plusieursCorrespondances')}>
              {suggestions.map((s) => (
                <li key={s.bggId}>
                  <button type="button" onClick={() => pick(s)}>
                    <span className="sugg-nom">{s.name}</span>
                    {s.annee != null && <span className="sugg-annee">({s.annee})</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="field-label">{t('ajout.fmtBoite')}</p>
          <FormatPicker />

          <button type="button" className="btn-bgg" disabled={busy || title.trim().length < 2} onClick={() => void chercher(title.trim())}>
            <img src="/logos/powered-by-bgg.svg" alt="" />
            <span className="sep" aria-hidden />
            {busy ? t('ajout.recuperation') : t('ajout.recuperer')}
          </button>
          <p className="btn-note">{t('ajout.recapChamps')}</p>
          <Link className="link-import" href="/games/import">{t('ajout.lienImport')}</Link>
          <button type="button" className="link-manual" onClick={goManual}>{t('ajout.saisieManuelle')}</button>
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
                  <input className="fiche-title" aria-label={t('ajout.titreLabel')} value={title}
                         onChange={(e) => setTitle(e.target.value)} />
                  <p className="fiche-meta">{thing.year ?? '—'} · {thing.publisher ?? '—'}</p>
                </div>
              </div>
              <ul className="sheet-facts">
                {joueurs && <li><span>{t('etagere.joueurs')}</span><strong>{joueurs}</strong></li>}
                {thing.playtimeMin != null && <li><span>{t('etagere.duree')}</span><strong>{thing.playtimeMin} min</strong></li>}
                {thing.weight != null && <li><span>{t('fiche.complexite')}</span><strong>⚖ {formatNombre(lang, thing.weight)} / 5</strong></li>}
                {thing.rating != null && <li><span>{t('fiche.note')}</span><strong>⭐ {formatNombre(lang, thing.rating)} / 10</strong></li>}
                {thing.designer && <li><span>{t('fiche.createur')}</span><strong>{thing.designer}</strong></li>}
                {thing.artist && <li><span>{t('fiche.illustrateur')}</span><strong>{thing.artist}</strong></li>}
              </ul>
              <div className="cover-row">
                <span className={thing.coverName ? 'cover-ok' : 'cover-miss'}>
                  {thing.coverName ? t('ajout.pochetteOk') : t('ajout.pochetteKo')}
                </span>
                <label className="cover-replace">
                  {photo ? t('ajout.photoChoisie') : t('ajout.photoRemplacer')}
                  <input type="file" accept=".jpg,.jpeg,.png,.webp" hidden
                         onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </>
          ) : (
            <>
              <label>{t('ajout.titreCourt')}
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <div className="manual-pair">
                <label>{t('ajout.annee')}
                  <input inputMode="numeric" value={manual.year}
                         onChange={(e) => setManual((m) => ({ ...m, year: e.target.value }))} />
                </label>
                <label>{t('ajout.editeur')}
                  <input value={manual.publisher}
                         onChange={(e) => setManual((m) => ({ ...m, publisher: e.target.value }))} />
                </label>
              </div>
              <div className="manual-row">
                <label>{t('ajout.joueursMin')}
                  <input inputMode="numeric" value={manual.min_players}
                         onChange={(e) => setManual((m) => ({ ...m, min_players: e.target.value }))} />
                </label>
                <label>{t('ajout.joueursMax')}
                  <input inputMode="numeric" value={manual.max_players}
                         onChange={(e) => setManual((m) => ({ ...m, max_players: e.target.value }))} />
                </label>
                <label>{t('ajout.dureeMin')}
                  <input inputMode="numeric" value={manual.playtime_min}
                         onChange={(e) => setManual((m) => ({ ...m, playtime_min: e.target.value }))} />
                </label>
              </div>
              <label className="cover-replace as-block">
                {photo ? t('ajout.photoChoisieNom', { name: photo.name }) : t('ajout.photoAjouter')}
                <input type="file" accept=".jpg,.jpeg,.png,.webp" hidden
                       onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </label>
            </>
          )}

          <p className="field-label">{t('ajout.fmtBoite')}</p>
          <FormatPicker mini />

          <button type="button" className="btn-go" disabled={busy || !title.trim()} onClick={submit}>
            {busy ? t('etagere.enregistrement') : t('ajout.ajouterLudo')}
          </button>
          <button type="button" className="cancel" onClick={reset}>{t('soiree.annuler')}</button>
        </div>
      )}

      {error && <p className="hint" role="alert">{error}</p>}
    </form>
  );
}
