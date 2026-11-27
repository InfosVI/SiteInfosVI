import { isIPv4, isIPv6 } from 'node:net';

/**
 * Réseau d'origine TRONQUÉ (jamais l'adresse complète) : IPv4 → a.b.0.0 (/16), IPv6 → 4 premiers octets (/32).
 * Suffit pour savoir à qui appartient le réseau (Amazon, Google, un fournisseur d'accès…), pas pour identifier une personne.
 */
export function reseauTronque(ip: string | null | undefined): string | null {
  const a = (ip ?? '').split(',')[0].trim().replace(/^::ffff:/, '');
  if (isIPv4(a)) { const [x, y] = a.split('.'); return `${x}.${y}.0.0`; }
  if (isIPv6(a)) {
    const [tete] = a.split('::'), g = tete.split(':').filter(Boolean);
    const plein = a.includes('::') ? [...g, '0', '0'] : g;   // groupes manquants après « :: » = 0
    return `${(plein[0] ?? '0').toLowerCase()}:${(plein[1] ?? '0').toLowerCase()}::`;
  }
  return null;
}
