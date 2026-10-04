'use client';
// Le verdict 😍🙂😐 : 3 pastilles géantes, révocables, compteurs du groupe (sans
// attribution). Pattern du vote étagère (ShelfClient.voter) : POST mince → router.refresh().
// Choix simple assumé : l'affichage (pastille pressée, confirmation, compteurs) est
// DÉRIVÉ des props du rendu serveur, source de vérité — pas de cache optimiste à
// resynchroniser (source de courses avec UserSync). Chaque clic re-POST : l'upsert
// de poserVerdict (UNIQUE par nuit+joueur) rend les re-clics idempotents.
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';
import type { CléDict } from '@/lib/i18n';

type Verdict = 'adore' | 'bien' | 'neutre';
const PASTILLES: { v: Verdict; emo: string; lbl: CléDict; aria: CléDict }[] = [
  { v: 'adore', emo: '😍', lbl: 'verdict.adore', aria: 'verdict.ariaAdore' },
  { v: 'bien', emo: '🙂', lbl: 'verdict.bien', aria: 'verdict.ariaBien' },
  { v: 'neutre', emo: '😐', lbl: 'verdict.neutre', aria: 'verdict.ariaNeutre' },
];

export default function VerdictBloc({ nightId, titreJeu, initial, compteurs }: {
  nightId: number; titreJeu: string;
  initial: Verdict | null;
  compteurs: { adore: number; bien: number; neutre: number };
}) {
  const router = useRouter();
  const { t } = useI18n();

  async function voter(v: Verdict) {
    await fetch(`/api/nights/${nightId}/verdict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict: v }),
    });
    router.refresh(); // le serveur renvoie pastille pressée + compteurs exacts
  }

  return (
    <section className="verdict-bloc" role="group" aria-label={t('verdict.tonVerdict')}>
      <p className="kicker">{t('verdict.tonVerdict')}</p>
      <p className="verdict-q">{t('verdict.questionAvant')}<b>{titreJeu}</b>{t('verdict.questionApres')}</p>
      <div className="pastilles">
        {PASTILLES.map(({ v, emo, lbl, aria }) => (
          <button key={v} type="button" className="pastille-verdict"
                  aria-pressed={initial === v} aria-label={t(aria)} onClick={() => voter(v)}>
            <span className="emo" aria-hidden="true">{emo}</span>
            <span className="lbl">{t(lbl)}</span>
          </button>
        ))}
      </div>
      {initial ? (
        <p className="verdict-fait">{t('verdict.fait')}</p>
      ) : (
        <p className="verdict-note">{t('verdict.noteAvant')}<b>{t('verdict.noteGras')}</b>{t('verdict.noteApres')}</p>
      )}
      <div className="verdict-compteurs">
        <span className="lbl-groupe">{t('verdict.laTable')}</span>
        {PASTILLES.map(({ v, emo }) => (
          <span key={v} className={compteurs[v] === 0 ? 'compteur zero' : 'compteur'}>{emo} <b>{compteurs[v]}</b></span>
        ))}
      </div>
    </section>
  );
}
