import { desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { guardAdmin } from '@/lib/admin-api';
import { IMPORT_MANUEL } from '@/lib/collect/core';

export const dynamic = 'force-dynamic';

/** Journal des requêtes (12 derniers mois), au format attendu par l'interface admin */
export async function GET(req: Request) {
  const g = await guardAdmin(req); if (g) return g;
  const db = await getDb() as any;
  const since = new Date(Date.now() - 365 * 86400_000);
  const rows = (await db.select().from(schema.journal).orderBy(desc(schema.journal.at)).limit(5000)).filter((r: any) => new Date(r.at) >= since);
  const iso = (d: any) => new Date(d).toISOString().slice(0, 19);
  const entries = rows.reverse().map((r: any) => ({
    id: r.id, at: iso(r.at), type: r.donnee, src: r.source, title: r.titre, concerne: r.concerne ?? '', url: r.url, method: r.methode,
    http: r.http, ms: r.ms, size: r.taille, status: r.statut, values: r.valeurs, logs: r.etapes, err: r.cause, todo: r.queFaire,
  }));
  const last = entries.at(-1);
  const manuel = Array.isArray(last?.logs) && last.logs.some((l: unknown[]) => l?.[2] === IMPORT_MANUEL);
  return Response.json({ run: { start: last?.at ?? '', end: last?.at ?? '', from: manuel ? 'import manuel (espace admin)' : 'collecte automatique' }, entries });
}
