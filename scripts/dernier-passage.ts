/** Affiche le résumé du dernier passage de collecte (outil de vérification locale) */
import { desc } from 'drizzle-orm';
import { getDb, schema } from '../lib/db';

async function main() {
  const db = await getDb() as any;
  const rows = await db.select().from(schema.journal).orderBy(desc(schema.journal.id)).limit(Number(process.argv[2] ?? 10));
  for (const r of rows.reverse()) {
    const last = (r.etapes as [string, string, string][]).filter((l) => l[1] !== 'info').map((l) => l[2]).at(-1) ?? '';
    console.log(`${new Date(r.at).toISOString().slice(0, 19)} | ${r.source} | ${r.titre} | ${r.concerne ?? ''} | HTTP ${r.http ?? '-'} | ${r.statut} | ${(r.valeurs as unknown[]).length} valeurs | ${last.slice(0, 110)}`);
  }
}
main().then(() => process.exit(0));
