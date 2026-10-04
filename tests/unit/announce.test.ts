import { describe, it, expect } from 'vitest';
import { buildInviteMessage, buildResultMessage, buildPodiumMessage, frJoin } from '@/lib/announce';

describe('messages de partie', () => {
  it('frJoin : énumération française', () => {
    expect(frJoin(['a'])).toBe('a');
    expect(frJoin(['a', 'b'])).toBe('a et b');
    expect(frJoin(['a', 'b', 'c'])).toBe('a, b et c');
  });

  it('invitation : date + heure + joueurs', () => {
    expect(buildInviteMessage({ dateLong: 'vendredi 2 octobre', time: '20:00', pseudos: ['marc', 'léa'] })).toBe(
      '🎲 Partie de jeux le vendredi 2 octobre à 20:00 !\n'
      + '👥 marc et léa sont de la partie.\n'
      + 'Marquez vos jeux dispo 🔗 etagere.marc-suarez.fr');
  });

  it('invitation : 1 seul → « est », 3+ → « A, B et C »', () => {
    expect(buildInviteMessage({ dateLong: 'x', time: null, pseudos: ['marc'] })).toContain('marc est de la partie');
    expect(buildInviteMessage({ dateLong: 'x', time: null, pseudos: ['a', 'b', 'c'] })).toContain('a, b et c sont de la partie');
  });

  it('invitation : sans heure, pas de « à »', () => {
    expect(buildInviteMessage({ dateLong: 'samedi 3 octobre', time: null, pseudos: ['marc'] })).toBe(
      '🎲 Partie de jeux le samedi 3 octobre !\n'
      + '👥 marc est de la partie.\n'
      + 'Marquez vos jeux dispo 🔗 etagere.marc-suarez.fr');
  });

  it('résultat : titre, propriétaire, attente, heure', () => {
    expect(buildResultMessage({ title: 'Azul', ownerPseudo: 'marc', waiting: ['léa', 'thibault'], time: '20:30' })).toBe(
      '🎲 Azul a été tiré au sort !\n'
      + '👉 marc ramène son jeu\n'
      + '🕗 On attend léa et thibault — à 20:30\n'
      + '🔗 etagere.marc-suarez.fr');
  });

  it('résultat : sans heure, attente solo, jointure 3+', () => {
    expect(buildResultMessage({ title: 'Dune', ownerPseudo: 'léa', waiting: ['marc'], time: null })).toBe(
      '🎲 Dune a été tiré au sort !\n'
      + '👉 léa ramène son jeu\n'
      + '🕗 On attend marc\n'
      + '🔗 etagere.marc-suarez.fr');
    expect(buildResultMessage({ title: 'Dune', ownerPseudo: 'léa', waiting: ['a', 'b', 'c'], time: null }))
      .toContain('On attend a, b et c');
  });

  it('résultat : personne à attendre (soirée solo) → pas de ligne « On attend »', () => {
    expect(buildResultMessage({ title: 'Solo', ownerPseudo: 'marc', waiting: [], time: '21:00' })).toBe(
      '🎲 Solo a été tiré au sort !\n'
      + '👉 marc ramène son jeu\n'
      + '🔗 etagere.marc-suarez.fr');
  });

  it('construit le message de podium WhatsApp', () => {
    const msg = buildPodiumMessage({ title: 'Cascadia', classement: [
      { pseudo: 'Marc', score: 24, rank: 1 }, { pseudo: 'Lucie', score: 24, rank: 1 }, { pseudo: 'Théo', score: 15, rank: 2 },
    ] });
    expect(msg).toContain('Cascadia');
    expect(msg).toContain('👑 Marc & Lucie — 24 pts');
    expect(msg).toContain('🥈 Théo — 15 pts');
  });
});
