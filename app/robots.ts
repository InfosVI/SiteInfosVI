import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

/** robots.txt : tout le site public est ouvert aux moteurs de recherche, sauf les API ; l'aperçu privé est fermé */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  if (/\/\/apercu\./.test(base)) return { rules: { userAgent: '*', disallow: '/' } };
  // Les données publiques (/api/data, /api/histo) restent lisibles : Google en a besoin pour afficher les pages
  return { rules: { userAgent: '*', allow: ['/', '/api/data', '/api/histo'], disallow: '/api/' }, sitemap: `${base}/sitemap.xml` };
}
