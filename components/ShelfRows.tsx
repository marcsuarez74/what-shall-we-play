'use client';
import { FORMATS, FORMAT_SCALE, formatLabel } from '@/lib/formats';
import type { Game } from '@/lib/types';
import BoxImage from './BoxImage';
import OwnerBadge from './OwnerBadge';
import { useI18n } from './LanguageProvider';

export type VotesParJeu = Map<number, { total: number; votants: string[]; moi: boolean }>;

// v3.5 — votes de la partie, vus par boîte : total, c'est MON vote, prénoms.
export function grouperVotes(votes: { game_id: number; user_id: number; pseudo: string }[], meId: number): VotesParJeu {
  const m: VotesParJeu = new Map();
  for (const v of votes) {
    const e = m.get(v.game_id) ?? { total: 0, votants: [], moi: false };
    e.total += 1;
    e.votants.push(v.pseudo.split(' ')[0]);
    if (v.user_id === meId) e.moi = true;
    m.set(v.game_id, e);
  }
  return m;
}

// Les rayons de l'étagère : une rangée par format de boîte (grand → mini), boîtes
// à l'échelle, badge 👍 de vote, rond du propriétaire. Partagé par l'étagère des
// joueurs (ShelfClient) et la vue invité (v4.7.0) : un seul rendu, un seul design.
export default function ShelfRows({ games, votes, onVote, onOpen, vetos }: {
  games: Game[];
  votes: VotesParJeu | null; // null : votes masqués (boîte sortie)
  /** v4.13.0 — jeu → prénom de qui l'a écarté (❌ remplace le 👍, boîte grisée). */
  vetos?: Map<number, string> | null;
  onVote: (gameId: number) => void;
  onOpen?: (g: Game) => void; // absent : la boîte ne s'ouvre pas (invité)
}) {
  const { lang, t } = useI18n();
  return (
    <>
      {FORMATS.map((f) => {
        const list = games.filter((g) => g.box_format === f);
        if (list.length === 0) return null;
        return (
          <section key={f} className="shelf-block">
            <div className="row" role="list">
              {list.map((g) => (
                <button key={g.id} type="button" role="listitem" className={`box ${FORMAT_SCALE[f] < 0.7 ? 'sm' : ''} ${vetos?.has(g.id) ? 'veto' : ''}`}
                        style={{ width: 96 * FORMAT_SCALE[f], height: 96 * FORMAT_SCALE[f], cursor: onOpen ? undefined : 'default' }}
                        onClick={onOpen ? () => onOpen(g) : undefined}>
                  <BoxImage game={g} />
                  {g.owner_pseudo && (
                    <OwnerBadge owner={{ pseudo: g.owner_pseudo, sticker: g.owner_sticker ?? null, avatar_path: g.owner_avatar_path ?? null }} />
                  )}
                  {votes && vetos?.has(g.id) && (
                    <span className="veto-badge" aria-label={t('veto.badgeAria', { j: g.title, p: vetos.get(g.id)! })}>
                      ❌ {vetos.get(g.id)}
                    </span>
                  )}
                  {votes && !vetos?.has(g.id) && (() => {
                    const v = votes.get(g.id);
                    return (
                      <span className={'vote-badge' + (v?.moi ? ' vote-moi' : '')} role="button"
                            aria-pressed={v?.moi ?? false}
                            aria-label={t('etagere.votesPour', { n: v?.total ?? 0, j: g.title })}
                            title={v?.votants.length ? v.votants.slice(0, 4).join(' · ') + (v.votants.length > 4 ? ' …' : '') : undefined}
                            onClick={(e) => { e.stopPropagation(); onVote(g.id); }}>
                        <span className="emoji" aria-hidden="true">👍</span>{v?.total ?? 0}
                      </span>
                    );
                  })()}
                </button>
              ))}
            </div>
            <div className="rail" />
            <p className="row-label">{formatLabel(f, lang)} {t('etagere.onSwipe')}</p>
          </section>
        );
      })}
    </>
  );
}
