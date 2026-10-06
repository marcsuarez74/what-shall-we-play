'use client';
import { useEffect, useRef, useState } from 'react';
import { coverSrc } from '@/lib/formats';
import type { Game } from '@/lib/types';

// Pochette d'une boîte : spinner discret pendant le chargement, fondu à l'arrivée.
// Sans pochette : le placeholder ♟ d'origine.
export default function BoxImage({ game }: { game: Game }) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const src = coverSrc(game);
  // Si le cache du service worker sert l'image AVANT l'hydratation, l'événement load
  // a déjà eu lieu : onLoad ne tirera jamais — on rattrape avec img.complete.
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, []);
  if (!src) return <span className="cover-placeholder">♟</span>;
  return (
    <>
      {/* v4.7.3 (audit, point 11) : rangées horizontales → chargées à l'approche de l'écran */}
      <img ref={ref} src={src} alt={game.title} draggable={false} loading="lazy" decoding="async"
           className={loaded ? 'on' : ''} onLoad={() => setLoaded(true)} />
      {!loaded && <span className="box-spin" aria-hidden="true" />}
    </>
  );
}
