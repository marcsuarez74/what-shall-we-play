'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, UserLite } from '@/lib/types';
import type { ShelfVeto, ShelfVote } from '@/lib/nights';
import { avatarSrc } from '@/lib/formats';
import { medaille } from '@/lib/ranks';
import ShelfRows, { grouperVotes } from './ShelfRows';
import { votantsDe } from '@/lib/votants';
import GameSheet from './GameSheet';
import PlayerChip from './PlayerChip';
import PinInput from './PinInput';
import BoxImage from './BoxImage';
import LanguageSwitch from './LanguageSwitch';
import { useI18n } from './LanguageProvider';

// Pseudo de compte proposé à partir du prénom d'invité : charset d'inscription
// (lettres, chiffres, @ ! _), accents retirés, 3 à 20 caractères.
function pseudoPropose(nom: string): string {
  const p = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9@!_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
  return p.length >= 3 ? p : (p + '___').slice(0, 3);
}

// v4.7.0 — la vue de l'invité : sa soirée seulement. Il vote, crée un compte
// (même identité, votes gardés) ou se retire (confirmé, ses votes partent avec lui).
export default function InviteSoiree({ night, titre, dateLong, time, hote, players, games, votes, vetos = [], partyGame, plays, classement, me }: {
  night: { id: number; status: 'creation' | 'en_jeu' | 'termine' };
  titre: string; dateLong: string; time: string | null;
  hote: UserLite; players: UserLite[]; games: Game[]; votes: ShelfVote[]; vetos?: ShelfVeto[]; partyGame: Game | null;
  plays: Record<number, number>;
  classement: { pseudo: string; score: number | null; rank: number }[];
  me: { id: number; pseudo: string };
}) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [vue, setVue] = useState<'soiree' | 'compte' | 'retire'>('soiree');
  const [sur, setSur] = useState(false);
  const [pseudo, setPseudo] = useState(() => pseudoPropose(me.pseudo));
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Game | null>(null); // fiche du jeu, en lecture seule
  const votesParJeu = useMemo(() => grouperVotes(votes, me.id), [votes, me.id]);
  // v4.13.0 — l'invité voit les vetos et pose le sien, comme les autres joueurs.
  const vetoParJeu = useMemo(() => new Map(vetos.map((v) => [v.game_id, v.pseudo.split(' ')[0]])), [vetos]);
  const monVeto = vetos.find((v) => v.user_id === me.id)?.game_id ?? null;
  const cle = `wsp_night_${night.id}`;
  const hoteAvatar = avatarSrc(hote);

  async function voter(gameId: number) {
    await fetch(`/api/nights/${night.id}/votes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId }),
    });
    router.refresh();
  }

  async function veto(gameId: number) {
    await fetch(`/api/nights/${night.id}/veto`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId }),
    });
    setDetail(null);
    router.refresh();
  }

  async function seRetirer() {
    if (!sur) { setSur(true); return; }
    setBusy(true);
    const r = await fetch('/api/invite/retirer', { method: 'POST' });
    setBusy(false);
    if (!r.ok) { setErreur((await r.json().catch(() => ({}))).error ?? t('erreurs.impossible')); return; }
    try { localStorage.removeItem(cle); } catch { /* stockage indisponible */ }
    setVue('retire');
  }

  async function creerCompte(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErreur(null);
    const r = await fetch('/api/invite/compte', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pseudo: pseudo.trim(), code }),
    });
    setBusy(false);
    if (!r.ok) { setErreur((await r.json().catch(() => ({}))).error ?? t('erreurs.impossible')); return; }
    // le jeton d'appareil de la soirée devient celui du compte (« se souvenir de moi »)
    try {
      const dt = localStorage.getItem(cle);
      if (dt) { localStorage.setItem('wsp_device_token', dt); localStorage.removeItem(cle); }
    } catch { /* stockage indisponible */ }
    window.location.assign(night.status === 'termine' ? `/nights/${night.id}` : `/etagere?night=${night.id}`);
  }

  const entete = (
    <div className="invite-top">
      <span className="invite-marque">What Shall We Play?</span>
      <LanguageSwitch lang={lang} />
    </div>
  );

  if (vue === 'retire') {
    return (
      <div className="invite-vue">
        {entete}
        <div className="join-hero" aria-hidden="true">👋</div>
        <p className="invite-fin"><b>{t('invite.retireTitre', { hote: hote.pseudo })}</b></p>
        <p className="join-note invite-fin">{t('invite.retireTexte')}</p>
      </div>
    );
  }

  if (vue === 'compte') {
    return (
      <form className="invite-vue" onSubmit={creerCompte}>
        {entete}
        <button type="button" className="link-btn invite-retour" onClick={() => setVue('soiree')}>{t('invite.retour')}</button>
        <h1 className="invite-h1">{t('invite.compteTitre')}</h1>
        <p className="join-note">{t('invite.compteTexte', { hote: hote.pseudo })}</p>
        <label className="invite-champ">{t('auth.pseudo')}
          <input type="text" value={pseudo} maxLength={20} onChange={(e) => setPseudo(e.target.value)} />
          <small>{t('invite.pseudoAide')}</small>
        </label>
        <span className="pin-label">{t('auth.codeSecret')}</span>
        <PinInput label={t('auth.codeSecretLabel')} value={code} onChange={setCode} autoComplete="new-password" />
        {erreur && <p role="alert" className="join-erreur">{erreur}</p>}
        <button type="submit" className="btn-copper" disabled={busy || code.length !== 4}>{t('invite.creerCompte')}</button>
        <p className="join-note">{t('invite.compteApres')}</p>
      </form>
    );
  }

  const cta = (titreCta: string, texte: string) => (
    <div className="cta-compte">
      <p><b>{titreCta}</b> {texte}</p>
      <button type="button" className="btn-copper vert" onClick={() => setVue('compte')}>{t('invite.creerCompte')}</button>
    </div>
  );

  return (
    <div className="invite-vue">
      {entete}
      <section className={'night-card' + (night.status === 'en_jeu' ? ' enjeu' : '')}>
        <div className="night-card-head">
          {night.status === 'en_jeu'
            ? <span className="badge-etat b-enjeu"><span className="pt" />{t('etagere.enJeu')}</span>
            : night.status === 'termine'
              ? <span className="badge-etat b-prog"><span className="pt" />{t('etagere.terminee')}</span>
              : <span className="badge-etat b-prep"><span className="pt" />{t('etagere.enPrep')}</span>}
        </div>
        <h1 className="invite-h1">{titre}</h1>
        <p className="invite-date">{dateLong}{time ? ` · ${time}` : ''}</p>
        <div className="invite-hote">
          {hoteAvatar ? <img className="chip-avatar" src={hoteAvatar} alt="" /> : <span aria-hidden="true">{hote.sticker ?? '🎲'}</span>}
          <span>{t('invite.organiseePar')} <b>{hote.pseudo}</b></span>
        </div>
        <div className="chips">
          {players.map((p) => <PlayerChip key={p.id} u={p} />)}
        </div>
      </section>

      {night.status === 'creation' && (
        <>
          <div className="qg-head"><h2>{t('invite.jeuxProposes')}</h2>{games.length > 0 && <span className="hint">{t('invite.pourVoter')}</span>}</div>
          {games.length > 0
            ? <ShelfRows games={games} votes={votesParJeu} onVote={voter} onOpen={setDetail} vetos={vetoParJeu} />
            : <p className="hint">{t('invite.aucunJeu', { hote: hote.pseudo })}</p>}
          {cta(t('invite.ctaTitre'), t('invite.ctaTexte'))}
        </>
      )}

      {night.status === 'en_jeu' && partyGame && (
        <>
          <div className="bandeau v">
            <span className="box invite-boite"><BoxImage game={partyGame} /></span>
            <div><span className="sous-label">{t('invite.onJoueA')}</span><br /><b>{partyGame.title}</b></div>
          </div>
          <p className="hint">{t('invite.votesClos')}</p>
        </>
      )}

      {night.status === 'termine' && (
        <>
          <section className="night-card">
            <p className="sous-label">{t('invite.resultat', { j: partyGame?.title ?? '' })}</p>
            {classement.length === 0
              ? <p className="hint">{t('invite.pasDeScores')}</p>
              : <ol className="invite-classement">
                  {classement.map((c) => (
                    <li key={c.pseudo}>{medaille(c.rank) || `${c.rank}.`} <b>{c.pseudo}</b>{c.score != null ? ` · ${c.score}` : ''}</li>
                  ))}
                </ol>}
          </section>
          {cta(t('invite.ctaFinTitre'), t('invite.ctaFinTexte'))}
        </>
      )}

      {/* la fiche existante, sans « retirer de l'étagère » : l'invité consulte, il ne modifie pas */}
      {detail && <GameSheet game={detail} players={players} playsCount={plays[detail.id] ?? 0} onClose={() => setDetail(null)}
                            veto={night.status === 'creation' ? {
                              par: vetoParJeu.get(detail.id) ?? null, moi: monVeto === detail.id,
                              ailleurs: monVeto != null && monVeto !== detail.id ? games.find((g) => g.id === monVeto)?.title ?? null : null,
                              onToggle: () => veto(detail.id),
                            } : undefined}
                            votants={night.status === 'creation' ? { joueurs: votantsDe(votes, detail.id, players, me.id), moiId: me.id } : undefined} />}
      {erreur && <p role="alert" className="join-erreur">{erreur}</p>}
      {night.status !== 'termine' && (
        <button type="button" className={'btn-ghost' + (sur ? ' armed' : '')} disabled={busy} onClick={seRetirer}>
          {sur ? t('invite.seRetirerSur') : t('invite.seRetirer')}
        </button>
      )}
    </div>
  );
}
