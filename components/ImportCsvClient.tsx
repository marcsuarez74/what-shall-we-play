'use client';
// Import d'une ludothèque depuis un CSV (export Myludo, v4.20.0) — maquette
// mockup/2026-11-20-v4200-import-csv.html. Fichier lu dans le navigateur ; chaque titre
// est cherché sur BGG (aperçu sans téléchargement : /api/bgg/thing?cover=0) ; les pochettes
// ne sont rapatriées qu'à la confirmation, par la route habituelle.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FORMATS, FORMAT_SCALE, formatShort } from '@/lib/formats';
import { ficheBggFormData, type FicheBgg } from '@/lib/bgg-ajout';
import {
  lireCsvMyludo, rapprocher, requeteBgg, memeTitre, doublonsFichier,
  type LigneCsv, type ResultatBgg,
} from '@/lib/import-csv';
import type { BoxFormat, Game, UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import UserMenu from './UserMenu';

type Fiche = FicheBgg & { imageUrl?: string | null };
type Etat = 'att' | 'ok' | 'multi' | 'none' | 'echec' | 'enrichir' | 'deja' | 'doublon';
interface Ligne {
  i: number; csv: LigneCsv; etat: Etat; coche: boolean;
  fiche: Fiche | null; candidats: ResultatBgg[]; dejaId: number | null; resolu: boolean;
}
type Resultat = 'importe' | 'enrichi' | 'echec';
type Stage = 'fichier' | 'verif' | 'import' | 'recap';

const imageDe = (f: Fiche | null) => (f?.coverName ? `/api/cover/${f.coverName}` : f?.imageUrl ?? null);

async function chercher(q: string, ext: boolean): Promise<ResultatBgg[]> {
  const r = await fetch(`/api/bgg/search?q=${encodeURIComponent(q)}${ext ? '&ext=1' : ''}`);
  if (!r.ok) throw new Error('search');
  return ((await r.json()).results ?? []) as ResultatBgg[];
}
async function fiche(bggId: number, apercu: boolean): Promise<Fiche> {
  const r = await fetch(`/api/bgg/thing?id=${bggId}${apercu ? '&cover=0' : ''}`);
  if (!r.ok) throw new Error('thing');
  return (await r.json()) as Fiche;
}

/** Valeurs du jeu : la fiche BGG, puis ce que dit le CSV quand il le dit (titre, joueurs, durée, éditeur, auteurs). */
function valeurs(l: Ligne) {
  const f = l.fiche, c = l.csv;
  return {
    bgg_id: f?.bggId ?? null, year: f?.year ?? c.annee, publisher: c.editeur ?? f?.publisher ?? null,
    min_players: c.minJoueurs ?? f?.minPlayers ?? null, max_players: c.maxJoueurs ?? f?.maxPlayers ?? null,
    playtime_min: c.duree ?? f?.playtimeMin ?? null, weight: f?.weight ?? null, bgg_rating: f?.rating ?? null,
    designer: c.auteurs ?? f?.designer ?? null, artist: c.illustrateurs ?? f?.artist ?? null,
    best_players: f?.bestPlayers ?? null, cover_name: f?.coverName ?? null,
  };
}

export default function ImportCsvClient({ me }: { me: UserLite }) {
  const router = useRouter();
  const { lang, t } = useI18n();
  const [stage, setStage] = useState<Stage>('fichier');
  const [nomFichier, setNomFichier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [ext, setExt] = useState(false);
  const [fmt, setFmt] = useState<BoxFormat>('grand');
  const [filtre, setFiltre] = useState<'tous' | 'agir'>('tous');
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [faits, setFaits] = useState<{ i: number; r: Resultat; cov: boolean }[]>([]);
  const [total, setTotal] = useState(0);
  const ref = useRef<Ligne[]>([]);
  const ludo = useRef<Game[]>([]);
  const boucle = useRef(false);
  // Lu à chaque tour de boucle : cocher « extensions » pendant une recherche en cours
  // doit les inclure (sinon elles restaient « en attente » et « Ajouter » ne s'activait jamais).
  const extRef = useRef(false);
  const vivant = useRef(true);
  // StrictMode (dev) démonte puis remonte : le drapeau doit revenir à vrai au remontage.
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);

  function maj(i: number, patch: Partial<Ligne>) {
    ref.current = ref.current.map((l) => (l.i === i ? { ...l, ...patch } : l));
    if (vivant.current) setLignes(ref.current);
  }

  // Ligne trouvée sur BGG : déjà là (même bgg_id, ou même titre déjà lié) / à compléter / nouvelle.
  function placer(l: Ligne, f: Fiche): Partial<Ligne> {
    const parId = ludo.current.find((g) => g.bgg_id === f.bggId);
    const parTitre = memeTitre(l.csv.titre, ludo.current);
    if (parId || parTitre?.bgg_id != null) return { fiche: f, etat: 'deja', coche: false };
    if (parTitre) return { fiche: f, etat: 'enrichir', dejaId: parTitre.id };
    return { fiche: f, etat: 'ok' };
  }

  async function rechercher() {
    if (boucle.current) return;
    boucle.current = true;
    try {
      for (;;) {
        const l = ref.current.find((x) => x.etat === 'att' && (extRef.current || !x.csv.extension));
        if (!l || !vivant.current) break;
        try {
          const r = rapprocher(l.csv.titre, l.csv.annee, await chercher(requeteBgg(l.csv.titre), l.csv.extension));
          if (r.etat === 'ok') maj(l.i, placer(l, await fiche(r.bggId, true)));
          else maj(l.i, r.etat === 'multi' ? { etat: 'multi', candidats: r.candidats } : { etat: 'none' });
        } catch { maj(l.i, { etat: 'echec' }); }
      }
    } finally { boucle.current = false; }
  }

  async function lireFichier(file: File | undefined) {
    if (!file) return;
    setError(null);
    const csv = lireCsvMyludo(await file.text());
    if (!csv || csv.length === 0) { setError(t('csv.errFormat')); return; }
    const res = await fetch('/api/games');
    if (!res.ok) { setError(t('import.errLectureLudo')); return; }
    ludo.current = ((await res.json()).games ?? []) as Game[];
    const doublons = doublonsFichier(csv);
    ref.current = csv.map((c, i) => {
      const deja = memeTitre(c.titre, ludo.current);
      const etat: Etat = doublons.has(i) ? 'doublon' : deja?.bgg_id != null ? 'deja' : 'att';
      return { i, csv: c, etat, coche: etat === 'att' && !c.extension, fiche: null, candidats: [], dejaId: null, resolu: false };
    });
    setLignes(ref.current); setNomFichier(file.name); setFiltre('tous'); setStage('verif');
    extRef.current = ext;
    void rechercher();
  }

  function basculerExt() {
    const v = !ext;
    setExt(v); extRef.current = v;
    for (const l of ref.current) if (l.csv.extension && ['att', 'ok', 'multi', 'none', 'echec', 'enrichir'].includes(l.etat)) maj(l.i, { coche: v });
    if (v) void rechercher();
  }

  const visibles = lignes.filter((l) => ext || !l.csv.extension);
  const aAgir = (l: Ligne) => l.coche && !l.resolu && (l.etat === 'multi' || l.etat === 'none' || l.etat === 'echec');
  const faites = visibles.filter((l) => l.etat !== 'att').length;
  const fini = faites === visibles.length;
  const selection = visibles.filter((l) => l.coche && l.etat !== 'deja' && l.etat !== 'doublon');
  const nAgir = visibles.filter(aAgir).length;
  const montrees = filtre === 'agir' ? visibles.filter(aAgir) : visibles;

  async function importer(cible: Ligne[]) {
    setStage('import'); setFaits([]); setTotal(cible.length);
    const out: { i: number; r: Resultat; cov: boolean }[] = [];
    for (const l0 of cible) {
      let l = l0;
      if (l.fiche) { try { l = { ...l, fiche: await fiche(l.fiche.bggId, false) }; } catch { /* sans pochette : rattrapable depuis la ludothèque */ } }
      const v = valeurs(l);
      let r: Resultat = 'echec';
      try {
        if (l.etat === 'enrichir' && l.dejaId != null) {
          const res = await fetch(`/api/games/${l.dejaId}/enrichir`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
          if (res.ok) r = 'enrichi';
        } else {
          const fd = l.fiche ? ficheBggFormData(l.fiche, fmt, l.csv.titre) : new FormData();
          if (!l.fiche) { fd.append('title', l.csv.titre); fd.append('box_format', fmt); }
          for (const [k, x] of Object.entries(v)) if (x != null && k !== 'cover_name' && k !== 'bgg_id') fd.set(k, String(x));
          const res = await fetch('/api/games', { method: 'POST', body: fd });
          if (res.ok) r = 'importe';
        }
      } catch { /* compté en échec */ }
      out.push({ i: l.i, r, cov: !!v.cover_name });
      if (vivant.current) setFaits([...out]);
    }
    if (!vivant.current) return;
    setStage('recap');
    router.refresh();
  }

  const nImp = faits.filter((f) => f.r === 'importe').length;
  const nEnr = faits.filter((f) => f.r === 'enrichi').length;
  const nKo = faits.filter((f) => f.r === 'echec').length;
  const nSans = faits.filter((f) => f.r !== 'echec' && !f.cov).length;

  function texteEtat(l: Ligne): string {
    switch (l.etat) {
      case 'att': return t('csv.etatAttente');
      case 'ok': return t('csv.etatOk', { nom: l.fiche?.title ?? '', annee: l.fiche?.year ?? '—' });
      case 'enrichir': return t('csv.etatEnrichir');
      case 'deja': return t('import.dejaLudo');
      case 'doublon': return t('csv.etatDoublon');
      case 'multi': return t('csv.etatMulti', { n: l.candidats.length });
      case 'echec': return t('csv.etatEchec');
      case 'none': return l.resolu ? t('csv.etatSansCov') : t('csv.etatNone');
    }
  }
  const classeEtat: Record<Etat, string> = { att: 'att', ok: 'ok', enrichir: 'dup', deja: 'att', doublon: 'att', multi: 'dup', none: 'ko', echec: 'ko' };

  return (
    <div className="imp-page">
      <div className="page-head">
        <h1>{stage === 'verif' ? t('csv.titreVerif', { n: visibles.length }) : t('csv.titre')}</h1>
        <UserMenu me={me} />
      </div>
      {error && <p className="hint" role="alert">{error}</p>}

      {stage === 'fichier' && (
        <div className="imp-bloc">
          <p className="imp-sous">{t('csv.intro')}</p>
          <label className="csv-depot"
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={(e) => { e.preventDefault(); void lireFichier(e.dataTransfer.files[0]); }}>
            <span className="ico" aria-hidden>📄</span>
            <b>{t('csv.choisir')}</b>
            <span>{t('csv.deposer')}</span>
            <input type="file" accept=".csv,text/csv" aria-label={t('csv.choisir')}
                   onChange={(e) => void lireFichier(e.target.files?.[0])} />
          </label>
          <p className="help">{t('csv.aide')}</p>
          <Link className="cancel" href="/games/add">{t('import.annuler')}</Link>
        </div>
      )}

      {stage === 'verif' && (
        <div>
          <div className="csv-fichier">
            <span aria-hidden>📄</span>
            <span className="t"><b>{nomFichier}</b><small>{t('csv.lignes', { n: lignes.length })}</small></span>
            <button type="button" className="link-btn" onClick={() => { setStage('fichier'); ref.current = []; setLignes([]); }}>{t('csv.changer')}</button>
          </div>
          {lignes.some((l) => l.csv.extension) && (
            <button type="button" className="csv-bascule" role="switch" aria-checked={ext} onClick={basculerExt}>
              <span className="t">{t('csv.extensions')}<small>{t('csv.extensionsN', { n: lignes.filter((l) => l.csv.extension).length })}</small></span>
              <span className={`inter${ext ? ' on' : ''}`} aria-hidden />
            </button>
          )}
          <p className="field-label">{t('import.fmtDefaut', { f: formatShort(fmt, lang) })}</p>
          <div className="seg" role="group" aria-label={t('import.fmtGroupeAria')}>
            {FORMATS.map((f) => (
              <button key={f} type="button" className={fmt === f ? 'on' : ''} aria-pressed={fmt === f} onClick={() => setFmt(f)}>
                <span className="box" style={{ width: 9 + 4 * FORMAT_SCALE[f], height: 9 + 4 * FORMAT_SCALE[f] }} />
                <span className="lbl">{formatShort(f, lang)}</span>
              </button>
            ))}
          </div>
          <p className="imp-num csv-avance">
            <span>{fini ? t('csv.rechercheFinie') : t('csv.rechercheEnCours')}</span><span>{faites} / {visibles.length}</span>
          </p>
          <div className="imp-barre"><div className="fill" style={{ width: `${faites * 100 / Math.max(visibles.length, 1)}%` }} /></div>
          <div className="csv-filtres">
            <button type="button" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}>{t('csv.filtreTous')} <span>{visibles.length}</span></button>
            <button type="button" aria-pressed={filtre === 'agir'} className={nAgir ? 'ambre' : ''} onClick={() => setFiltre('agir')}>{t('csv.filtreAgir')} <span>{nAgir}</span></button>
          </div>
          {montrees.length === 0 && <p className="imp-sous csv-rien">{t('csv.rienAVerifier')}</p>}
          <ul className="imp-liste">
            {montrees.map((l) => {
              const img = imageDe(l.fiche);
              const cliquable = ['ok', 'multi', 'none', 'echec'].includes(l.etat);
              const figee = l.etat === 'deja' || l.etat === 'doublon';
              return (
                <li key={l.i} className={`imp-jeu${l.coche || figee ? '' : ' exclu'}${figee ? ' fige' : ''}${aAgir(l) ? ' agir' : ''}`}>
                  {img
                    ? <img className="cover" src={img} alt="" loading="lazy" decoding="async" />
                    : <span className={`cover is-ph${l.etat === 'att' ? ' attente' : ''}`} aria-hidden>{l.etat === 'att' ? '' : '?'}</span>}
                  <button type="button" className="mid csv-mid" disabled={!cliquable} onClick={() => setOuverte(l.i)}>
                    <b className="titre">{l.csv.titre}{l.csv.extension && <span className="csv-ext">{t('csv.ext')}</span>}</b>
                    <span className="meta">{[l.csv.annee, l.csv.minJoueurs && (l.csv.maxJoueurs && l.csv.maxJoueurs !== l.csv.minJoueurs ? `${l.csv.minJoueurs}–${l.csv.maxJoueurs} j` : `${l.csv.minJoueurs}${l.csv.maxJoueurs ? '' : '+'} j`), l.csv.duree && `${l.csv.duree} min`].filter(Boolean).join(' · ')}</span>
                    <span className={`csv-etat ${classeEtat[l.etat]}`}>{texteEtat(l)}</span>
                  </button>
                  {!figee && (
                    <button type="button" className="puce" aria-pressed={l.coche} aria-label={t('import.importerAria', { j: l.csv.titre })}
                            onClick={() => maj(l.i, { coche: !l.coche })}>✓</button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="imp-bas">
            <button type="button" className="btn-go" disabled={!fini || selection.length === 0} onClick={() => void importer(selection)}>
              {!fini ? t('csv.rechercheEnCours') : selection.length === 0 ? t('import.rienAImporter') : t('csv.ajouterN', { n: selection.length })}
            </button>
          </div>
        </div>
      )}

      {stage === 'import' && (
        <div>
          <p className="imp-encours">{t('csv.ajoutEnCours')}</p>
          <div className="imp-barre"><div className="fill" style={{ width: `${faits.length * 100 / Math.max(total, 1)}%` }} /></div>
          <p className="imp-num">{faits.length} / {total} · {t('csv.garderOuvert')}</p>
        </div>
      )}

      {stage === 'recap' && (
        <div>
          <div className="imp-recap">
            <p className="grand">{nKo > 0 ? '🫤' : '🎉'}</p>
            <h2>{nKo > 0 ? t('import.presqueTout') : t('csv.termine')}</h2>
          </div>
          <ul className="imp-stats">
            <li className="ok"><span>{t('import.statsImportes')}</span><b>{nImp}</b></li>
            <li className="enr"><span>{t('import.statsEnrichies')}</span><b>{nEnr}</b></li>
            <li className="dup"><span>{t('csv.statsSansCov')}</span><b>{nSans}</b></li>
            {nKo > 0 && <li className="ko"><span>{t('import.statsEchecs')}</span><b>{nKo}</b></li>}
          </ul>
          {nSans > 0 && <p className="help">{t('csv.aideSansCov')}</p>}
          {nKo > 0 && (
            <button type="button" className="btn-ressayer"
                    onClick={() => void importer(lignes.filter((l) => faits.find((f) => f.i === l.i)?.r === 'echec'))}>
              {t('import.reessayer')}
            </button>
          )}
          <Link className="btn-go as-link" href="/library">{t('ludotheque.voir')}</Link>
        </div>
      )}

      {ouverte !== null && (
        <Choix ligne={lignes.find((l) => l.i === ouverte)!} onFermer={() => setOuverte(null)}
               onChoisir={(f) => { const l = ref.current.find((x) => x.i === ouverte)!; maj(l.i, { ...placer(l, f), coche: true, resolu: true }); setOuverte(null); }}
               onSansCov={() => { maj(ouverte, { etat: 'none', fiche: null, coche: true, resolu: true }); setOuverte(null); }}
               onExclure={() => { maj(ouverte, { coche: false }); setOuverte(null); }} />
      )}
    </div>
  );
}

/** Bottom-sheet : choisir parmi les résultats BGG, ou chercher sous un autre titre. */
function Choix({ ligne, onFermer, onChoisir, onSansCov, onExclure }: {
  ligne: Ligne; onFermer: () => void; onChoisir: (f: Fiche) => void; onSansCov: () => void; onExclure: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState(ligne.csv.titre);
  const [cands, setCands] = useState<ResultatBgg[]>(ligne.candidats);
  const [apercus, setApercus] = useState<Record<number, Fiche>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Miniatures des candidats, une par une (BGG ~1 requête/s, cache 30 jours côté serveur).
  useEffect(() => {
    let actif = true;
    (async () => {
      for (const c of cands.slice(0, 6)) {
        if (!actif) return;
        try { const f = await fiche(c.bggId, true); if (actif) setApercus((p) => ({ ...p, [c.bggId]: f })); } catch { /* sans miniature */ }
      }
    })();
    return () => { actif = false; };
  }, [cands]);

  async function relancer() {
    setBusy(true); setErr(null);
    try { setCands(await chercher(q.trim(), true)); } catch { setErr(t('bgg.errPasReponse')); } finally { setBusy(false); }
  }
  async function choisir(c: ResultatBgg) {
    setBusy(true); setErr(null);
    try { onChoisir(apercus[c.bggId] ?? await fiche(c.bggId, true)); } catch { setErr(t('bgg.errPasReponse')); setBusy(false); }
  }

  return (
    <div className="sheet-backdrop" onClick={onFermer}>
      <div className="bottom-sheet csv-choix" role="dialog" aria-modal="true" aria-label={ligne.csv.titre} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sheet-close" aria-label={t('etagere.fermer')} onClick={onFermer}>✕</button>
        <h2>{ligne.csv.titre}</h2>
        <p className="imp-sous">{cands.length ? t('csv.lequel') : t('csv.aucunResultat')}</p>
        <form className="csv-recherche" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) void relancer(); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('csv.autreTitre')} />
          <button type="submit" disabled={busy || q.trim().length < 2}>{t('csv.chercher')}</button>
        </form>
        {err && <p className="hint" role="alert">{err}</p>}
        <ul className="imp-liste">
          {cands.slice(0, 6).map((c) => {
            const img = imageDe(apercus[c.bggId] ?? null);
            return (
              <li key={c.bggId}>
                <button type="button" className="imp-jeu csv-cand" disabled={busy} aria-pressed={ligne.fiche?.bggId === c.bggId} onClick={() => void choisir(c)}>
                  {img ? <img className="cover" src={img} alt="" /> : <span className="cover is-ph" aria-hidden>♟</span>}
                  <span className="mid"><b className="titre">{c.name}</b><span className="meta">{c.annee ?? '—'}{apercus[c.bggId]?.publisher ? ` · ${apercus[c.bggId].publisher}` : ''}</span></span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn-ghost" onClick={onSansCov}>{t('csv.sansCov')}</button>
        <button type="button" className="link-btn" onClick={onExclure}>{t('csv.exclure')}</button>
      </div>
    </div>
  );
}
