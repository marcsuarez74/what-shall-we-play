import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

// La base des E2E vit HORS du projet : Turbopack surveille la racine et les
// écritures continues de SQLite (WAL) et des couvertures sous data/ déclenchent
// des rebuilds Fast Refresh qui coupent les navigations client en cours
// (biblio échouait aléatoirement sur « Ma ludothèque » invisible). Purgée à
// chaque démarrage à froid du serveur de test : comptes toujours neufs.
const dataDir = path.join(os.tmpdir(), 'wsp-e2e-data');
// E2E_PROD=1 : la suite tourne sur un build de production (next build + next start).
// Pages précompilées, pas de compilation à la demande ni de Fast Refresh : c'est le
// mode de la CI (2-3× plus rapide). Sans la variable : serveur dev, pour itérer.
const prod = !!process.env.E2E_PROD;

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1, // les specs partagent un serveur dev et une base SQLite — l'exécution est sérialisée
  // Une assertion après une action peut attendre plusieurs router.refresh() en file
  // (celui de l'action + celui du sync live) : en CI, serveur dev chargé en fin de
  // suite, 5 s ne suffisaient plus (votes / validation rouges par intermittence, v4.16).
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure', // diagnostic des rouges CI (artefacts uploadés)
  },
  webServer: [
    {
      command: `rm -rf ${dataDir} && ${prod ? 'npm run build && npm run start' : 'npm run dev'}`,
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: prod ? 300_000 : 120_000, // le build de production passe avant le démarrage
      // GITHUB_BUG_TOKEN forcé à vide : un jeton hérité du shell ouvrirait une
      // vraie issue GitHub (et ferait échouer la suite, qui attend un 503 sans jeton).
      // BGG_BASE : XMLAPI2 branché sur le stub local (récupération de pochettes bout-en-bout).
      env: { DATA_DIR: dataDir, GITHUB_BUG_TOKEN: '', BGG_BASE: 'http://localhost:8765/xmlapi2' },
    },
    {
      command: 'node tests/e2e/bgg-stub.cjs',
      url: 'http://localhost:8765',
      reuseExistingServer: true,
      timeout: 10_000,
    },
  ],
});
