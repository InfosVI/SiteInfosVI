import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { guardAdmin, sameOrigin } from '@/lib/admin-api';
import { nettoyerContact } from '@/lib/contact';

export const dynamic = 'force-dynamic';

/** Messages reçus par le formulaire de contact (les plus récents d'abord ; effacés automatiquement après 60 jours) */
export async function GET(req: Request) {
  const g = await guardAdmin(req); if (g) return g;
  await nettoyerContact();
  const db = await getDb() as any;
  const rows = await db.select().from(schema.messages).orderBy(desc(schema.messages.at)).limit(500);
  return Response.json(rows.map((r: any) => ({ id: r.id, at: new Date(r.at).toISOString(), email: r.email, texte: r.texte })),
    { headers: { 'Cache-Control': 'no-store' } });
}

/** Suppression d'un message */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const g = await guardAdmin(req); if (g) return g;
  const p = z.object({ id: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'requête invalide' }, { status: 400 });
  const db = await getDb() as any;
  await db.delete(schema.messages).where(eq(schema.messages.id, p.data.id));
  return Response.json({ ok: true });
}
