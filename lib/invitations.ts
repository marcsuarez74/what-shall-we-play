// v4.8.0 — invitations aux parties programmées, et fil d'activité des amis.
// Programmer invite (au lieu d'inscrire) : « Dispo » rend joueur tout de suite,
// « Pas dispo » retire des joueurs ; la réponse se change jusqu'au jour J.
// La partie du jour garde l'inscription directe.
import { getDb } from './db';
import { emitToUsers } from './events';
import { listAmis, listRelations } from './amis';
import { coMembres } from './cercles';
import { getNight, getNightPlayers, setNightPlayers } from './nights';
import { t, type Lang } from './i18n';
import { formatDate, titrePartie } from './i18n/format';
import { notifier } from './push';
import type { Night, UserLite } from './types';

type Res = { ok: true } | { error: string; status: number };
export type EtatInvitation = 'attente' | 'dispo' | 'absent';

// Qui je peux inscrire ou inviter : mes relations (amis + foyer) et les membres de mes cercles.
export function invitables(moi: number): Set<number> {
  return new Set([...listRelations(moi).map((u) => u.id), ...coMembres(moi)]);
}

// Les joueurs d'une partie après modification : ceux déjà là restent possibles,
// les nouveaux doivent m'être liés (jamais un compte inconnu).
export function filtrerJoueurs(moi: number, ids: unknown[], deja: number[] = []): number[] {
  const ok = invitables(moi);
  return [...new Set(ids.map(Number))].filter((id) => id === moi || deja.includes(id) || ok.has(id));
}

// Inviter à une partie programmée. viaCercle : id → cercle par lequel la personne est invitée.
export function inviter(nightId: number, moi: number, ids: number[], viaCercle: Map<number, number> = new Map()): number[] {
  const night = getNight(nightId);
  if (!night) return [];
  const joueurs = getNightPlayers(nightId).map((p) => p.id);
  const cibles = filtrerJoueurs(moi, ids).filter((id) => id !== night.creator_id && !joueurs.includes(id));
  const ins = getDb().prepare('INSERT OR IGNORE INTO night_invites (night_id, user_id, via_cercle) VALUES (?, ?, ?)');
  for (const id of cibles) ins.run(nightId, id, viaCercle.get(id) ?? null);
  emitToUsers(cibles);
  const hote = pseudoDe(night.creator_id);
  void notifier(cibles, 'invitations', (lang) => ({
    titre: t(lang, 'notif.invitation', { p: hote }),
    corps: t(lang, 'notif.invitationCorps', {
      titre: titrePartie(lang, night),
      date: formatDate(lang, `${night.played_at}T${night.start_time ?? '12:00'}`, night.start_time
        ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
        : { weekday: 'short', day: 'numeric', month: 'short' }),
    }),
    url: '/nights', tag: `invitation-${nightId}`,
  }));
  return cibles;
}

// Une invitation se répond tant que la partie n'a pas commencé (jusqu'au jour J inclus).
function ouverte(night: Night | null): night is Night {
  return !!night && night.status === 'creation'
    && (getDb().prepare("SELECT ? >= date('now','localtime') AS o").get(night.played_at) as { o: number }).o === 1;
}

const pseudoDe = (id: number) => (getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(id) as { pseudo: string }).pseudo;

function poser(nightId: number, userId: number, etat: EtatInvitation): void {
  getDb().prepare('UPDATE night_invites SET etat = ? WHERE night_id = ? AND user_id = ?').run(etat, nightId, userId);
  const joueurs = getNightPlayers(nightId).map((p) => p.id).filter((id) => id !== userId);
  setNightPlayers(nightId, etat === 'dispo' ? [...joueurs, userId] : joueurs); // prévient les joueurs
  emitToUsers([userId]);
}

export function repondre(nightId: number, moi: number, reponse: unknown, lang: Lang = 'fr'): Res {
  if (reponse !== 'dispo' && reponse !== 'absent') return { error: t(lang, 'erreurs.requeteInvalide'), status: 400 };
  const night = getNight(nightId);
  const inv = getDb().prepare('SELECT 1 FROM night_invites WHERE night_id = ? AND user_id = ?').get(nightId, moi);
  if (!inv || !ouverte(night)) return { error: t(lang, 'soiree.errPasInvite'), status: 404 };
  poser(nightId, moi, reponse);
  const qui = pseudoDe(moi);
  void notifier([night.creator_id], 'reponses', (lang) => ({
    titre: t(lang, reponse === 'dispo' ? 'notif.dispo' : 'notif.absent', { p: qui }),
    corps: titrePartie(lang, night), url: '/nights', tag: `reponses-${nightId}`,
  }));
  return { ok: true };
}

// L'organisateur inscrit lui-même un invité (« sans réponse » de dernière minute).
export function inscrire(nightId: number, hote: number, userId: number, lang: Lang = 'fr'): Res {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (night.creator_id !== hote) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  const inv = getDb().prepare('SELECT 1 FROM night_invites WHERE night_id = ? AND user_id = ?').get(nightId, userId);
  if (!inv || !ouverte(night)) return { error: t(lang, 'soiree.errPasInvite'), status: 404 };
  poser(nightId, userId, 'dispo');
  return { ok: true };
}

// Retirer des joueurs d'une partie programmée efface aussi leur invitation (geste explicite).
export function oublierInvitations(nightId: number, ids: number[]): void {
  const del = getDb().prepare('DELETE FROM night_invites WHERE night_id = ? AND user_id = ?');
  for (const id of ids) del.run(nightId, id);
}

export type Invitation = Night & {
  etat: EtatInvitation; hote_pseudo: string; hote_sticker: string | null; hote_avatar: string | null;
  via_nom: string | null; nb_invites: number;
};
// Mes invitations sans réponse ou déclinées (une réponse « Dispo » fait passer la partie dans Programmées).
export function mesInvitations(moi: number): Invitation[] {
  return getDb().prepare(`
    SELECT n.*, i.etat, u.pseudo AS hote_pseudo, u.sticker AS hote_sticker, u.avatar_path AS hote_avatar, c.nom AS via_nom,
      (SELECT COUNT(*) FROM night_invites x WHERE x.night_id = n.id) AS nb_invites
    FROM night_invites i JOIN nights n ON n.id = i.night_id JOIN users u ON u.id = n.creator_id
    LEFT JOIN cercles c ON c.id = i.via_cercle
    WHERE i.user_id = ? AND i.etat != 'dispo' AND n.status = 'creation' AND n.played_at >= date('now','localtime')
    ORDER BY n.played_at, n.id`).all(moi) as Invitation[];
}
export function nbInvitationsEnAttente(moi: number): number {
  return (getDb().prepare(`
    SELECT COUNT(*) AS n FROM night_invites i JOIN nights n ON n.id = i.night_id
    WHERE i.user_id = ? AND i.etat = 'attente' AND n.status = 'creation' AND n.played_at >= date('now','localtime')`)
    .get(moi) as { n: number }).n;
}
// Le décompte de l'organisateur : chaque invité et sa réponse.
export function invitesNuit(nightId: number): (UserLite & { etat: EtatInvitation })[] {
  return getDb().prepare(`
    SELECT u.id, u.pseudo, u.sticker, u.avatar_path, i.etat FROM night_invites i JOIN users u ON u.id = i.user_id
    WHERE i.night_id = ? ORDER BY u.pseudo COLLATE NOCASE`).all(nightId) as (UserLite & { etat: EtatInvitation })[];
}

export type Activite = {
  id: number; played_at: string; game_title: string | null; cover_path: string | null; cover_url: string | null;
  amis: string[]; nb: number; gagnant_pseudo: string | null; gagnant_score: number | null;
  verdicts: { adore: number; bien: number; neutre: number };
};
// Lecture seule : les parties terminées des 30 derniers jours où joue au moins un de mes amis.
export function activiteAmis(moi: number): Activite[] {
  const amis = listAmis(moi);
  if (amis.length === 0) return [];
  const db = getDb();
  const ids = amis.map((a) => a.id);
  const marques = ids.map(() => '?').join(',');
  const nuits = db.prepare(`
    SELECT n.id, n.played_at, g.title AS game_title, g.cover_path, g.cover_url,
      (SELECT u.pseudo FROM night_scores ns JOIN users u ON u.id = ns.user_id
        WHERE ns.night_id = n.id AND ns.score IS NOT NULL ORDER BY ns.score DESC, u.pseudo LIMIT 1) AS gagnant_pseudo,
      (SELECT ns.score FROM night_scores ns WHERE ns.night_id = n.id AND ns.score IS NOT NULL ORDER BY ns.score DESC LIMIT 1) AS gagnant_score
    FROM nights n LEFT JOIN games g ON g.id = n.game_id
    WHERE n.status = 'termine' AND n.played_at >= date('now','localtime','-30 days')
      AND EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id IN (${marques}))
    ORDER BY n.played_at DESC, n.id DESC LIMIT 50`).all(...ids) as Omit<Activite, 'amis' | 'nb' | 'verdicts'>[];
  return nuits.map((n) => {
    const joueurs = getNightPlayers(n.id);
    const verdicts = { adore: 0, bien: 0, neutre: 0 };
    for (const v of db.prepare('SELECT verdict, COUNT(*) AS c FROM night_verdicts WHERE night_id = ? GROUP BY verdict').all(n.id) as { verdict: keyof typeof verdicts; c: number }[])
      verdicts[v.verdict] = v.c;
    return { ...n, amis: joueurs.filter((j) => ids.includes(j.id)).map((j) => j.pseudo), nb: joueurs.length, verdicts };
  });
}
