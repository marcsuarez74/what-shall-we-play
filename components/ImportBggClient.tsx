'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FORMATS, FORMAT_SCALE, FORMAT_SHORT } from '@/lib/formats';
import { planifierImport, type LigneImport } from '@/lib/import-bgg';
import type { BoxFormat, UserLite } from '@/lib/types';
import UserMenu from './UserMenu';

type Thing = {
  bggId: number; title: string; year: number | null; publisher: string | null;
  minPlayers: number | null; maxPlayers: number | null; playtimeMin: number | null;
  weight: number | null; rating: number | null; designer: string | null;
  artist: string | null; bestPlayers: number | null; coverName: string | null;
};
type Stage = 'pseudo' | 'preview' | 'import' | 'recap';
type Fait = { bggId: number; titre: string; resultat: 'importe' | 'enrichi' | 'echec' };
const CYCLE: Record<BoxFormat, BoxFormat> = { mini: 'petit', petit: 'moyen', moyen: 'grand', grand: 'mini' };

export default function ImportBggClient({ me }: { me: UserLite }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('pseudo');
  const [pseudo, setPseudo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [global, setGlobal] = useState<BoxFormat>('grand');
  const [formats, setFormats] = useState<Record<number, BoxFormat>>({});
  const [modes, setModes] = useState<Record<number, 'enrichir' | 'nouveau'>>({});
  const [inclus, setInclus] = useState<Record<number, boolean>>({});
  const [faits, setFaits] = useState<Fait[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [totalCible, setTotalCible] = useState(0);

  async function fetchCollection() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/bgg/collection?username=${encodeURIComponent(pseudo.trim())}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'BGG ne répond pas'); return; }
      const jeux = (data.jeux ?? []) as LigneImport['jeu'][];
      if (jeux.length === 0) { setError('Aucun jeu possédé sur BGG — vérifie que ta collection est publique.'); return; }
      const res2 = await fetch('/api/games');
      if (!res2.ok) { setError('Impossible de lire ta ludothèque — réessaie'); return; }
      const ludo = ((await res2.json()).games ?? []) as Parameters<typeof planifierImport>[1];
      const l = planifierImport(jeux, ludo);
      setLignes(l);
      const f: Record<number, BoxFormat> = {}, m: Record<number, 'enrichir' | 'nouveau'> = {}, i: Record<number, boolean> = {};
      for (const li of l) { f[li.jeu.bggId] = global; i[li.jeu.bggId] = true; if (li.etat === 'dup-titre') m[li.jeu.bggId] = 'enrichir'; }
      setFormats(f); setModes(m); setInclus(i);
      setStage('preview');
    } catch { setError('BGG ne répond pas'); } finally { setBusy(false); }
  }

  function majGlobal(f: BoxFormat) {
    setGlobal(f);
    setFormats((prev) => { const n = { ...prev }; for (const l of lignes) if (l.etat !== 'dup-bgg' && modes[l.jeu.bggId] !== 'enrichir') n[l.jeu.bggId] = f; return n; });
  }

  const selection = lignes.filter((l) => l.etat !== 'dup-bgg' && inclus[l.jeu.bggId]);

  async function importer(subset?: LigneImport[]) {
    const cible = subset ?? selection;
    setStage('import'); setFaits([]); setError(null); setBusy(true); setTotalCible(cible.length);
    const resultats: Fait[] = [];
    for (const l of cible) {
      setEnCours(l.jeu.titre);
      const mode = l.etat === 'dup-titre' ? (modes[l.jeu.bggId] ?? 'enrichir') : 'nouveau';
      try {
        const res = await fetch(`/api/bgg/thing?id=${l.jeu.bggId}`);
        if (!res.ok) throw new Error('thing');
        const t = (await res.json()) as Thing;
        if (mode === 'enrichir' && l.doublonDe != null) {
          const r = await fetch(`/api/games/${l.doublonDe}/enrichir`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bgg_id: t.bggId, year: t.year, publisher: t.publisher,
              min_players: t.minPlayers, max_players: t.maxPlayers, playtime_min: t.playtimeMin,
              weight: t.weight, bgg_rating: t.rating, designer: t.designer, artist: t.artist,
              best_players: t.bestPlayers, cover_name: t.coverName }) });
          if (!r.ok) throw new Error('enrichir');
          resultats.push({ bggId: l.jeu.bggId, titre: l.jeu.titre, resultat: 'enrichi' });
        } else {
          const fd = new FormData();
          fd.append('title', t.title || l.jeu.titre);
          fd.append('box_format', formats[l.jeu.bggId] ?? global);
          fd.append('bgg_id', String(t.bggId));
          const vals: Record<string, unknown> = { year: t.year, publisher: t.publisher,
            min_players: t.minPlayers, max_players: t.maxPlayers, playtime_min: t.playtimeMin,
            weight: t.weight, bgg_rating: t.rating, designer: t.designer, artist: t.artist,
            best_players: t.bestPlayers };
          for (const [k, v] of Object.entries(vals)) if (v !== null && v !== '') fd.append(k, String(v));
          if (t.coverName) fd.append('cover_name', t.coverName);
          const r = await fetch('/api/games', { method: 'POST', body: fd });
          if (!r.ok) throw new Error('post');
          resultats.push({ bggId: l.jeu.bggId, titre: l.jeu.titre, resultat: 'importe' });
        }
      } catch { resultats.push({ bggId: l.jeu.bggId, titre: l.jeu.titre, resultat: 'echec' }); }
      setFaits([...resultats]);
    }
    setEnCours(null); setBusy(false);
    setStage('recap');
    router.refresh();
  }

  const nImp = faits.filter((f) => f.resultat === 'importe').length;
  const nEnr = faits.filter((f) => f.resultat === 'enrichi').length;
  const nKo = faits.filter((f) => f.resultat === 'echec').length;
  const nDeja = lignes.filter((l) => l.etat === 'dup-bgg').length;

  return (
    <div className="imp-page">
      <div className="page-head">
        <h1>Importer une collection</h1>
        <UserMenu me={me} />
      </div>
      {error && <p className="hint" role="alert">{error}</p>}

      {stage === 'pseudo' && (
        <div className="imp-bloc">
          <p className="imp-sous">Entre ton pseudo BoardGameGeek : les jeux que tu possèdes
          arrivent dans ta ludothèque — titre, année, pochette, joueurs, durée, poids.</p>
          <label htmlFor="imp-pseudo">Pseudo BGG</label>
          <input id="imp-pseudo" value={pseudo} autoComplete="off"
                 onChange={(e) => setPseudo(e.target.value)} placeholder="ex. marcsua74" />
          <p className="help">Ta collection doit être publique sur BGG. Lecture seule :
          rien n&apos;est modifié sur BGG. Import relançable — les jeux déjà présents sont ignorés.</p>
          <button type="button" className="btn-go" disabled={busy || pseudo.trim().length < 1}
                  onClick={fetchCollection}>
            {busy ? 'BGG prépare ta collection…' : 'Récupérer ma collection'}
          </button>
          <Link className="cancel" href="/games/add">‹ Annuler</Link>
        </div>
      )}

      {stage === 'preview' && (
        <div>
          <p className="imp-sous">{lignes.length} jeu{lignes.length > 1 ? 'x' : ''} trouvé{lignes.length > 1 ? 's' : ''} sur BGG — les doublons sont déjà repérés.</p>
          <p className="field-label">Format des boîtes importées · {FORMAT_SHORT[global]} par défaut</p>
          <div className="seg" role="group" aria-label="Format par défaut des boîtes importées">
            {FORMATS.map((f) => (
              <button key={f} type="button" className={global === f ? 'on' : ''} aria-pressed={global === f}
                      onClick={() => majGlobal(f)}>
                <span className="box" style={{ width: 9 + 4 * FORMAT_SCALE[f], height: 9 + 4 * FORMAT_SCALE[f] }} />
                <span className="lbl">{FORMAT_SHORT[f]}</span>
              </button>
            ))}
          </div>
          <ul className="imp-liste">
            {lignes.map((l) => {
              const exclu = !inclus[l.jeu.bggId];
              const mode = modes[l.jeu.bggId] ?? (l.etat === 'dup-titre' ? 'enrichir' : 'nouveau');
              return (
                <li key={l.jeu.bggId} className={`imp-jeu${exclu ? ' exclu' : ''}${l.etat === 'dup-bgg' ? ' fige' : ''}`}>
                  {l.etat !== 'dup-bgg' && (
                    <button type="button" className="puce" aria-pressed={!exclu}
                            aria-label={`Importer ${l.jeu.titre}`}
                            onClick={() => setInclus((p) => ({ ...p, [l.jeu.bggId]: !p[l.jeu.bggId] }))}>✓</button>
                  )}
                  {l.jeu.thumb
                    ? <img className="cover" src={l.jeu.thumb} alt="" />
                    : <span className="cover is-ph" aria-hidden>♟</span>}
                  <span className="mid">
                    <b className="titre">{l.jeu.titre}</b>
                    <span className="meta">{l.jeu.annee ?? '—'}</span>
                    {l.etat === 'dup-bgg' && <span className="badge ok">= Déjà dans ta ludothèque</span>}
                    {l.etat === 'dup-titre' && (
                      <>
                        <span className="badge dup">↻ Doublon probable</span>
                        <span className="choix-dup">
                          <button type="button" className={mode === 'enrichir' ? 'on' : ''} aria-pressed={mode === 'enrichir'}
                                  aria-label={`Enrichir la fiche ${l.jeu.titre}`}
                                  onClick={() => setModes((p) => ({ ...p, [l.jeu.bggId]: 'enrichir' }))}>↻ Enrichir</button>
                          <button type="button" className={mode === 'nouveau' ? 'on nouveau' : ''} aria-pressed={mode === 'nouveau'}
                                  aria-label={`Ajouter ${l.jeu.titre} comme nouveau jeu`}
                                  onClick={() => setModes((p) => ({ ...p, [l.jeu.bggId]: 'nouveau' }))}>＋ Nouveau</button>
                        </span>
                      </>
                    )}
                    {l.etat === 'nouveau' && <span className="badge new">+ Nouveau</span>}
                  </span>
                  {l.etat !== 'dup-bgg' && mode !== 'enrichir' && (
                    <button type="button" className="fmt"
                            aria-label={`Format de ${l.jeu.titre} : ${formats[l.jeu.bggId] ?? global}`}
                            onClick={() => setFormats((p) => ({ ...p, [l.jeu.bggId]: CYCLE[p[l.jeu.bggId] ?? global] }))}>
                      📦 {FORMAT_SHORT[formats[l.jeu.bggId] ?? global]}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="imp-bas">
            <button type="button" className="btn-go" disabled={selection.length === 0 || busy}
                    onClick={() => importer()}>
              {selection.length === 0 ? 'Rien à importer' : `Importer ${selection.length} jeu${selection.length > 1 ? 'x' : ''}`}
            </button>
            <Link className="cancel" href="/games/add">‹ Autre pseudo</Link>
          </div>
        </div>
      )}

      {stage === 'import' && (
        <div>
          <p className="imp-encours">{enCours ? `${enCours}…` : 'Préparation…'}</p>
          <div className="imp-barre"><div className="fill" style={{ width: `${faits.length * 100 / Math.max(totalCible, 1)}%` }} /></div>
          <p className="imp-num">{faits.length} / {totalCible} · ~1 s par jeu</p>
          <ul className="imp-journal">
            {faits.map((f) => (
              <li key={f.bggId} className={f.resultat}>
                <span className="ico">{f.resultat === 'importe' ? '✓' : f.resultat === 'enrichi' ? '↻' : '✕'}</span>
                {f.titre}
                <span className="pourquoi">{f.resultat === 'importe' ? 'importé' : f.resultat === 'enrichi' ? 'fiche enrichie' : 'BGG n\u2019a pas répondu'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage === 'recap' && (
        <div>
          <div className="imp-recap">
            <p className="grand">{nKo > 0 ? '🫤' : '🎉'}</p>
            <h2>{nKo > 0 ? 'Presque tout est importé' : 'Collection importée ✓'}</h2>
          </div>
          <ul className="imp-stats">
            <li className="ok"><span>📥 Jeux importés</span><b>{nImp}</b></li>
            <li className="enr"><span>↻ Fiches enrichies</span><b>{nEnr}</b></li>
            <li className="dup"><span>= Déjà présents</span><b>{nDeja}</b></li>
            {nKo > 0 && <li className="ko"><span>⚠️ Échecs</span><b>{nKo}</b></li>}
          </ul>
          {nKo > 0 && (
            <button type="button" className="btn-ressayer" disabled={busy}
                    onClick={() => importer(lignes.filter((l) => faits.find((f) => f.bggId === l.jeu.bggId)?.resultat === 'echec'))}>
              🔁 Réessayer le jeu en échec
            </button>
          )}
          <Link className="btn-go as-link" href="/library">Voir ma ludothèque</Link>
        </div>
      )}
    </div>
  );
}
