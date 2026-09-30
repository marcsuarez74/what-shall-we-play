'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, FORMAT_LABEL } from '@/lib/formats';

interface Suggestion { bggId: number; name: string; }
const FIELDS = [
  ['year', 'Année'], ['publisher', 'Éditeur'], ['min_players', 'Joueurs min'],
  ['max_players', 'Joueurs max'], ['playtime_min', 'Durée (min)'], ['weight', 'Poids (0-5)'],
] as const;

export default function AddGameForm() {
  const router = useRouter();
  const [q, setQ] = useState(''); const [results, setResults] = useState<Suggestion[]>([]);
  const [bggError, setBggError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({ title: '', box_format: 'grand' });
  const [file, setFile] = useState<File | null>(null);
  const [coverName, setCoverName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  async function search() {
    setBggError(null);
    const res = await fetch(`/api/bgg/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) { setBggError((await res.json()).error); return; }
    setResults((await res.json()).results);
  }
  async function pick(s: Suggestion) {
    setValues((v) => ({ ...v, title: s.name, bgg_id: String(s.bggId) }));
    const res = await fetch(`/api/bgg/thing?id=${s.bggId}`).catch(() => null);
    if (!res || !res.ok) return; // BGG indisponible : les champs restent à remplir à la main
    const t = (await res.json()) as Record<string, unknown>;
    setCoverName(typeof t.coverName === 'string' ? t.coverName : null);
    const str = (x: unknown) => (x == null ? undefined : String(x));
    setValues((v) => ({
      ...v,
      title: str(t.title) ?? s.name, bgg_id: str(t.bggId) ?? String(s.bggId),
      year: str(t.year) ?? v.year, publisher: str(t.publisher) ?? v.publisher,
      min_players: str(t.minPlayers) ?? v.min_players, max_players: str(t.maxPlayers) ?? v.max_players,
      playtime_min: str(t.playtimeMin) ?? v.playtime_min, weight: str(t.weight) ?? v.weight,
      bgg_rating: str(t.rating) ?? v.bgg_rating,
    }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('cover', file);
    if (coverName) fd.append('cover_name', coverName);
    const res = await fetch('/api/games', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    router.push('/etagere'); router.refresh();
  }

  return (
    <form onSubmit={submit} className="add-form">
      <h1>Ajouter un jeu</h1>
      <div className="search-row">
        <input placeholder="Chercher sur BoardGameGeek…" value={q}
               onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={search}>Chercher</button>
      </div>
      {bggError && <p className="hint" role="alert">{bggError}</p>}
      {results.length > 0 && (
        <ul className="suggestions">
          {results.slice(0, 8).map((s) => (
            <li key={s.bggId}><button type="button" onClick={() => pick(s)}>{s.name}</button></li>
          ))}
        </ul>
      )}
      <label>Titre
        <input required value={values.title}
               onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
      </label>
      <label>Format de boîte
        <select value={values.box_format}
                onChange={(e) => setValues((v) => ({ ...v, box_format: e.target.value }))}>
          {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
        </select>
      </label>
      {FIELDS.map(([k, label]) => (
        <label key={k}>{label}
          <input inputMode="decimal" value={values[k] ?? ''}
                 onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
        </label>
      ))}
      <label>Pochette (optionnel)
        <input type="file" accept=".jpg,.jpeg,.png,.webp"
               onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Enregistrement…' : 'Ajouter à ma bibliothèque'}</button>
    </form>
  );
}
