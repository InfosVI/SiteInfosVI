import type { NextConfig } from 'next';

/**
 * Règle de contenu (CSP) : la page ne peut charger et exécuter que ce qui vient du site lui-même
 * (aucun script, style, image ou connexion vers un autre site). Les scripts en ligne restent permis :
 * le site en injecte quelques-uns (réglages, version) et tout ce qui vient des visiteurs est échappé à l'affichage.
 * `blob:` sert aux calculs du captcha (Web Workers) et au téléchargement du PDF et des CSV.
 * En développement (npm run dev), la règle est désactivée : l'outil de rechargement en a besoin.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',          // image Docker légère
  poweredByHeader: false,        // ne pas révéler la technologie utilisée
  serverExternalPackages: ['@electric-sql/pglite'],
  async headers() {
    if (process.env.NODE_ENV !== 'production') return [];
    return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: CSP }] }];
  },
};

export default nextConfig;
