import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'What Shall We Play?', short_name: 'WSP', start_url: '/etagere',
    display: 'standalone', background_color: '#2A1F17', theme_color: '#2A1F17',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
