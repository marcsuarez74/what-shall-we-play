'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { coverSrc } from '@/lib/formats';
import type { Game } from '@/lib/types';

export default function LibraryClient({ games: initial }: { games: Game[] }) {
  const router = useRouter();
  const [games, setGames] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);

  async function remove(id: number) {
    const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
    if (res.status === 409) { setNotice((await res.json()).error); return; }
    if (res.ok) { setGames((g) => g.filter((x) => x.id !== id)); setNotice(null); }
  }
  async function setFormat(id: number, box_format: string) {
    const res = await fetch(`/api/games/${id}`, { method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ box_format }) });
    if (res.ok) setGames((g) => g.map((x) => x.id === id ? { ...x, box_format: box_format as Game['box_format'] } : x));
    router.refresh();
  }
  return (
    <div>
      <h1>Ma bibliothèque</h1>
      {notice && <p className="hint" role="alert">{notice}</p>}
      {games.length === 0 && <p className="empty">Aucun jeu pour l&apos;instant. Touchez « Ajouter » pour commencer votre étagère.</p>}
      <ul className="library">
        {games.map((g) => (
          <li key={g.id}>
            {coverSrc(g)
              ? <img src={coverSrc(g) as string} alt="" />
              : <div className="cover-placeholder">♟</div>}
            <div>
              <strong>{g.title}</strong>
              <select value={g.box_format} onChange={(e) => setFormat(g.id, e.target.value)}>
                {(['grand','moyen','petit','mini'] as const).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <button onClick={() => remove(g.id)}>Retirer</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
