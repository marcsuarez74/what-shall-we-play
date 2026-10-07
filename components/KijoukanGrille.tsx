'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

const CASES = 14;
// v4.16.0 — la grille Kijoukan : 7 jours × midi / soir. Toucher une case coche ou décoche
// MA disponibilité. Dans un cercle, chaque case montre combien de membres sont dispo
// (couleur plus chaude) et, une fois touchée, qui.
export default function KijoukanGrille({ grille, compte, noms, membres }: {
  grille: string; compte?: number[]; noms?: string[][]; membres?: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [mien, setMien] = useState(grille);
  const [choisie, setChoisie] = useState<number | null>(null);
  const jours = t('kij.jours').split(',');
  const joursLongs = t('kij.joursLongs').split(',');
  const nomCase = (i: number) => `${joursLongs[i % 7]} ${t(i < 7 ? 'kij.midiCourt' : 'kij.soirCourt')}`;

  async function basculer(i: number) {
    const g = mien.slice(0, i) + (mien[i] === '1' ? '0' : '1') + mien.slice(i + 1);
    setMien(g); setChoisie(i);
    await fetch('/api/me/kijoukan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grille: g }) });
    router.refresh();
  }
  // Le compte de la case corrigé de mon geste en attendant le rafraîchissement.
  const n = (i: number) => (compte ? compte[i] + (mien[i] === '1' ? 1 : 0) - (grille[i] === '1' ? 1 : 0) : 0);
  const niveau = (i: number) => (compte && membres ? Math.min(5, Math.ceil((5 * n(i)) / Math.max(1, membres))) : mien[i] === '1' ? 5 : 0);

  return (
    <div className="kij">
      <div className="kij-grille" role="grid" aria-label={t('kij.titre')}>
        <span />
        {jours.map((j, i) => <span key={i} className="kij-k" aria-hidden="true">{j}</span>)}
        {[0, 1].map((ligne) => (
          <div key={ligne} className="kij-ligne" role="row">
            <span className="kij-k">{t(ligne === 0 ? 'kij.midi' : 'kij.soir')}</span>
            {Array.from({ length: 7 }, (_, j) => {
              const i = ligne * 7 + j;
              return (
                <button key={i} type="button" role="gridcell" className={`kij-c h${niveau(i)}${mien[i] === '1' ? ' mien' : ''}`}
                        aria-pressed={mien[i] === '1'} aria-label={nomCase(i)} onClick={() => basculer(i)}>
                  {compte ? (n(i) || '') : (mien[i] === '1' ? '✓' : '')}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {compte && noms && choisie !== null && (
        <p className="hint kij-qui">{t('kij.qui', { c: nomCase(choisie), noms: noms[choisie].join(', ') || t('kij.personne') })}</p>
      )}
    </div>
  );
}
