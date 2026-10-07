// Démarrage du serveur Next (une fois par processus). v4.7.3 : réduction en tâche
// de fond des pochettes enregistrées avant la v4.7.3 — ne retarde jamais le démarrage.
// v4.9.0 : balayage des rappels du jour J toutes les 5 minutes (jamais bloquant).
// v4.14.0 : ce balayage complète aussi les séries (parties récurrentes).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reduirePochettesExistantes } = await import('./lib/storage');
  reduirePochettesExistantes()
    .then((n) => { if (n > 0) console.log(`pochettes réduites : ${n}`); })
    .catch(() => { /* jamais bloquant */ });
  const { envoyerRappels } = await import('./lib/push');
  // v4.14.0 : le même balayage garde 4 dates à venir à chaque série (jamais bloquant).
  const { completerSeries } = await import('./lib/series');
  const balayer = () => {
    try { completerSeries(); } catch { /* jamais bloquant */ }
    try { envoyerRappels().catch(() => {}); } catch { /* jamais bloquant */ }
  };
  setInterval(balayer, 5 * 60_000).unref();
  balayer();
}
