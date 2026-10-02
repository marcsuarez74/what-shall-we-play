// Composition pure des messages de partie — pas de bot WhatsApp : l'app compose,
// l'utilisateur envoie via le partage natif (navigator.share) sinon lien wa.me.

import { medaille } from './ranks';

// Énumération française : « A », « A et B », « A, B et C ».
export function frJoin(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1];
}

export function buildInviteMessage({ dateLong, time, pseudos }: {
  dateLong: string;
  time: string | null;
  pseudos: string[];
}): string {
  const heure = time ? ` à ${time}` : '';
  const qui = `${frJoin(pseudos)} ${pseudos.length > 1 ? 'sont' : 'est'} de la partie.`;
  return `🎲 Partie de jeux le ${dateLong}${heure} !\n👥 ${qui}\nMarquez vos jeux dispo 🔗 etagere.marc-suarez.fr`;
}

export function buildResultMessage({ title, ownerPseudo, waiting, time }: {
  title: string;
  ownerPseudo: string;
  waiting: string[];
  time: string | null;
}): string {
  const attente = waiting.length > 0
    ? `\n🕗 On attend ${frJoin(waiting)}${time ? ` — ce soir à ${time}` : ''}`
    : '';
  return `🎲 ${title} a été tiré au sort !\n👉 ${ownerPseudo} ramène son jeu${attente}\n🔗 etagere.marc-suarez.fr`;
}

// Podium partagé : 👑 les premiers (ex æquo groupés), puis 🥈/🥉, puis le reste.
// Les ex æquo s'affichent « A & B » — même idiome que la carte pod1 du détail.
export function buildPodiumMessage({ title, classement }: { title: string; classement: { pseudo: string; score: number; rank: number }[] }): string {
  const lignes: string[] = [];
  for (let r = 1; r <= Math.max(3, ...classement.map((c) => c.rank)); r++) {
    const duRang = classement.filter((c) => c.rank === r);
    if (duRang.length === 0) continue;
    const med = medaille(r) || '•';
    lignes.push(`${med} ${duRang.map((c) => c.pseudo).join(' & ')} — ${duRang[0].score} pts`);
  }
  return `🎲 ${title} — c'est fini !\n${lignes.join('\n')}`;
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
