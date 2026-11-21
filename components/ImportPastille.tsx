'use client';
// v4.23.0 — import en tâche de fond (maquette mockup/2026-11-21-v4230-import-fond.html) :
// la pastille au-dessus des onglets suit l'import partout dans l'app ; la carte « Import en
// cours » remplace le lien d'import sur l'onglet Ajouter. Toutes deux ramènent à l'import.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ResumeImport } from '@/lib/import-csv';
import { useI18n } from './LanguageProvider';

/** Résumé de l'import du compte : relu à chaque navigation, et toutes les 3 s tant que le serveur travaille. */
export function useResumeImport(): ResumeImport | null {
  const path = usePathname();
  const [r, setR] = useState<ResumeImport | null>(null);
  const statut = r?.statut;
  useEffect(() => {
    let actif = true;
    const lire = () => fetch('/api/import?resume=1')
      .then((res) => (res.ok ? res.json() : { resume: null }))
      .then((d) => { if (actif) setR(d.resume ?? null); })
      .catch(() => {});
    void lire();
    const id = statut === 'recherche' || statut === 'ajout' ? setInterval(lire, 3000) : undefined;
    return () => { actif = false; if (id) clearInterval(id); };
  }, [path, statut]);
  return r;
}

export default function ImportPastille() {
  const { t } = useI18n();
  const r = useResumeImport();
  if (!r || (r.statut === 'fini' && r.vu)) return null;
  let ico = '📥', texte: string, sous: string | null = null, avance: number | null = null, ambre = false;
  if (r.statut === 'recherche') { texte = t('csv.pRecherche', { f: r.faits, t: r.tot }); avance = r.faits / Math.max(r.tot, 1); }
  else if (r.statut === 'ajout') { ico = '📦'; texte = t('csv.pAjout', { f: r.ajoutes, t: r.aAjouter }); avance = r.ajoutes / Math.max(r.aAjouter, 1); }
  else if (r.statut === 'pret') {
    ambre = r.choisir + r.chercher > 0;
    ico = ambre ? '✋' : '✅';
    texte = ambre ? t('csv.pAgir', { v: r.choisir, x: r.chercher }) : t('csv.pTout');
    sous = t('csv.pToucher');
  } else { ico = '🎉'; texte = t('csv.pFini'); sous = t('csv.pBilan'); }
  return (
    <Link href="/games/import-csv" className={`imp-pastille${ambre ? ' ambre' : ''}`}>
      <span className="ico" aria-hidden>{ico}</span>
      <span className="t">{texte}
        {avance !== null && <span className="mini" aria-hidden><i style={{ width: `${avance * 100}%` }} /></span>}
        {sous && <small>{sous}</small>}
      </span>
      <span className="fl" aria-hidden>›</span>
    </Link>
  );
}

/** Onglet Ajouter : pendant un import, cette carte remplace le lien « Importer un fichier ». */
export function CarteImport({ lien }: { lien: React.ReactNode }) {
  const { t } = useI18n();
  const r = useResumeImport();
  if (!r || r.statut === 'fini') return <>{lien}</>;
  const ligne = r.statut === 'recherche' ? t('csv.carteRecherche', { f: r.faits, t: r.tot })
    : r.statut === 'ajout' ? t('csv.carteAjout', { f: r.ajoutes, t: r.aAjouter })
    : t('csv.carteAgir', { v: r.choisir, x: r.chercher });
  return (
    <div className="imp-carte">
      <div className="l"><b>{t('csv.carteTitre')}</b><span>{r.nom}</span></div>
      <span className="imp-sous">{ligne}</span>
      <Link className="btn-go as-link" href="/games/import-csv">{t('csv.reprendre')}</Link>
    </div>
  );
}
