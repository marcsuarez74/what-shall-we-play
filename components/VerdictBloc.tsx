'use client';
// Le verdict 😍🙂😐 : 3 pastilles géantes, révocables, compteurs du groupe (sans
// attribution). Pattern du vote étagère (ShelfClient.voter) : POST mince → router.refresh().
// Choix simple assumé : l'affichage (pastille pressée, confirmation, compteurs) est
// DÉRIVÉ des props du rendu serveur, source de vérité — pas de cache optimiste à
// resynchroniser (source de courses avec UserSync). Chaque clic re-POST : l'upsert
// de poserVerdict (UNIQUE par nuit+joueur) rend les re-clics idempotents.
import { useRouter } from 'next/navigation';

type Verdict = 'adore' | 'bien' | 'neutre';
const PASTILLES: { v: Verdict; emo: string; lbl: string; aria: string }[] = [
  { v: 'adore', emo: '😍', lbl: 'Adoré', aria: 'Verdict : adoré' },
  { v: 'bien', emo: '🙂', lbl: 'Bien', aria: 'Verdict : bien' },
  { v: 'neutre', emo: '😐', lbl: 'Neutre', aria: 'Verdict : neutre' },
];

export default function VerdictBloc({ nightId, titreJeu, initial, compteurs }: {
  nightId: number; titreJeu: string;
  initial: Verdict | null;
  compteurs: { adore: number; bien: number; neutre: number };
}) {
  const router = useRouter();

  async function voter(v: Verdict) {
    await fetch(`/api/nights/${nightId}/verdict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict: v }),
    });
    router.refresh(); // le serveur renvoie pastille pressée + compteurs exacts
  }

  return (
    <section className="verdict-bloc" role="group" aria-label="Ton verdict">
      <p className="kicker">Ton verdict</p>
      <p className="verdict-q">Comment tu as trouvé <b>{titreJeu}</b> ?</p>
      <div className="pastilles">
        {PASTILLES.map(({ v, emo, lbl, aria }) => (
          <button key={v} type="button" className="pastille-verdict"
                  aria-pressed={initial === v} aria-label={aria} onClick={() => voter(v)}>
            <span className="emo" aria-hidden="true">{emo}</span>
            <span className="lbl">{lbl}</span>
          </button>
        ))}
      </div>
      {initial ? (
        <p className="verdict-fait">✅ Ton verdict est enregistré — reclique pour changer d&apos;avis.</p>
      ) : (
        <p className="verdict-note">Dis-nous tout — <b>ça pèse doucement</b> sur les futurs tirages
          (au plus ×1,10 entre le plus et le moins aimé). La roue garde sa surprise.</p>
      )}
      <div className="verdict-compteurs">
        <span className="lbl-groupe">La table</span>
        {PASTILLES.map(({ v, emo }) => (
          <span key={v} className={compteurs[v] === 0 ? 'compteur zero' : 'compteur'}>{emo} <b>{compteurs[v]}</b></span>
        ))}
      </div>
    </section>
  );
}
