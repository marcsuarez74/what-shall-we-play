import { describe, it, expect } from 'vitest';
import { genererIcs, echapper, replier, nomFichierIcs } from '@/lib/ics';

const base = {
  id: 12,
  titre: 'Soirée Azul & co',
  playedAt: '2026-10-10',
  startTime: '20:00' as string | null,
  joueurs: ['Marc', 'Julie', 'Tom'],
  url: 'https://exemple.test/etagere?night=12',
  lang: 'fr' as const,
  maintenant: new Date('2026-10-07T12:00:00Z'),
};
const lignes = (s: string) => s.split('\r\n');

describe('genererIcs', () => {
  it('produit un calendrier valide en CRLF', () => {
    const ics = genererIcs(base);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('avec une heure : durée par défaut de 3 h, heure flottante', () => {
    const l = lignes(genererIcs(base));
    expect(l).toContain('DTSTART:20261010T200000');
    expect(l).toContain('DTEND:20261010T230000');
  });

  it('passe minuit sans dépendre du fuseau', () => {
    const l = lignes(genererIcs({ ...base, startTime: '22:30' }));
    expect(l).toContain('DTSTART:20261010T223000');
    expect(l).toContain('DTEND:20261011T013000');
  });

  it('passe le changement de mois et d’année', () => {
    const l = lignes(genererIcs({ ...base, playedAt: '2026-12-31', startTime: '21:00' }));
    expect(l).toContain('DTEND:20270101T000000');
  });

  it('sans heure : toute la journée, fin = lendemain', () => {
    const l = lignes(genererIcs({ ...base, startTime: null, playedAt: '2026-10-31' }));
    expect(l).toContain('DTSTART;VALUE=DATE:20261031');
    expect(l).toContain('DTEND;VALUE=DATE:20261101');
  });

  it('UID stable, SEQUENCE croissant', () => {
    const a = lignes(genererIcs(base));
    const b = lignes(genererIcs({ ...base, maintenant: new Date('2026-10-07T12:05:00Z') }));
    expect(a).toContain('UID:night-12@what-shall-we-play');
    expect(b).toContain('UID:night-12@what-shall-we-play');
    const seq = (l: string[]) => Number(l.find((x) => x.startsWith('SEQUENCE:'))!.slice(9));
    expect(seq(b)).toBeGreaterThan(seq(a));
  });

  it('met les joueurs et le lien dans la description, dans la langue du compte', () => {
    const deplier = (s: string) => s.replace(/\r\n /g, ''); // la ligne dépasse 75 octets : elle est repliée
    const fr = deplier(genererIcs(base));
    expect(fr).toContain('DESCRIPTION:Joueurs : Marc\\, Julie\\, Tom\\nhttps://exemple.test/etagere?night=12');
    const en = deplier(genererIcs({ ...base, lang: 'en' }));
    expect(en).toContain('DESCRIPTION:Players: Marc\\, Julie\\, Tom');
  });

  it('n’ajoute aucune alarme', () => {
    expect(genererIcs(base)).not.toContain('VALARM');
  });
});

describe('échappement et repli', () => {
  it('échappe \\ ; , et les retours à la ligne', () => {
    expect(echapper('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  });

  it('replie à 75 octets sans couper un caractère multi-octets', () => {
    const longue = 'SUMMARY:' + 'é'.repeat(80);
    const lignesRepliees = replier(longue).split('\r\n');
    expect(lignesRepliees.length).toBeGreaterThan(1);
    for (const l of lignesRepliees) expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75);
    for (const l of lignesRepliees.slice(1)) expect(l.startsWith(' ')).toBe(true);
    // Le dépliage (retrait de CRLF + espace) restitue la ligne d'origine.
    expect(replier(longue).replace(/\r\n /g, '')).toBe(longue);
  });

  it('laisse une ligne courte intacte', () => {
    expect(replier('SUMMARY:court')).toBe('SUMMARY:court');
  });
});

describe('nomFichierIcs', () => {
  it('retire accents et caractères spéciaux', () => {
    expect(nomFichierIcs('Soirée Azul & co')).toBe('soiree-azul-co.ics');
  });
  it('replie sur « partie » si rien d’exploitable', () => {
    expect(nomFichierIcs('🎲🎲')).toBe('partie.ics');
  });
  it('plafonne la longueur', () => {
    expect(nomFichierIcs('a'.repeat(100)).length).toBeLessThanOrEqual(44);
  });
});
