// Injecte la version de package.json dans le service worker (nom de cache versionné :
// un changement de version purge automatiquement l'ancien cache à l'activation).
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const swPath = 'public/sw.js';
let sw = readFileSync(swPath, 'utf8');
const next = `wsp-v${pkg.version}`;
sw = sw.replace(/wsp-v[\w.]+/, next);
writeFileSync(swPath, sw);
console.log(`sw.js : cache "${next}"`);
