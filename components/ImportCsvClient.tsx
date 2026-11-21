'use client';
// Import d'une ludothèque depuis un export Myludo CSV (v4.20.0) ou JSON (v4.22.0) — maquettes
// mockup/2026-11-20-v4200-import-csv.html, …-v4220-import-json.html, …-v4230-import-fond.html.
// v4.23.0 : le fichier est lu ici, puis le SERVEUR fait l'import (recherche BGG, ajout) — on peut
// quitter la page ou fermer l'app. Cet écran lit l'état en base (GET /api/import) et le pilote.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FORMATS, FORMAT_SCALE, formatShort } from '@/lib/formats';
import {
  lireFichierMyludo, compter, aAgir,
  type ResultatBgg, type LigneImport, type ImportInfo, type FicheLigne, type EtatLigne,
} from '@/lib/import-csv';
import type { BoxFormat, UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import UserMenu from './UserMenu';

type Donnees = { import: ImportInfo | null; lignes: LigneImport[] };

const imageDe = (f: FicheLigne | null) => (f?.coverName ? `/api/cover/${f.coverName}` : f?.imageUrl ?? null);

async function chercher(q: string, ext: boolean): Promise<ResultatBgg[]> {
  const r = await fetch(`/api/bgg/search?q=${encodeURIComponent(q)}${ext ? '&ext=1' : ''}`);
  if (!r.ok) throw new Error('search');
  return ((await r.json()).results ?? []) as ResultatBgg[];
}
async function apercu(bggId: number): Promise<FicheLigne> {
  const r = await fetch(`/api/bgg/thing?id=${bggId}&cover=0`);
  if (!r.ok) throw new Error('thing');
  return (await r.json()) as FicheLigne;
}
async function envoyer(method: 'POST' | 'PATCH', corps: unknown): Promise<Donnees> {
  const r = await fetch('/api/import', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  if (!r.ok) throw new Error('import');
  return (await r.json()) as Donnees;
}

export default function ImportCsvClient({ me }: { me: UserLite }) {
  const router = useRouter();
  const { lang, t } = useI18n();
  const [charge, setCharge] = useState(false);
  const [info, setInfo] = useState<ImportInfo | null>(null);
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [neuf, setNeuf] = useState(false); // import précédent terminé et vu : on repart d'un fichier
  const [error, setError] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<'tous' | 'choisir' | 'chercher'>('tous');
  const [ouverte, setOuverte] = useState<number | null>(null);
  const statutPrec = useRef<string | null>(null);

  function appliquer(d: Donnees) {
    setInfo(d.import); setLignes(d.lignes);
    // Ajout terminé sous nos yeux : bilan vu, ludothèque à jour.
    const st = d.import?.statut ?? null;
    if (st === 'fini' && statutPrec.current && statutPrec.current !== 'fini') { void envoyer('PATCH', { vu: true }).catch(() => {}); router.refresh(); }
    statutPrec.current = st;
  }
  async function relire() {
    try { const r = await fetch('/api/import'); if (r.ok) appliquer(await r.json()); } catch { /* prochain tour */ }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/import');
        if (r.ok) {
          const d = (await r.json()) as Donnees;
          if (d.import?.statut === 'fini') { if (d.import.vu) setNeuf(true); else void envoyer('PATCH', { vu: true }).catch(() => {}); }
          statutPrec.current = d.import?.statut ?? null;
          setInfo(d.import); setLignes(d.lignes);
        }
      } finally { setCharge(true); }
    })();
  }, []);

  // Le serveur avance seul : on relit toutes les 2 s tant qu'il cherche ou ajoute.
  const statut = info?.statut;
  useEffect(() => {
    if (statut !== 'recherche' && statut !== 'ajout') return;
    const id = setInterval(() => void relire(), 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statut]);

  async function agir(corps: unknown) {
    setError(null);
    try { appliquer(await envoyer('PATCH', corps)); } catch { setError(t('bgg.errPasReponse')); }
  }
  /** Décision sur une ligne : affichée tout de suite, confirmée par le serveur. */
  function decider(i: number, patch: Partial<LigneImport>, corps: Record<string, unknown>) {
    setLignes((ls) => ls.map((l) => (l.i === i ? { ...l, ...patch } : l)));
    void agir({ ligne: i, ...corps });
  }

  async function lireFichier(file: File | undefined) {
    if (!file) return;
    setError(null);
    const lu = lireFichierMyludo(await file.text());
    if ('erreur' in lu) {
      setError(t(lu.erreur === 'csv' ? 'csv.errFormat' : lu.erreur === 'jsonIllisible' ? 'csv.errJsonIllisible' : 'csv.errJsonPasMyludo'));
      return;
    }
    try {
      appliquer(await envoyer('POST', { nom: file.name, format: lu.format, lignes: lu.lignes, ext: false, fmt: 'grand' }));
      setNeuf(false); setFiltre('tous');
    } catch { setError(t('import.errLectureLudo')); }
  }

  async function abandonner(confirmer: boolean) {
    if (confirmer && !window.confirm(t('csv.abandonnerConfirm'))) return;
    await fetch('/api/import', { method: 'DELETE' }).catch(() => {});
    setInfo(null); setLignes([]); statutPrec.current = null;
  }

  const ext = info?.ext ?? false;
  const fmt = (info?.fmt ?? 'grand') as BoxFormat;
  const c = compter(lignes, ext);
  const { visibles, selection } = c;
  const fini = c.faits === c.tot;
  const aChoisir = (l: LigneImport) => aAgir(l) && l.etat === 'multi';
  const aChercher = (l: LigneImport) => aAgir(l) && l.etat !== 'multi';
  const montrees = filtre === 'choisir' ? visibles.filter(aChoisir) : filtre === 'chercher' ? visibles.filter(aChercher) : visibles;
  const stage = !charge ? null : !info || neuf ? 'fichier' : info.statut === 'fini' ? 'recap' : info.statut === 'ajout' ? 'import' : 'verif';

  const nImp = lignes.filter((l) => l.resultat === 'importe').length;
  const nEnr = lignes.filter((l) => l.resultat === 'enrichi').length;
  const nKo = lignes.filter((l) => l.resultat === 'echec').length;
  const nSans = lignes.filter((l) => l.resultat && l.resultat !== 'echec' && !l.cov).length;

  function texteEtat(l: LigneImport): string {
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
  const classeEtat: Record<EtatLigne, string> = { att: 'att', ok: 'ok', enrichir: 'dup', deja: 'att', doublon: 'att', multi: 'dup', none: 'ko', echec: 'ko' };
  const ligneOuverte = lignes.find((l) => l.i === ouverte);

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
            <input type="file" accept=".csv,.json,text/csv,application/json" aria-label={t('csv.choisir')}
                   onChange={(e) => void lireFichier(e.target.files?.[0])} />
          </label>
          <div className="csv-reconnus">
            <p>{t('csv.formatsReconnus')}</p>
            <div><span>Myludo<small>{t('csv.ouExporter')}</small></span>
              <span className="csv-badge csv">CSV</span><span className="csv-badge json">JSON</span></div>
          </div>
          <p className="help">{t('csv.aide')}</p>
          <Link className="cancel" href="/games/add">{t('import.annuler')}</Link>
        </div>
      )}

      {stage === 'verif' && info && (
        <div>
          <div className="csv-fichier">
            <span aria-hidden>📄</span>
            <span className="t"><b>{info.nom}</b><small>Myludo <span className={`csv-badge ${info.format}`}>{info.format.toUpperCase()}</span> · {t('csv.lignes', { n: lignes.length })}</small></span>
            <button type="button" className="link-btn" onClick={() => void abandonner(true)}>{t('csv.changer')}</button>
          </div>
          {!fini && (
            <div className="csv-bandeau"><span aria-hidden>🛰️</span><span><b>{t('csv.quitterTitre')}</b>{t('csv.quitterTexte')}</span></div>
          )}
          {lignes.some((l) => l.csv.extension) && (
            <button type="button" className="csv-bascule" role="switch" aria-checked={ext} onClick={() => void agir({ ext: !ext })}>
              <span className="t">{t('csv.extensions')}<small>{t('csv.extensionsN', { n: lignes.filter((l) => l.csv.extension).length })}</small></span>
              <span className={`inter${ext ? ' on' : ''}`} aria-hidden />
            </button>
          )}
          <p className="field-label">{t('import.fmtDefaut', { f: formatShort(fmt, lang) })}</p>
          <div className="seg" role="group" aria-label={t('import.fmtGroupeAria')}>
            {FORMATS.map((f) => (
              <button key={f} type="button" className={fmt === f ? 'on' : ''} aria-pressed={fmt === f}
                      onClick={() => { setInfo({ ...info, fmt: f }); void agir({ fmt: f }); }}>
                <span className="box" style={{ width: 9 + 4 * FORMAT_SCALE[f], height: 9 + 4 * FORMAT_SCALE[f] }} />
                <span className="lbl">{formatShort(f, lang)}</span>
              </button>
            ))}
          </div>
          <p className="imp-num csv-avance">
            <span>{fini ? t('csv.rechercheFinie') : t('csv.rechercheEnCours')}</span><span>{c.faits} / {c.tot}</span>
          </p>
          <div className="imp-barre"><div className="fill" style={{ width: `${c.faits * 100 / Math.max(c.tot, 1)}%` }} /></div>
          <div className="csv-filtres">
            <button type="button" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}>{t('csv.filtreTous')} <span>{c.tot}</span></button>
            <button type="button" aria-pressed={filtre === 'choisir'} className={c.choisir ? 'ambre' : ''} onClick={() => setFiltre('choisir')}>{t('csv.filtreAgir')} <span>{c.choisir}</span></button>
            <button type="button" aria-pressed={filtre === 'chercher'} className={c.chercher ? 'rouge' : ''} onClick={() => setFiltre('chercher')}>{t('csv.filtreIntrouvables')} <span>{c.chercher}</span></button>
          </div>
          {montrees.length === 0 && <p className="imp-sous csv-rien">{t(filtre === 'chercher' ? 'csv.toutTrouve' : 'csv.rienAVerifier')}</p>}
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
                            onClick={() => decider(l.i, { coche: !l.coche }, { coche: !l.coche })}>✓</button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="imp-bas">
            <button type="button" className="link-btn csv-abandon" onClick={() => void abandonner(true)}>{t('csv.abandonner')}</button>
            <button type="button" className="btn-go" disabled={!fini || selection.length === 0} onClick={() => void agir({ ajouter: true })}>
              {!fini ? t('csv.rechercheEnCours') : selection.length === 0 ? t('import.rienAImporter') : t('csv.ajouterN', { n: selection.length })}
            </button>
          </div>
        </div>
      )}

      {stage === 'import' && (
        <div>
          <p className="imp-encours">{t('csv.ajoutEnCours')}</p>
          <div className="imp-barre"><div className="fill" style={{ width: `${c.ajoutes * 100 / Math.max(c.aAjouter, 1)}%` }} /></div>
          <p className="imp-num">{c.ajoutes} / {c.aAjouter} · {t('csv.ajoutQuitter')}</p>
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
            <button type="button" className="btn-ressayer" onClick={() => void agir({ reessayer: true })}>{t('import.reessayer')}</button>
          )}
          <Link className="btn-go as-link" href="/library">{t('ludotheque.voir')}</Link>
        </div>
      )}

      {ligneOuverte && (
        <Choix ligne={ligneOuverte} onFermer={() => setOuverte(null)}
               onChoisir={async (bggId) => { await agir({ ligne: ligneOuverte.i, bggId }); setOuverte(null); }}
               onSansCov={() => { decider(ligneOuverte.i, { etat: 'none', fiche: null, coche: true, resolu: true }, { sansCov: true }); setOuverte(null); }}
               onExclure={() => { decider(ligneOuverte.i, { coche: false }, { coche: false }); setOuverte(null); }} />
      )}
    </div>
  );
}

/** Bottom-sheet : choisir parmi les résultats BGG, ou chercher sous un autre titre. */
function Choix({ ligne, onFermer, onChoisir, onSansCov, onExclure }: {
  ligne: LigneImport; onFermer: () => void; onChoisir: (bggId: number) => Promise<void>; onSansCov: () => void; onExclure: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState(ligne.csv.titre);
  const [cands, setCands] = useState<ResultatBgg[]>(ligne.candidats);
  const [apercus, setApercus] = useState<Record<number, FicheLigne>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Miniatures des candidats, une par une (BGG ~1 requête/s, cache 30 jours côté serveur).
  useEffect(() => {
    let actif = true;
    (async () => {
      for (const c of cands.slice(0, 6)) {
        if (!actif) return;
        try { const f = await apercu(c.bggId); if (actif) setApercus((p) => ({ ...p, [c.bggId]: f })); } catch { /* sans miniature */ }
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
    try { await onChoisir(c.bggId); } catch { setErr(t('bgg.errPasReponse')); setBusy(false); }
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
