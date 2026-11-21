'use client';
// v4.24.0 — fiche d'un jeu de la ludothèque : « Lier à BGG » et « Modifier »
// (maquette mockup/2026-11-21-v4240-fiche-edition.html).
import { useEffect, useState } from 'react';
import { FORMATS, formatLabel } from '@/lib/formats';
import type { ResultatBgg, FicheLigne } from '@/lib/import-csv';
import type { Game } from '@/lib/types';
import { useI18n } from './LanguageProvider';

const imageDe = (f: FicheLigne | undefined) => (f?.coverName ? `/api/cover/${f.coverName}` : f?.imageUrl ?? null);
const plage = (a: number | null, b: number | null) => (a == null ? null : b == null || a === b ? `${a}` : `${a}–${b}`);

/** Recherche BGG pré-remplie avec le titre, aperçu, puis la fiche choisie remplace les infos. */
export function LierBgg({ game, onRetour, onLie }: { game: Game; onRetour: () => void; onLie: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState(game.title);
  const [cands, setCands] = useState<ResultatBgg[] | null>(null);
  const [apercus, setApercus] = useState<Record<number, FicheLigne>>({});
  const [choisi, setChoisi] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function chercher(texte: string) {
    setBusy(true); setErr(null); setChoisi(null);
    try {
      const r = await fetch(`/api/bgg/search?q=${encodeURIComponent(texte)}&ext=1`);
      if (!r.ok) throw new Error();
      setCands(((await r.json()).results ?? []) as ResultatBgg[]);
    } catch { setErr(t('bgg.errPasReponse')); setCands([]); } finally { setBusy(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void chercher(game.title); }, []);

  // Miniatures des premiers résultats, une par une (BGG ~1 requête/s, cache serveur 30 jours).
  useEffect(() => {
    let actif = true;
    (async () => {
      for (const c of (cands ?? []).slice(0, 6)) {
        if (!actif) return;
        try {
          const r = await fetch(`/api/bgg/thing?id=${c.bggId}&cover=0`);
          if (r.ok) { const f = (await r.json()) as FicheLigne; if (actif) setApercus((p) => ({ ...p, [c.bggId]: f })); }
        } catch { /* sans miniature */ }
      }
    })();
    return () => { actif = false; };
  }, [cands]);

  async function utiliser() {
    if (choisi == null) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/games/${game.id}/lier`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bggId: choisi }) });
      if (!r.ok) throw new Error();
      onLie();
    } catch { setErr(t('bgg.errPasReponse')); setBusy(false); }
  }

  const f = choisi != null ? apercus[choisi] : undefined;
  // Ce que BGG va remplacer (seulement les infos déjà renseignées et différentes).
  const diff: string[] = [];
  if (f) {
    const avant = (lbl: string, a: string | number | null, b: string | number | null) => {
      if (a != null && a !== '' && String(a) !== String(b ?? '')) diff.push(`${lbl} ${a} → ${b ?? '—'}`);
    };
    avant(t('fiche.dJoueurs'), plage(game.min_players, game.max_players), plage(f.minPlayers ?? null, f.maxPlayers ?? null));
    avant(t('fiche.dDuree'), game.playtime_min, f.playtimeMin ?? null);
    avant(t('fiche.dAnnee'), game.year, f.year ?? null);
    avant(t('fiche.dEditeur'), game.publisher, f.publisher ?? null);
    avant(t('fiche.dAuteurs'), game.designer, f.designer ?? null);
  }

  return (
    <div className="fiche-edition">
      <button type="button" className="fe-retour" onClick={onRetour}>‹ {game.title}</button>
      <h2>{game.bgg_id != null ? t('fiche.changerBgg') : t('fiche.lier')}</h2>
      <form className="csv-recherche" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) void chercher(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('fiche.rechercheAria')} />
        <button type="submit" disabled={busy || q.trim().length < 2}>{t('csv.chercher')}</button>
      </form>
      {err && <p className="hint" role="alert">{err}</p>}
      {cands && cands.length === 0 && !err && <p className="imp-sous">{t('csv.aucunResultat')}</p>}
      <ul className="imp-liste">
        {(cands ?? []).slice(0, 6).map((c) => {
          const img = imageDe(apercus[c.bggId]);
          return (
            <li key={c.bggId}>
              <button type="button" className="imp-jeu csv-cand" disabled={busy} aria-pressed={choisi === c.bggId} onClick={() => setChoisi(c.bggId)}>
                {img ? <img className="cover" src={img} alt="" /> : <span className="cover is-ph" aria-hidden>♟</span>}
                <span className="mid"><b className="titre">{c.name}</b>
                  <span className="meta">{c.annee ?? '—'}{apercus[c.bggId]?.publisher ? ` · ${apercus[c.bggId].publisher}` : ''}{c.bggId === game.bgg_id ? ' · ✓' : ''}</span></span>
              </button>
            </li>
          );
        })}
      </ul>
      {f && (
        <div className="fe-apercu">
          <p className="sous-label">{t('fiche.apercu')}</p>
          <div className="chips">
            {plage(f.minPlayers ?? null, f.maxPlayers ?? null) && <span className="chip">👥 {plage(f.minPlayers ?? null, f.maxPlayers ?? null)}</span>}
            {f.playtimeMin != null && <span className="chip">⏱ {f.playtimeMin} min</span>}
            {f.year != null && <span className="chip">{f.year}</span>}
            {f.publisher && <span className="chip">{f.publisher}</span>}
          </div>
          <p className="fe-diff">{diff.length > 0 && <>{t('fiche.remplace', { d: diff.join(' · ') })} </>}{t('fiche.garde', { t: game.title })}</p>
        </div>
      )}
      <button type="button" className="btn-go" disabled={busy || choisi == null} onClick={() => void utiliser()}>{t('fiche.utiliser')}</button>
    </div>
  );
}

/** Correction à la main : titre, format, joueurs, durée, année, éditeur, auteurs. */
export function ModifierJeu({ game, onRetour, onEnregistre }: { game: Game; onRetour: () => void; onEnregistre: () => void }) {
  const { lang, t } = useI18n();
  const [v, setV] = useState({
    title: game.title, box_format: game.box_format,
    min_players: game.min_players?.toString() ?? '', max_players: game.max_players?.toString() ?? '',
    playtime_min: game.playtime_min?.toString() ?? '', year: game.year?.toString() ?? '',
    publisher: game.publisher ?? '', designer: game.designer ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const champ = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }) });
  const entier = (s: string) => (/^\d{1,5}$/.test(s.trim()) ? Number(s.trim()) : null);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await fetch(`/api/games/${game.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: v.title, box_format: v.box_format,
        min_players: entier(v.min_players), max_players: entier(v.max_players),
        playtime_min: entier(v.playtime_min), year: entier(v.year),
        publisher: v.publisher.trim() || null, designer: v.designer.trim() || null,
      }),
    }).catch(() => null);
    if (r?.ok) { onEnregistre(); return; }
    setErr(r ? ((await r.json().catch(() => ({}))).error ?? t('bgg.errPasReponse')) : t('bgg.errPasReponse'));
    setBusy(false);
  }

  return (
    <form className="fiche-edition" onSubmit={(e) => void enregistrer(e)}>
      <button type="button" className="fe-retour" onClick={onRetour}>{t('fiche.annuler')}</button>
      <h2>{t('fiche.modifTitre')}</h2>
      {err && <p className="hint" role="alert">{err}</p>}
      <label className="fe-champ"><span>{t('fiche.champTitre')}</span><input required maxLength={120} {...champ('title')} /></label>
      <label className="fe-champ"><span>{t('fiche.champFormat')}</span>
        <select {...champ('box_format')}>{FORMATS.map((f) => <option key={f} value={f}>{formatLabel(f, lang)}</option>)}</select></label>
      <div className="fe-duo">
        <label className="fe-champ"><span>{t('fiche.champMin')}</span><input inputMode="numeric" {...champ('min_players')} /></label>
        <label className="fe-champ"><span>{t('fiche.champMax')}</span><input inputMode="numeric" {...champ('max_players')} /></label>
      </div>
      <div className="fe-duo">
        <label className="fe-champ"><span>{t('fiche.champDuree')}</span><input inputMode="numeric" {...champ('playtime_min')} /></label>
        <label className="fe-champ"><span>{t('fiche.champAnnee')}</span><input inputMode="numeric" {...champ('year')} /></label>
      </div>
      <label className="fe-champ"><span>{t('fiche.champEditeur')}</span><input maxLength={120} {...champ('publisher')} /></label>
      <label className="fe-champ"><span>{t('fiche.champAuteurs')}</span><input maxLength={120} {...champ('designer')} /></label>
      <button type="submit" className="btn-go" disabled={busy || !v.title.trim()}>{t('fiche.enregistrer')}</button>
    </form>
  );
}
