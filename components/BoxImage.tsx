'use client';
import { useState } from 'react';
import { coverSrc } from '@/lib/formats';
import type { Game } from '@/lib/types';

// Pochette d'une boîte : spinner discret pendant le chargement, fondu à l'arrivée.
// Sans pochette : le placeholder ♟ d'origine.
export default function BoxImage({ game }: { game: Game }) {
  const [loaded, setLoaded] = useState(false);
  const src = coverSrc(game);
  if (!src) return <span className="cover-placeholder">♟</span>;
  return (
    <>
      <img src={src} alt={game.title} draggable={false}
           className={loaded ? 'on' : ''} onLoad={() => setLoaded(true)} />
      {!loaded && <span className="box-spin" aria-hidden="true" />}
    </>
  );
}
