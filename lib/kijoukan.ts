// v4.16.0 — Kijoukan (« qui joue quand ? ») : la disponibilité permanente, sans événement.
// Une seule grille par compte (KISS) : 7 jours × midi / soir = 14 cases '0'/'1' dans
// users.kijoukan — cases 0–6 : midi du lundi au dimanche, 7–13 : soir. La carte d'un cercle
// somme les grilles de ses membres ; rien n'est envoyé ni créé tout seul.
import { getDb } from './db';
import { membresCercle } from './cercles';
import { t, type Lang } from './i18n';

export const CASES = 14;
export const HEURE_CRENEAU = ['12:00', '20:00'] as const; // midi, soir : heures proposées au sondage

export function grilleDe(userId: number): string {
  const g = (getDb().prepare('SELECT kijoukan FROM users WHERE id = ?').get(userId) as { kijoukan: string } | undefined)?.kijoukan ?? '';
  return g.length === CASES ? g : '0'.repeat(CASES);
}

export function reglerGrille(userId: number, grille: unknown, lang: Lang = 'fr'): { ok: true } | { error: string; status: number } {
  if (typeof grille !== 'string' || !new RegExp(`^[01]{${CASES}}$`).test(grille))
    return { error: t(lang, 'erreurs.requeteInvalide'), status: 400 };
  getDb().prepare('UPDATE users SET kijoukan = ? WHERE id = ?').run(grille, userId);
  return { ok: true };
}

export type CarteKijoukan = { compte: number[]; noms: string[][]; repondu: number; membres: number };
// La carte d'un cercle : pour chaque case, combien de membres sont dispo et lesquels.
export function carteCercle(cercleId: number): CarteKijoukan {
  const membres = membresCercle(cercleId).filter((m) => m.etat === 'membre');
  const compte = new Array<number>(CASES).fill(0);
  const noms: string[][] = Array.from({ length: CASES }, () => []);
  let repondu = 0;
  for (const m of membres) {
    const g = grilleDe(m.id);
    if (g.includes('1')) repondu++;
    for (let i = 0; i < CASES; i++) if (g[i] === '1') { compte[i]++; noms[i].push(m.pseudo); }
  }
  return { compte, noms, repondu, membres: membres.length };
}

// La case où le plus de membres sont dispo (la première en cas d'égalité) ; null si personne.
export function meilleurCreneau(compte: number[]): number | null {
  const max = Math.max(...compte);
  return max > 0 ? compte.indexOf(max) : null;
}

// Les N prochaines dates d'un jour de la semaine (lundi = 0), jamais aujourd'hui.
export function prochainesDates(jour: number, n: number, aujourdhui = new Date().toLocaleDateString('sv-SE')): string[] {
  const [y, m, d] = aujourdhui.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const lundiZero = (base.getUTCDay() + 6) % 7; // dimanche = 6
  const ecart = ((jour - lundiZero + 7) % 7) || 7;
  return Array.from({ length: n }, (_, k) => new Date(base.getTime() + (ecart + 7 * k) * 86_400_000).toISOString().slice(0, 10));
}
