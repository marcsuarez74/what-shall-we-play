/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // Compression au bord (nginx) et non dans Node : un flux SSE gzip reste
  // coincé dans le tampon de décompression de l'EventSource — la sync live
  // n'arrive jamais. nginx regonfle ce qui doit l'être, sans toucher le SSE.
  compress: false,
  // v4.7.2 (audit, point 8) : pas de signature « X-Powered-By: Next.js ».
  poweredByHeader: false,
  // En-têtes de sécurité sur toutes les réponses. CSP limitée à ce qui ne peut rien
  // casser (pas de cadre, pas de plugin, base fixe) : les scripts de Next restent libres.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
      ],
    }];
  },
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
