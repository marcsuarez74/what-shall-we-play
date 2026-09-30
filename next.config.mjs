/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // Épingle la racine du workspace : sinon Next la déduit d'un lockfile parasite
  // (ex. ~/package-lock.json) et sort le standalone dans un chemin imbriqué.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
