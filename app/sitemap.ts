import type { MetadataRoute } from 'next';
import { PAGES_INDEXEES } from '@/lib/pages';

export const dynamic = 'force-dynamic';

/** Plan du site pour les moteurs de recherche : une adresse par page publique */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const maintenant = new Date();
  return PAGES_INDEXEES.map(p => ({ url: base + (p.chemin === '/' ? '/' : p.chemin), lastModified: maintenant, changeFrequency: p.frequence, priority: p.priorite }));
}
