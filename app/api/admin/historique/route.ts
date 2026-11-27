import { desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { guardAdmin } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const p2 = (n: number) => String(n).padStart(2, '0');
const atFr = (d: Date) => `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;

/** Historique des modifications (ajout seul), au format attendu par l'interface admin */
export async function GET(req: Request) {
  const g = await guardAdmin(req); if (g) return g;
  const db = await getDb() as any;
  const rows = await db.select().from(schema.historique).orderBy(desc(schema.historique.at), desc(schema.historique.id)).limit(5000);
  const hist = rows.map((r: any) => {
    const t = String(r.donnee).split('-')[0], dec = t === 'fx' ? 4 : t === 'cpi' ? 1 : 2;
    const src = r.source ? (/^JORFTEXT\d+$/.test(r.source) ? `<a href="https://www.legifrance.gouv.fr/jorf/id/${r.source}" target="_blank" rel="noopener">arrêté du Journal officiel</a>` : esc(r.source)) : '';
    const isNewMonth = r.origine === 'statcan' && r.avant != null;
    return {
      id: r.id, at: atFr(new Date(r.at)), who: r.auteur, orig: r.origine, t, z: r.cle, m: r.periode, dec,
      old: isNewMonth ? null : r.avant == null ? null : Number(r.avant), prev: isNewMonth ? Number(r.avant) : undefined,
      nw: r.enregistree ? (r.apres == null ? null : Number(r.apres)) : null, raw: r.enregistree ? undefined : r.brut,
      chk: r.controles?.length ? r.controles : undefined, chkOn: r.brut ?? undefined, src,
    };
  });
  return Response.json(hist);
}
