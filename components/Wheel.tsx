'use client';
import { coverSrc } from '@/lib/formats';
import type { Game } from '@/lib/types';
import { segmentAngle } from '@/lib/wheel';

// Palette dérivée du design system : cuivre, bois, bleu sourd, vert
const PALETTE = ['#C96F3B', '#5C4230', '#4A6B8A', '#3E9B6E'];
const RADIUS = 0.36; // distance des pochettes au centre (fraction de la roue)

// Wedge SVG entre deux angles (degrés, sens horaire depuis 12 h)
function wedgePath(start: number, end: number): string {
  const pt = (a: number) => {
    const rad = (a * Math.PI) / 180;
    return `${(50 + 50 * Math.sin(rad)).toFixed(3)} ${(50 - 50 * Math.cos(rad)).toFixed(3)}`;
  };
  return `M 50 50 L ${pt(start)} A 50 50 0 0 1 ${pt(end)} Z`;
}

export default function Wheel({ games, rotation }: { games: Game[]; rotation: number }) {
  const count = games.length;
  const seg = segmentAngle(count);
  // Pochettes plus petites que la largeur du segment (corde à la hauteur RADIUS)
  const coverFrac = count === 1 ? 0.3 : Math.min(0.22, 1.8 * RADIUS * Math.sin(Math.PI / count));
  const lift = Math.round((100 * RADIUS) / coverFrac); // translateY(-lift %) = RADIUS

  return (
    <div className="wheel" role="img"
         aria-label={`Roue du tirage — ${count} ${count > 1 ? 'jeux' : 'jeu'} en lice`}>
      <div className="wheel-disc"
           style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 3.5s cubic-bezier(.15,.9,.25,1)' }}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {count === 1
            ? <circle cx="50" cy="50" r="50" fill={PALETTE[0]} />
            : games.map((g, i) => (
                <path key={g.id} d={wedgePath(i * seg, (i + 1) * seg)}
                      fill={PALETTE[i % PALETTE.length]}
                      stroke="rgba(42, 31, 23, 0.6)" strokeWidth="0.4" />
              ))}
        </svg>
        {games.map((g, i) => {
          const a = i * seg + seg / 2; // angle du centre du segment
          const cover = coverSrc(g);
          return (
            <div key={g.id} title={g.title}
                 className="wheel-cover"
                 style={{
                   width: `${coverFrac * 100}%`,
                   height: `${coverFrac * 100}%`,
                   transform: `translate(-50%,-50%) rotate(${a}deg) translateY(-${lift}%) rotate(${-a}deg)`,
                 }}>
              {cover
                ? <img src={cover} alt={g.title} draggable={false} />
                : <span className="cover-placeholder">♟</span>}
            </div>
          );
        })}
      </div>
      <span className="wheel-pointer" aria-hidden="true">▼</span>
      <span className="wheel-hub" aria-hidden="true">♟</span>
    </div>
  );
}
