import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
    fileParallelism: false, // le setup rm/mkdir .tmp-vitest par fichier + SQLite partagée : les fichiers doivent être séquentiels
  },
});
