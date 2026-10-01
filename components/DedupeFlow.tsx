'use client';
import { useState } from 'react';
import { coverSrc, FORMAT_SHORT } from '@/lib/formats';
import type { Game } from '@/lib/types';

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

  if (i >= pairs.length) {
    const kept = pairs.length - absorbed;
    return (
      <div className="dedup" role="dialog" aria-modal="true" aria-label="Fusion terminée">
        <div className="done-card">
          <div className="big">🎉</div>
          <h2>Bibliothèques fusionnées</h2>
          <p>{kept} fiche{kept > 1 ? 's' : ''} conservée{kept > 1 ? 's' : ''} · {absorbed} doublon{absorbed > 1 ? 's' : ''} retiré{absorbed > 1 ? 's' : ''}<br />
            <b>{foyerName}</b> — la collection commune est prête.</p>
          <button type="button" className="btn-copper foyer-btn" onClick={onDone}>Voir ma ludothèque</button>
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
    return `${p} partie${p > 1 ? 's' : ''} jouée${p > 1 ? 's' : ''} · ${FORMAT_SHORT[g.box_format]}`;
  };

  return (
    <div className="dedup" role="dialog" aria-modal="true" aria-label="Trier les doublons">
      <div className="dedup-head">
        <h2>{pairs.length} doublon{pairs.length > 1 ? 's' : ''} à trier</h2>
        <p>On fusionne les fiches en une collection — gardez celle que vous préférez, ou les deux.</p>
      </div>
      <div className="steps" aria-hidden="true">{pairs.map((_, j) => <i key={j} className={j <= i ? 'on' : ''} />)}</div>
      <div className="duel">
        {[a, b].map((g, side) => (
          <div key={side} className={`duel-card ${busy ? 'busy' : ''}`}>
            <div className="cover">
              {coverSrc(g)
                ? <img src={coverSrc(g) as string} alt="" />
                : <span className="cover-placeholder" aria-hidden>♟</span>}
              {g.owner_pseudo && <span className="tag">à {g.owner_pseudo}{g.owner_sticker ? ` · ${g.owner_sticker}` : ''}</span>}
            </div>
            <b>{g.title}</b>
            <p className="meta">{meta(g)}</p>
          </div>
        ))}
      </div>
      <div className="duel-choices">
        {a.owner_pseudo && <button type="button" className="choice-a" disabled={busy} onClick={() => pick('a')}>Garder celle de {a.owner_pseudo}</button>}
        {b.owner_pseudo && <button type="button" className="choice-b" disabled={busy} onClick={() => pick('b')}>Garder celle de {b.owner_pseudo}</button>}
        <button type="button" className="choice-both" disabled={busy} onClick={() => pick('both')}>Garder les deux fiches</button>
      </div>
    </div>
  );
}
