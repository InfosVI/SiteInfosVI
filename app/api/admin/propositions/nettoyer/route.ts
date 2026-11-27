import { guardAdmin, sameOrigin } from '@/lib/admin-api';
import { nettoyerPropositions } from '@/lib/propositions';

export const dynamic = 'force-dynamic';

/** Bouton « Nettoyer les propositions » (aussi fait chaque jour avec la collecte) */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const g = await guardAdmin(req); if (g) return g;
  return Response.json({ retirees: await nettoyerPropositions() });
}
