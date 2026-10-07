// v4.11.0 — fichier calendrier (.ics) d'une partie programmée. Pur : aucun accès base,
// aucune dépendance. Heure « flottante » (sans fuseau) : 20:00 reste 20:00 chez chacun,
// comme dans l'app ; sans heure, l'événement dure toute la journée.
import { t, type Lang } from './i18n';

export const DUREE_PAR_DEFAUT_MIN = 180;

export interface EntreeIcs {
  id: number;
  titre: string;
  playedAt: string; // AAAA-MM-JJ
  startTime: string | null; // HH:MM
  joueurs: string[];
  url: string;
  lang: Lang;
  maintenant?: Date;
}

const p2 = (n: number) => String(n).padStart(2, '0');

// Date « flottante » AAAAMMJJTHHMMSS à partir d'un instant UTC fictif : l'arithmétique
// se fait en UTC, donc ni le fuseau ni l'heure d'été du serveur n'interviennent.
function flottante(d: Date): string {
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00`;
}
function jour(d: Date): string {
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
}
function parse(playedAt: string, startTime: string | null): Date {
  const [y, m, d] = playedAt.split('-').map(Number);
  const [hh, mm] = (startTime ?? '00:00').split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

// TEXT : \ ; , et retours à la ligne échappés (RFC 5545 §3.3.11).
export function echapper(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Lignes de 75 octets au plus ; la suite commence par une espace (comptée dans les 75).
// On coupe entre deux caractères, jamais au milieu d'un caractère multi-octets.
export function replier(ligne: string): string {
  if (Buffer.byteLength(ligne, 'utf8') <= 75) return ligne;
  const morceaux: string[] = [];
  let courant = '';
  let octets = 0;
  let limite = 75;
  for (const c of ligne) {
    const b = Buffer.byteLength(c, 'utf8');
    if (octets + b > limite) {
      morceaux.push(courant);
      courant = '';
      octets = 0;
      limite = 74;
    }
    courant += c;
    octets += b;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

export function genererIcs(e: EntreeIcs): string {
  const maintenant = e.maintenant ?? new Date();
  const debut = parse(e.playedAt, e.startTime);
  const dtstamp = `${flottante(maintenant)}Z`;
  const description = [
    e.joueurs.length ? t(e.lang, 'soiree.icsJoueurs', { p: e.joueurs.join(', ') }) : '',
    e.url,
  ].filter(Boolean).join('\n');
  const quand = e.startTime
    ? [
        `DTSTART:${flottante(debut)}`,
        `DTEND:${flottante(new Date(debut.getTime() + DUREE_PAR_DEFAUT_MIN * 60_000))}`,
      ]
    : [
        `DTSTART;VALUE=DATE:${jour(debut)}`,
        `DTEND;VALUE=DATE:${jour(new Date(debut.getTime() + 24 * 3_600_000))}`,
      ];
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//What Shall We Play//FR//',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:night-${e.id}@what-shall-we-play`,
    `DTSTAMP:${dtstamp}`,
    // Croissant : rouvrir le fichier après un changement d'heure met l'événement à jour.
    `SEQUENCE:${Math.floor(maintenant.getTime() / 60_000)}`,
    `SUMMARY:${echapper(e.titre)}`,
    `DESCRIPTION:${echapper(description)}`,
    `URL:${e.url}`,
    ...quand,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lignes.map(replier).join('\r\n') + '\r\n';
}

// Nom de fichier sûr (sans accents ni caractères spéciaux), 40 caractères au plus.
export function nomFichierIcs(titre: string): string {
  const slug = titre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/g, '');
  return `${slug || 'partie'}.ics`;
}
