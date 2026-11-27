import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { guardAdmin, sameOrigin } from '@/lib/admin-api';
import { checkVal, allOk } from '@/lib/checks';
import { quarterStart } from '@/lib/format';
import { resetExportCache } from '@/lib/export';

const Body = z.object({
  t: z.enum(['geo', 'fixe']), z: z.string().max(120), m: z.string().regex(/^\d{4}-\d\d$/), mode: z.enum(['vie', 'via']).default('vie'),
  raw: z.string().max(40).optional(), value: z.number().nullable().optional(), src: z.string().max(300), rest: z.boolean().optional(),
});
const trunc2 = (x: number) => Math.floor(Math.round(x * 1e6) / 1e4) / 100;

/** Valeur actuelle : dernière saisie admin, sinon valeur publiée */
async function current(db: any, donnee: string, cle: string, periode: string, mode: string) {
  const [o] = await db.select().from(schema.valeursAdmin).where(and(eq(schema.valeursAdmin.donnee, donnee), eq(schema.valeursAdmin.cle, cle), eq(schema.valeursAdmin.periode, periode))).orderBy(desc(schema.valeursAdmin.id)).limit(1);
  if (o) return o.valeur == null ? null : Number(o.valeur);
  if (donnee === 'fixe') { const f = await db.select().from(schema.partFixe); let v = null; for (const r of f) if (String(r.dateEffet).slice(0, 7) <= periode) v = Number(r.montant); return v; }
  const [g] = await db.select().from(schema.partGeo).where(and(eq(schema.partGeo.zone, cle), eq(schema.partGeo.trimestre, `${periode}-01`), eq(schema.partGeo.mode, mode as 'vie' | 'via')));
  return g?.montant == null ? null : Number(g.montant);
}

/** Saisie ou rétablissement d'une valeur par l'admin : contrôle du type et du format, puis enregistrement (ou refus tracé) */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const g = await guardAdmin(req); if (g) return g;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'requête invalide' }, { status: 400 });
  const b = p.data, db = await getDb() as any;
  const periode = b.t === 'geo' ? quarterStart(b.m) : b.m;
  const cle = b.t === 'fixe' ? 'TOUTES' : b.z, donnee = b.t === 'fixe' ? 'fixe' : `geo-${b.mode}`;
  const cur = await current(db, donnee, cle, periode, b.mode);

  let value: number | null, chk, brut: string;
  if (b.rest) { value = b.value ?? null; brut = value == null ? '' : value.toFixed(2); chk = value == null ? [] : checkVal(b.t === 'fixe' ? 'fixe' : 'geoEur', brut, b.m, true); }
  else {
    const raw = b.raw ?? '', isPct = /%/.test(raw), norm = raw.replace(/[\s€%]/g, '').replace(',', '.').replace(/^\+/, '');
    chk = checkVal(isPct ? 'geo' : (b.t === 'fixe' ? 'fixe' : 'geoEur'), norm, b.m, true); brut = raw;
    value = allOk(chk) ? (isPct ? (cur == null ? NaN : trunc2(cur * (1 + Number(norm) / 100))) : Number(norm)) : null;
    if (isPct && cur == null) chk = [...chk, { c: 'Référence', exp: 'valeur actuelle connue', got: 'aucune', ok: false }];
  }
  const ok = chk.length === 0 || allOk(chk);
  await db.insert(schema.historique).values({
    auteur: process.env.ADMIN_EMAIL ?? 'admin', origine: b.rest ? 'rest' : 'man', donnee: b.t, cle, periode, avant: cur == null ? null : String(cur),
    apres: ok && value != null ? String(value) : null, brut, controles: chk, enregistree: ok ? 1 : 0, source: b.src,
  });
  if (ok) { await db.insert(schema.valeursAdmin).values({ donnee, cle, periode, valeur: value == null ? null : String(value), source: b.src }); resetExportCache(); }
  return Response.json({ ok, refused: !ok, value, failed: chk.filter((c) => !c.ok).map((c) => c.c.toLowerCase()).join(', ') });
}
