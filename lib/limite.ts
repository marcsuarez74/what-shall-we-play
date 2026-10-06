// v4.7.2 (audit, point 1) — limite de tentatives de connexion, en mémoire (une Map,
// aucune dépendance). Le code PIN n'a que 10 000 valeurs : sans limite, un compte
// tombait en quelques minutes. Fenêtre glissante simple : N échecs → blocage jusqu'à
// la fin de la fenêtre. Un redémarrage du serveur remet les compteurs à zéro (assumé).
const FENETRE_MS = 15 * 60_000;
const essais = new Map<string, { n: number; debut: number }>();

function entree(cle: string, maintenant: number) {
  const e = essais.get(cle);
  if (!e || maintenant - e.debut > FENETRE_MS) return null;
  return e;
}

/** Minutes restantes de blocage (0 = libre). */
export function minutesBloquees(cle: string, max: number, maintenant = Date.now()): number {
  const e = entree(cle, maintenant);
  if (!e || e.n < max) return 0;
  return Math.max(1, Math.ceil((e.debut + FENETRE_MS - maintenant) / 60_000));
}

export function noterEchec(cle: string, maintenant = Date.now()): void {
  const e = entree(cle, maintenant);
  if (e) e.n += 1;
  else essais.set(cle, { n: 1, debut: maintenant });
  if (essais.size > 5_000) { // la Map ne grossit pas sans fin : on jette les fenêtres closes
    for (const [k, v] of essais) if (maintenant - v.debut > FENETRE_MS) essais.delete(k);
  }
}

export function effacer(cle: string): void {
  essais.delete(cle);
}
