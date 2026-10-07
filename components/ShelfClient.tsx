'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { coverSrc } from '@/lib/formats';
import { titrePartie, formatDate } from '@/lib/i18n/format';
import type { Game, Night, UserLite } from '@/lib/types';
import type { ShelfVeto, ShelfVote } from '@/lib/nights';
import { filterShelf, filtresActifs, type ShelfFilters } from '@/lib/filters';
import { DURATIONS } from './ShelfControls';
import type { CléDict } from '@/lib/i18n';
import GameSheet from './GameSheet';
import NightPicker from './NightPicker';
import PlayerChip from './PlayerChip';
import RetirerInvite from './RetirerInvite';
import ShelfControls from './ShelfControls';
import ShelfRows, { grouperVotes } from './ShelfRows';
import LienInvitation from './LienInvitation';
import ShelfPicker from './ShelfPicker';
import UserMenu from './UserMenu';
import { useI18n } from './LanguageProvider';

// v3.0.0 — l'étagère EST la sélection : plus d'appui maintenu ni de compteur.
// Le tirage se fait parmi toutes les boîtes. Chacun VALIDE quand sa sélection
// est complète (signal partagé, pas verrou) ; le créateur lance, il voit qui
// est prêt — un appui si tout le monde a validé, double-appui « Sûr ? » sinon.
// v3.3 — la carte porte l'ÉTAT de la partie (badge), et une fois la boîte
// sortie (en_jeu) l'étagère gèle : bandeau vert, plus d'ajout ni de validation.
// v4.7.0 — l'étagère s'ouvre aussi sur une partie programmée (futur) : ajouts et
// votes à l'avance, tirage fermé jusqu'au jour J. Les invités sont un groupe à part
// (ils ne valident pas de sélection) ; le créateur partage le lien d'invitation.
// v4.12.0 — libellés de complexité pour la ligne « Filtres actifs ».
const POIDS: Record<Exclude<ShelfFilters['weight'], 'all'>, CléDict> = {
  leger: 'etagere.poidsLeger', moyen: 'etagere.poidsMoyen', lourd: 'etagere.poidsLourd',
};

export default function ShelfClient({ night, partyGame, players, games, myLibrary, users, plays, votes, vetos = [], me, futur = false, lien, evenements = [] }: {
  night: Night; partyGame: Game | null; players: UserLite[]; games: Game[]; myLibrary: Game[]; users: UserLite[]; plays: Record<number, number>;
  votes: ShelfVote[];
  vetos?: ShelfVeto[]; // v4.13.0
  evenements?: { id: number; titre: string }[]; // v4.15.0 : rattacher la partie (Modifier)
  me: UserLite;
  futur?: boolean;
  lien?: string;
}) {
  const router = useRouter();
  const { lang, t } = useI18n();
  const [detail, setDetail] = useState<Game | null>(null);
  const [editingNight, setEditingNight] = useState(false);
  const [addingGames, setAddingGames] = useState(false);
  const [sur, setSur] = useState(false); // double-appui « Sûr ? Lancer »
  const [busy, setBusy] = useState(false);
  const [pool, setPool] = useState<'tous' | 'votes'>('tous'); // choix du pool : état client, jamais stocké
  // Aucun filtre appliqué par défaut : l'étagère montre toute la collection.
  const [filters, setFilters] = useState<ShelfFilters>({
    q: '', players: null, weight: 'all', duration: 'all', format: 'all',
  });
  const filtered = useMemo(() => filterShelf(games, filters), [games, filters]);
  // v4.12.0 — les filtres bornent la roue ; la recherche non (elle sert à retrouver une boîte).
  // v4.13.0 — veto : jeu → prénom de qui l'a écarté ; un jeu vetoé sort du pool (Tous et Votés).
  const vetoParJeu = useMemo(() => new Map(vetos.map((v) => [v.game_id, v.pseudo.split(' ')[0]])), [vetos]);
  const monVeto = vetos.find((v) => v.user_id === me.id)?.game_id ?? null;
  const enLice = useMemo(() => filterShelf(games, { ...filters, q: '' }).filter((g) => !vetoParJeu.has(g.id)),
    [games, filters, vetoParJeu]);
  const nbFiltres = filtresActifs(filters);
  const enJeu = night.status === 'en_jeu';
  // En jeu : LA boîte de la partie a quitté l'étagère — elle ne revient pas dans les rangées.
  const surEtagere = useMemo(() => filtered.filter((g) => g.id !== partyGame?.id), [filtered, partyGame]);

  // v3.5 — votes de la partie, vus par boîte : total, c'est MON vote, prénoms.
  const votesParJeu = useMemo(() => grouperVotes(votes, me.id), [votes, me.id]);

  // v3.5 — les boîtes qui portent au moins un vote : le pool « Votés 👍 ».
  const jeuxVotes = useMemo(
    () => games.filter((g) => (votesParJeu.get(g.id)?.total ?? 0) > 0),
    [games, votesParJeu],
  );
  const votesEnLice = useMemo(() => enLice.filter((g) => (votesParJeu.get(g.id)?.total ?? 0) > 0), [enLice, votesParJeu]);
  const cover = partyGame ? coverSrc(partyGame) : null;

  const estCreateur = night.creator_id === me.id;
  const monEtat = players.find((p) => p.id === me.id);
  const jAiValide = !!monEtat?.validated_at;
  // hors branche du créateur validé, le pool vaut toujours « tous » (garde anti-état fantôme)
  const poolActif = jAiValide ? pool : 'tous';
  // v4.12.0 — ce que la roue tirera : jeux filtrés, votés si « Votés 👍 » (sinon tous les filtrés).
  const tirables = poolActif === 'votes' && votesEnLice.length > 0 ? votesEnLice : enLice;
  const resumeFiltres = [
    filters.players != null ? t('etagere.nbJoueurs', { n: filters.players }) : null,
    filters.weight !== 'all' ? t(POIDS[filters.weight]) : null,
    filters.duration !== 'all' ? `${DURATIONS.find(([v]) => v === filters.duration)?.[1]} min` : null,
  ].filter(Boolean).join(' · ');
  const statutFiltres = estCreateur && (nbFiltres > 0 || vetoParJeu.size > 0) && (
    <p className="cta-statut">
      {tirables.length === 0
        ? t(nbFiltres > 0 ? 'etagere.aucunJeuFiltres' : 'veto.tousEcartes')
        : [nbFiltres > 0 ? t('etagere.filtresActifs', { f: resumeFiltres }) : null,
           vetoParJeu.size > 0 ? t('veto.nEcartes', { n: vetoParJeu.size }) : null].filter(Boolean).join(' — ')}
    </p>
  );
  const comptes = players.filter((p) => !p.est_invite);
  const invites = players.filter((p) => p.est_invite);
  // les invités ne valident pas de sélection : seuls les comptes comptent pour « prêts »
  const enAttente = comptes.filter((p) => !p.validated_at);
  const tousPrets = comptes.length > 0 && enAttente.length === 0;
  const prenom = (p: UserLite) => p.pseudo.split(' ')[0];

  async function valider() {
    setBusy(true);
    await fetch(`/api/nights/${night.id}/validate`, { method: 'POST' });
    setBusy(false);
    setSur(false);
    router.refresh();
  }
  function lancer() {
    if (tirables.length === 0) return;
    // La liste du pool est recalculée à chaque rendu : une boîte votée retirée ou dé-votée
    // au même moment (sync live) ne peut pas glisser un id fantôme dans ?games=.
    const ids = tirables.map((g) => g.id);
    // Navigation document (et non router.push) : le refresh du sync live qui
    // tombe au même moment pouvait annuler le push doux — on restait sur
    // l'étagère, bouton armé, sans erreur (flake CI v3.3). Le tirage est un
    // écran plein : le rechargement complet y est invisible et sans course.
    window.location.assign(`/tirage/${night.id}?games=${ids.join(',')}`);
  }
  function clicLancer() {
    if (!tousPrets && !sur) { setSur(true); return; } // il manque du monde : « Sûr ? »
    lancer();
  }
  // si tout le monde devient prêt entre-temps (sync live), le « Sûr ? » s'efface
  const surAffiche = sur && !tousPrets;

  async function voter(gameId: number) {
    await fetch(`/api/nights/${night.id}/votes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    router.refresh();
  }

  async function veto(gameId: number) {
    await fetch(`/api/nights/${night.id}/veto`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    setDetail(null);
    router.refresh();
  }

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
        <h1>{t('etagere.titre')}</h1>
        <UserMenu me={me} />
      </header>
      {futur && <Link className="link-btn retour-parties" href="/nights">{t('etagere.retourParties')}</Link>}
      <section className={'night-card' + (enJeu ? ' enjeu' : '')}>
        <div className="night-card-head">
          {enJeu
            ? <span className="badge-etat b-enjeu"><span className="pt" />{t('etagere.enJeu')}</span>
            : futur
              ? <span className="badge-etat b-prog"><span className="pt" />{t('soiree.badgeProgrammee')}</span>
              : <span className="badge-etat b-prep"><span className="pt" />{t('etagere.enPrep')}</span>}
          {!enJeu && <button type="button" className="link-btn" onClick={() => setEditingNight(true)}>{t('etagere.modifier')}</button>}
        </div>
        {(night.titre || futur) && <p className="nc-titre">{titrePartie(lang, night)}</p>}
        {enJeu && partyGame && (
          <div className="bandeau v">
            <span className="b-cov">{cover ? <img src={cover} alt="" /> : '📦'}</span>
            <div><b>{t('etagere.sortie', { j: partyGame.title })}</b></div>
          </div>
        )}
        {!enJeu && (
          <>
            {invites.length > 0 && <p className="sous-label">{t('etagere.joueursN', { n: comptes.length })}</p>}
            <div className="chips">
              {/* programmée : pas de tirage, donc pas de « prêt » à signaler */}
              {comptes.map((p) => <PlayerChip key={p.id} u={p} etat={futur ? undefined : p.validated_at ? 'ok' : 'attente'} />)}
            </div>
            {invites.length > 0 && (
              <>
                <p className="sous-label">{t('etagere.invitesN', { n: invites.length })}</p>
                <div className="chips">
                  {invites.map((p) => (
                    <span key={p.id} className="chip-groupe">
                      <PlayerChip u={p} />
                      {estCreateur ? <RetirerInvite nightId={night.id} inviteId={p.id} nom={p.pseudo} /> : null}
                    </span>
                  ))}
                </div>
              </>
            )}
            {!futur && <div className="etats">
              {comptes.map((p) => (
                <p key={p.id} className={p.validated_at ? 'ok' : ''}>
                  {p.validated_at
                    ? t('etagere.aValide', { p: prenom(p) })
                    : t('etagere.pasEncore', { p: prenom(p) })}
                </p>
              ))}
            </div>}
            {estCreateur && lien && (
              <LienInvitation lien={lien} partage={{
                dateLong: formatDate(lang, `${night.played_at}T12:00:00`, { dateStyle: 'long' }),
                time: night.start_time ? formatDate(lang, `${night.played_at}T${night.start_time}`, { timeStyle: 'short' }) : null,
                pseudos: players.map((p) => p.pseudo), titre: night.titre,
              }} />
            )}
          </>
        )}
      </section>
      {games.length > 0 && (
        <ShelfControls filters={filters} setFilters={setFilters} visible={filtered.length} total={games.length}
                       suggestJoueurs={enJeu ? undefined : players.length} />
      )}
      {games.length === 0 ? (
        <section className="empty-shelf">
          <div className="big" aria-hidden="true">📦</div>
          <h3>{t('etagere.vide')}</h3>
          <p>{t('etagere.videTexte')}</p>
          <button type="button" className="btn-copper" onClick={() => setAddingGames(true)}>
            {t('etagere.ajouterLudo')}
          </button>
          <p className="hint">{t('etagere.videHint')}</p>
        </section>
      ) : !enJeu ? (
        <div className="add-more">
          <button type="button" className="link-btn" onClick={() => setAddingGames(true)}>
            {t('etagere.ajouterAutres')}{jAiValide ? <span className="revalide"> {t('etagere.revalider')}</span> : null}
          </button>
        </div>
      ) : null}
      <ShelfRows games={surEtagere} votes={enJeu ? null : votesParJeu} onVote={voter} onOpen={setDetail} vetos={enJeu ? null : vetoParJeu} />
      <div className="cta-zone">
        {futur ? (
          <p className="cta-jourj">{t('etagere.tirageJourJ')}</p>
        ) : enJeu ? (
          <>
            <div className="cta-row">
              {estCreateur
                ? <a className="btn-copper pret" href={`/nights/${night.id}/scores`}>{t('etagere.finPartie')}</a>
                : <span className="lance-par">{t('etagere.enJeuSortie')}</span>}
            </div>
            <p className="cta-statut">{partyGame?.title} · {t('etagere.nbJoueurs', { n: players.length })}</p>
          </>
        ) : jAiValide ? (
          <>
            <div className="cta-row">
              {estCreateur && jeuxVotes.length > 0 ? (
                <div className="choix-pool" role="radiogroup" aria-label={t('etagere.poolLabel')}>
                  <button type="button" className={poolActif === 'tous' ? 'actif' : ''} onClick={() => setPool('tous')}>
                    {t('etagere.tous')}<span className="n">{enLice.length}</span>
                  </button>
                  <button type="button" className={poolActif === 'votes' ? 'actif' : ''} onClick={() => setPool('votes')}>
                    {t('etagere.votesPool')}<span className="n">{votesEnLice.length}</span>
                  </button>
                </div>
              ) : (
                <span className="pill-ok" aria-label={t('etagere.selectionOk')}>{t('etagere.validee')}</span>
              )}
              {estCreateur && games.length > 0 ? (
                <button type="button" className={`btn-copper ${tousPrets ? 'pret' : ''}`} onClick={clicLancer}
                        disabled={tirables.length === 0}>
                  {surAffiche ? t('etagere.surLancer') : t('etagere.lancer', { n: tirables.length })}
                </button>
              ) : (
                !estCreateur && (
                  <span className="lance-par">{t('etagere.lancementPar')} <b>{prenom(players.find((p) => p.id === night.creator_id) ?? me)}</b></span>
                )
              )}
            </div>
            {estCreateur && games.length > 0 && !tousPrets && (
              <p className="cta-statut">
                {t('etagere.prets', { ok: players.length - enAttente.length, total: players.length })} — <b>{enAttente.map((p) => prenom(p)).join(', ')}</b> {t('etagere.pasEncoreValide', { n: enAttente.length })}
              </p>
            )}
            {statutFiltres}
          </>
        ) : (
          <>
            <div className="cta-row">
              <button type="button" className="btn-copper" disabled={busy} onClick={valider}>
                {busy ? t('etagere.enregistrement') : t('etagere.valider')}
              </button>
              {estCreateur && games.length > 0 && (
                <button type="button" className="btn-ghost lancer-sec" onClick={clicLancer} disabled={tirables.length === 0}>
                  {surAffiche ? t('etagere.surLancer') : t('etagere.lancer', { n: tirables.length })}
                </button>
              )}
            </div>
            {statutFiltres}
          </>
        )}
      </div>
      {detail && <GameSheet game={detail} players={players} playsCount={plays[detail.id] ?? 0}
                            onClose={() => setDetail(null)}
                            onRemoveShelf={() => removeFromNight(detail)}
                            veto={enJeu ? undefined : {
                              par: vetoParJeu.get(detail.id) ?? null, moi: monVeto === detail.id,
                              ailleurs: monVeto != null && monVeto !== detail.id ? games.find((g) => g.id === monVeto)?.title ?? null : null,
                              onToggle: () => veto(detail.id),
                            }} />}
      {addingGames && (
        <ShelfPicker nightId={night.id} myLibrary={myLibrary}
                     shelfIds={games.map((g) => g.id)} onClose={() => setAddingGames(false)} />
      )}
      {editingNight && (
        <div className="sheet-backdrop" onClick={() => setEditingNight(false)}>
          <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label={t('etagere.modifierPartie')}
               onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sheet-close" aria-label={t('etagere.fermer')} onClick={() => setEditingNight(false)}>✕</button>
            <NightPicker users={users} prechecked={players.map((p) => p.id)} night={night} meId={me.id}
                         editInfos={estCreateur ? { futur } : undefined}
                         evenements={estCreateur ? evenements : []}
                         onClose={() => setEditingNight(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
