'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, FORMAT_SCALE, FORMAT_LABEL, coverSrc } from '@/lib/formats';
import type { Game, Night, UserLite } from '@/lib/types';
import { filterShelf, type ShelfFilters } from '@/lib/filters';
import GameSheet from './GameSheet';
import NightPicker from './NightPicker';
import PlayerChip from './PlayerChip';
import BoxImage from './BoxImage';
import ShelfControls from './ShelfControls';
import OwnerBadge from './OwnerBadge';
import ShelfPicker from './ShelfPicker';
import UserMenu from './UserMenu';

// v3.0.0 — l'étagère EST la sélection : plus d'appui maintenu ni de compteur.
// Le tirage se fait parmi toutes les boîtes. Chacun VALIDE quand sa sélection
// est complète (signal partagé, pas verrou) ; le créateur lance, il voit qui
// est prêt — un appui si tout le monde a validé, double-appui « Sûr ? » sinon.
// v3.3 — la carte porte l'ÉTAT de la soirée (badge), et une fois la boîte
// sortie (en_jeu) l'étagère gèle : bandeau vert, plus d'ajout ni de validation.
export default function ShelfClient({ night, partyGame, players, games, myLibrary, users, plays, me }: {
  night: Night; partyGame: Game | null; players: UserLite[]; games: Game[]; myLibrary: Game[]; users: UserLite[]; plays: Record<number, number>;
  me: UserLite;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<Game | null>(null);
  const [editingNight, setEditingNight] = useState(false);
  const [addingGames, setAddingGames] = useState(false);
  const [sur, setSur] = useState(false); // double-appui « Sûr ? Lancer »
  const [busy, setBusy] = useState(false);
  // Aucun filtre appliqué par défaut : l'étagère montre toute la collection.
  const [filters, setFilters] = useState<ShelfFilters>({
    q: '', players: null, weight: 'all', duration: 'all', format: 'all',
  });
  const filtered = useMemo(() => filterShelf(games, filters), [games, filters]);
  const enJeu = night.status === 'en_jeu';
  // En jeu : LA boîte de la partie a quitté l'étagère — elle ne revient pas dans les rangées.
  const byFormat = useMemo(() => FORMATS.map((f) => ({ f, list: filtered.filter((g) => g.id !== partyGame?.id && g.box_format === f) })), [filtered, partyGame]);
  const cover = partyGame ? coverSrc(partyGame) : null;

  const estCreateur = night.creator_id === me.id;
  const monEtat = players.find((p) => p.id === me.id);
  const jAiValide = !!monEtat?.validated_at;
  const enAttente = players.filter((p) => !p.validated_at);
  const tousPrets = players.length > 0 && enAttente.length === 0;
  const prenom = (p: UserLite) => p.pseudo.split(' ')[0];

  async function valider() {
    setBusy(true);
    await fetch(`/api/nights/${night.id}/validate`, { method: 'POST' });
    setBusy(false);
    setSur(false);
    router.refresh();
  }
  function lancer() {
    if (games.length === 0) return;
    // Navigation document (et non router.push) : le refresh du sync live qui
    // tombe au même moment pouvait annuler le push doux — on restait sur
    // l'étagère, bouton armé, sans erreur (flake CI v3.3). Le tirage est un
    // écran plein : le rechargement complet y est invisible et sans course.
    window.location.assign(`/tirage/${night.id}?games=${games.map((g) => g.id).join(',')}`);
  }
  function clicLancer() {
    if (!tousPrets && !sur) { setSur(true); return; } // il manque du monde : « Sûr ? »
    lancer();
  }
  // si tout le monde devient prêt entre-temps (sync live), le « Sûr ? » s'efface
  const surAffiche = sur && !tousPrets;

  async function removeFromNight(g: Game) {
    await fetch(`/api/nights/${night.id}/games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: g.id, added: false }),
    });
    setDetail(null);
    router.refresh();
  }

  return (
    <div className="shelf-screen">
      <header className="shelf-header">
        <h1>L&apos;étagère</h1>
        <UserMenu me={me} />
      </header>
      <section className={'night-card' + (enJeu ? ' enjeu' : '')}>
        <div className="night-card-head">
          {enJeu
            ? <span className="badge-etat b-enjeu"><span className="pt" />En jeu</span>
            : <span className="badge-etat b-prep"><span className="pt" />En préparation</span>}
          {!enJeu && <button type="button" className="link-btn" onClick={() => setEditingNight(true)}>modifier</button>}
        </div>
        {enJeu && partyGame && (
          <div className="bandeau v">
            <span className="b-cov">{cover ? <img src={cover} alt="" /> : '📦'}</span>
            <div><b>{partyGame.title} est sortie de l&apos;étagère</b></div>
          </div>
        )}
        {!enJeu && (
          <>
            <div className="chips">
              {players.map((p) => <PlayerChip key={p.id} u={p} etat={p.validated_at ? 'ok' : 'attente'} />)}
            </div>
            <div className="etats">
              {players.map((p) => (
                <p key={p.id} className={p.validated_at ? 'ok' : ''}>
                  {p.validated_at
                    ? <>✓ {prenom(p)} a validé sa sélection</>
                    : <>⏳ {prenom(p)} n&apos;a pas encore validé</>}
                </p>
              ))}
            </div>
          </>
        )}
      </section>
      {games.length > 0 && (
        <ShelfControls filters={filters} setFilters={setFilters} visible={filtered.length} total={games.length} />
      )}
      {games.length === 0 ? (
        <section className="empty-shelf">
          <div className="big" aria-hidden="true">📦</div>
          <h3>L&apos;étagère est vide</h3>
          <p>Ce soir, on met sur l&apos;étagère ce dont on a envie — chacun depuis sa ludothèque, sur son téléphone.</p>
          <button type="button" className="btn-copper" onClick={() => setAddingGames(true)}>
            Ajouter des jeux depuis ma ludothèque
          </button>
          <p className="hint">Les autres joueurs voient le même bouton de leur côté.</p>
        </section>
      ) : !enJeu ? (
        <div className="add-more">
          <button type="button" className="link-btn" onClick={() => setAddingGames(true)}>
            + Ajouter d&apos;autres jeux{jAiValide ? <span className="revalide"> · à re-valider ensuite</span> : null}
          </button>
        </div>
      ) : null}
      {byFormat.map(({ f, list }) => list.length === 0 ? null : (
        <section key={f} className="shelf-block">
          <div className="row" role="list">
            {list.map((g) => (
              <button key={g.id} role="listitem" className={`box ${FORMAT_SCALE[f] < 0.7 ? 'sm' : ''}`}
                      style={{ width: 96 * FORMAT_SCALE[f], height: 96 * FORMAT_SCALE[f] }}
                      onClick={() => setDetail(g)}>
                <BoxImage game={g} />
                {g.owner_pseudo && (
                  <OwnerBadge owner={{ pseudo: g.owner_pseudo, sticker: g.owner_sticker ?? null, avatar_path: g.owner_avatar_path ?? null }} />
                )}
              </button>
            ))}
          </div>
          <div className="rail" />
          <p className="row-label">{FORMAT_LABEL[f]} — on swipe ›</p>
        </section>
      ))}
      <div className="cta-zone">
        {enJeu ? (
          <>
            <div className="cta-row">
              {estCreateur
                ? <a className="btn-copper pret" href={`/nights/${night.id}/scores`}>🏁 Partie terminée</a>
                : <span className="lance-par">En jeu — la boîte est sortie</span>}
            </div>
            <p className="cta-statut">{partyGame?.title} · {players.length} joueurs</p>
          </>
        ) : jAiValide ? (
          <>
            <div className="cta-row">
              <span className="pill-ok" aria-label="sélection validée">✓ Validée</span>
              {estCreateur && games.length > 0 ? (
                <button type="button" className={`btn-copper ${tousPrets ? 'pret' : ''}`} onClick={clicLancer}>
                  {surAffiche ? 'Sûr ? Lancer' : `Lancer · ${games.length}`}
                </button>
              ) : (
                !estCreateur && (
                  <span className="lance-par">Lancement par <b>{prenom(players.find((p) => p.id === night.creator_id) ?? me)}</b></span>
                )
              )}
            </div>
            {estCreateur && games.length > 0 && !tousPrets && (
              <p className="cta-statut">
                {players.length - enAttente.length}/{players.length} prêts — <b>{enAttente.map((p) => prenom(p)).join(', ')}</b> n&apos;a{enAttente.length > 1 ? 'ont' : ''} pas encore validé
              </p>
            )}
          </>
        ) : (
          <div className="cta-row">
            <button type="button" className="btn-copper" disabled={busy} onClick={valider}>
              {busy ? 'Enregistrement…' : 'Valider ma sélection'}
            </button>
            {estCreateur && games.length > 0 && (
              <button type="button" className="btn-ghost lancer-sec" onClick={clicLancer}>
                {surAffiche ? 'Sûr ? Lancer' : `Lancer · ${games.length}`}
              </button>
            )}
          </div>
        )}
      </div>
      {detail && <GameSheet game={detail} players={players} playsCount={plays[detail.id] ?? 0}
                            onClose={() => setDetail(null)}
                            onRemoveShelf={() => removeFromNight(detail)} />}
      {addingGames && (
        <ShelfPicker nightId={night.id} myLibrary={myLibrary}
                     shelfIds={games.map((g) => g.id)} onClose={() => setAddingGames(false)} />
      )}
      {editingNight && (
        <div className="sheet-backdrop" onClick={() => setEditingNight(false)}>
          <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Modifier la partie"
               onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sheet-close" aria-label="Fermer" onClick={() => setEditingNight(false)}>✕</button>
            <NightPicker users={users} prechecked={players.map((p) => p.id)} night={night}
                         onClose={() => setEditingNight(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
