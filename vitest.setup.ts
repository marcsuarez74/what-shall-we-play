import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('.tmp-vitest');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
process.env.DATA_DIR = dir;
