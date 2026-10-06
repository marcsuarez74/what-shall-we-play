// Démarrage du serveur Next (une fois par processus). v4.7.3 : réduction en tâche
// de fond des pochettes enregistrées avant la v4.7.3 — ne retarde jamais le démarrage.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reduirePochettesExistantes } = await import('./lib/storage');
  reduirePochettesExistantes()
    .then((n) => { if (n > 0) console.log(`pochettes réduites : ${n}`); })
    .catch(() => { /* jamais bloquant */ });
}
