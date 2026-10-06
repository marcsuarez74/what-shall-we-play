// Composition pure des messages de partie — pas de bot WhatsApp : l'app compose,
// l'utilisateur envoie via le partage natif (navigator.share) sinon lien wa.me.
// v4.0.0 : les textes passent par le dict i18n (domaine annonce.*) — les pseudos,
// titres de jeux et scores restent des DONNÉES, jamais traduits.

import { medaille } from './ranks';
import { t, type Lang } from './i18n';

// Énumération : « A », « A et B », « A, B et C » (fr) / « A and B », « A, B and C » (en).
// Nom historique (fr) conservé — la jointure suit désormais la langue demandée.
export function frJoin(names: string[], lang: Lang = 'fr'): string {
  if (names.length <= 1) return names.join('');
  const dernier = lang === 'en' ? ' and ' : ' et ';
  return names.slice(0, -1).join(', ') + dernier + names[names.length - 1];
}

export function buildInviteMessage({ dateLong, time, pseudos, lien, lang = 'fr' }: {
  dateLong: string; time: string | null; pseudos: string[]; lien?: string; lang?: Lang;
}): string {
  const qui = t(lang, 'annonce.quiPartie', { qui: frJoin(pseudos, lang), n: pseudos.length });
  // v4.6.0 : le lien d'invitation clôt le message — l'invité rejoint sans compte.
  const fin = lien ? '\n' + t(lang, 'annonce.lienSoiree', { lien }) : '';
  return t(lang, 'annonce.invite', { dateLong, time: time ?? '', qui }) + fin;
}

export function buildResultMessage({ title, ownerPseudo, waiting, time, lang = 'fr' }: {
  title: string;
  ownerPseudo: string;
  waiting: string[];
  time: string | null;
  lang?: Lang;
}): string {
  const attente = waiting.length > 0
    ? '\n' + t(lang, 'annonce.attente', { qui: frJoin(waiting, lang), time: time ?? '' })
    : '';
  return t(lang, 'annonce.resultat', { title, owner: ownerPseudo, attente });
}

// Podium partagé : 👑 les premiers (ex æquo groupés), puis 🥈/🥉, puis le reste.
// Les ex æquo s'affichent « A & B » — même idiome que la carte pod1 du détail.
export function buildPodiumMessage({ title, classement, lang = 'fr' }: { title: string; classement: { pseudo: string; score: number; rank: number }[]; lang?: Lang }): string {
  const lignes: string[] = [];
  for (let r = 1; r <= Math.max(3, ...classement.map((c) => c.rank)); r++) {
    const duRang = classement.filter((c) => c.rank === r);
    if (duRang.length === 0) continue;
    const med = medaille(r) || '•';
    lignes.push(t(lang, 'annonce.podiumLigne', {
      med, qui: duRang.map((c) => c.pseudo).join(' & '), score: duRang[0].score,
    }));
  }
  return t(lang, 'annonce.podium', { title, lignes: lignes.join('\n') });
}

// Partage : natif si disponible (https + geste utilisateur), sinon ouverture de wa.me.
// Une annulation du partage natif ne doit PAS ouvrir WhatsApp derrière.
export async function shareMessage(text: string): Promise<'share' | 'wa.me' | 'annule'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'share';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'annule';
    }
  }
  if (typeof window !== 'undefined') {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
  return 'wa.me';
}
