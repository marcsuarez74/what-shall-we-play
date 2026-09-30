/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // Pages de données : jamais de payload RSC périmé au retour par onglet
  // (sinon l'étagère affichait l'ancien format après un changement en bibliothèque).
  experimental: {
    staleTimes: { dynamic: 0 },
  },
  // Épingle la racine du workspace : sinon Next la déduit d'un lockfile parasite
  // (ex. ~/package-lock.json) et sort le standalone dans un chemin imbriqué.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
