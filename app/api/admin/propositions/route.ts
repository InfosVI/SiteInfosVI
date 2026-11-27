import { z } from 'zod';
import { guardAdmin, sameOrigin } from '@/lib/admin-api';
import { moderer } from '@/lib/propositions';

export const dynamic = 'force-dynamic';
const Body = z.object({ id: z.number().int().positive(), action: z.enum(['valider', 'devalider', 'rejeter', 'rouvrir']) }).strict();

/** Modération des propositions par l'administrateur */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const g = await guardAdmin(req); if (g) return g;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'requête invalide' }, { status: 400 });
  const r = await moderer(p.data.id, p.data.action);
  return 'erreur' in r ? Response.json({ error: r.erreur }, { status: 400 }) : Response.json({ ok: true });
}
