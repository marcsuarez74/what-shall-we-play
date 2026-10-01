import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

// La base des E2E vit HORS du projet : Turbopack surveille la racine et les
// écritures continues de SQLite (WAL) et des couvertures sous data/ déclenchent
// des rebuilds Fast Refresh qui coupent les navigations client en cours
// (biblio échouait aléatoirement sur « Ma ludothèque » invisible). Purgée à
// chaque démarrage à froid du serveur de test : comptes toujours neufs.
const dataDir = path.join(os.tmpdir(), 'wsp-e2e-data');

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1, // les specs partagent un serveur dev et une base SQLite — l'exécution est sérialisée
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure', // diagnostic des rouges CI (artefacts uploadés)
  },
  webServer: {
    command: `rm -rf ${dataDir} && npm run dev`,
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { DATA_DIR: dataDir },
  },
});
