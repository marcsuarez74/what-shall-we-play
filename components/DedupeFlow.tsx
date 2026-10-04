'use client';
import { useState } from 'react';
import { coverSrc, formatShort } from '@/lib/formats';
import type { Game } from '@/lib/types';
import { useI18n } from './LanguageProvider';

type GP = Game & { picks?: number };

// Fusion guidée : les doublons détectés à l'adhésion, un à la fois —
// garder la fiche de gauche, de droite, ou les deux. La fiche conservée
// absorbe l'historique de l'autre (côté serveur).
export default function DedupeFlow({ pairs, foyerName, onDone }: {
  pairs: { a: GP; b: GP }[];
  foyerName: string;
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const [absorbed, setAbsorbed] = useState(0);
  const [busy, setBusy] = useState(false);
  const { lang, t } = useI18n();

  if (i >= pairs.length) {
    const kept = pairs.length - absorbed;
    return (
      <div className="dedup" role="dialog" aria-modal="true" aria-label={t('foyer.fusionFinAria')}>
        <div className="done-card">
          <div className="big">🎉</div>
          <h2>{t('foyer.fusionFait')}</h2>
          <p>{t('foyer.fusionBilan', { kept, absorbed })}<br />
            <b>{foyerName}</b>{t('foyer.fusionPrete')}</p>
          <button type="button" className="btn-copper foyer-btn" onClick={onDone}>{t('ludotheque.voir')}</button>
        </div>
      </div>
    );
  }

  const { a, b } = pairs[i];

  async function pick(keep: 'a' | 'b' | 'both') {
    setBusy(true);
    try {
      if (keep !== 'both') {
        const k = keep === 'a' ? a : b;
        const r = keep === 'a' ? b : a;
        await fetch('/api/foyers/dedupe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepId: k.id, removeId: r.id }),
        });
        setAbsorbed((n) => n + 1);
      }
      setI(i + 1);
    } finally {
      setBusy(false);
    }
  }

  const meta = (g: GP) => {
    const p = g.picks ?? 0;
    return t('foyer.doublonMeta', { p, f: formatShort(g.box_format, lang) });
  };

  return (
    <div className="dedup" role="dialog" aria-modal="true" aria-label={t('foyer.doublonAria')}>
      <div className="dedup-head">
        <h2>{t('foyer.doublonTitre', { n: pairs.length })}</h2>
        <p>{t('foyer.doublonTexte')}</p>
      </div>
      <div className="steps" aria-hidden="true">{pairs.map((_, j) => <i key={j} className={j <= i ? 'on' : ''} />)}</div>
      <div className="duel">
        {[a, b].map((g, side) => (
          <div key={side} className={`duel-card ${busy ? 'busy' : ''}`}>
            <div className="cover">
              {coverSrc(g)
                ? <img src={coverSrc(g) as string} alt="" />
                : <span className="cover-placeholder" aria-hidden>♟</span>}
              {g.owner_pseudo && <span className="tag">{t('foyer.doublonChez', { p: g.owner_pseudo, s: g.owner_sticker ?? '' })}</span>}
            </div>
            <b>{g.title}</b>
            <p className="meta">{meta(g)}</p>
          </div>
        ))}
      </div>
      <div className="duel-choices">
        {a.owner_pseudo && <button type="button" className="choice-a" disabled={busy} onClick={() => pick('a')}>{t('foyer.garderDe', { p: a.owner_pseudo })}</button>}
        {b.owner_pseudo && <button type="button" className="choice-b" disabled={busy} onClick={() => pick('b')}>{t('foyer.garderDe', { p: b.owner_pseudo })}</button>}
        <button type="button" className="choice-both" disabled={busy} onClick={() => pick('both')}>{t('foyer.garderDeux')}</button>
      </div>
    </div>
  );
}
