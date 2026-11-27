import { eq, and, asc } from 'drizzle-orm';
import { getDb, schema } from './db';
import { quarterStart, DEFAULT_ZONE } from './format';

export type Mode = 'vie' | 'via';
export type Row = {
  m: string;                 // AAAA-MM
  fixe: number | null;
  geo: number | null;
  total: number | null;
  statut: string;            // fiabilité de la part géographique
  source: string | null;     // texte du Journal officiel (JORFTEXT…)
  dev: string | null;        // devise locale
  fx: number | null;         // 1 € = fx devise (moyenne du mois)
  fxSource: string | null;
  cpi: number | null;        // indice des prix (zones suivies seulement)
};

const n = (v: string | null) => (v == null ? null : Number(v));
const EURO_SWITCH: Record<string, string> = { HRK: '2023-01', LTL: '2015-01', BGN: '2026-01' };

export async function listZones() {
  const db = await getDb();
  return (db as any).select().from(schema.zones).orderBy(asc(schema.zones.zone)) as Promise<{ zone: string; pays: string; devise: string | null }[]>;
}

export async function partFixeHistory() {
  const db = await getDb();
  const rows = await (db as any).select().from(schema.partFixe).orderBy(asc(schema.partFixe.dateEffet));
  return rows.map((r: any) => ({ ...r, montant: Number(r.montant), traitementAnnuel: Number(r.traitementAnnuel) })) as
    { dateEffet: string; indiceMajore: number; traitementAnnuel: number; montant: number; sourceIndices: string; sourceTraitement: string }[];
}

/** Série mensuelle d'une zone : indemnité (fixe + géo), taux de change du mois, indice des prix */
export async function seriesFor(zone: string, mode: Mode, until: string): Promise<Row[] | null> {
  const db = await getDb() as any;
  const [z] = await db.select().from(schema.zones).where(eq(schema.zones.zone, zone));
  if (!z) return null;
  const geo = await db.select().from(schema.partGeo).where(and(eq(schema.partGeo.zone, zone), eq(schema.partGeo.mode, mode))).orderBy(asc(schema.partGeo.trimestre));
  const fixes = await partFixeHistory();
  const fx = z.devise ? await db.select().from(schema.tauxChange).where(eq(schema.tauxChange.devise, z.devise)) : [];
  const fxBy = new Map<string, any>(fx.map((r: any) => [r.mois, r]));
  const cpi = await db.select().from(schema.coutVie).where(eq(schema.coutVie.zone, zone));
  const cpiBy = new Map<string, number>(cpi.map((r: any) => [r.mois, Number(r.indice)]));
  // Mode VIE égal au mode VIA : on affiche la fiabilité et la source réelles (celles de la valeur VIA)
  if (mode === 'vie' && geo.some((r: any) => String(r.statut).startsWith('identique VIA'))) {
    const via = await db.select().from(schema.partGeo).where(and(eq(schema.partGeo.zone, zone), eq(schema.partGeo.mode, 'via')));
    const viaBy = new Map<string, any>(via.map((r: any) => [String(r.trimestre), r]));
    for (const r of geo) if (String(r.statut).startsWith('identique VIA')) { const v = viaBy.get(String(r.trimestre)); if (v) { r.statut = v.statut; r.source = r.source ?? v.source; } }
  }
  const geoBy = new Map<string, any>(geo.map((r: any) => [String(r.trimestre).slice(0, 7), r]));
  const first = geo.length ? String(geo[0].trimestre).slice(0, 7) : until;
  const rows: Row[] = [];
  for (let [y, m] = first.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= until; m === 12 ? (y++, m = 1) : m++) {
    const mm = `${y}-${String(m).padStart(2, '0')}`;
    const g = geoBy.get(quarterStart(mm));
    let fixe: number | null = null; for (const f of fixes) if (f.dateEffet.slice(0, 7) <= mm) fixe = f.montant;
    const gv = g ? n(g.montant) : null;
    let dev = z.devise as string | null; if (dev && EURO_SWITCH[dev] && mm >= EURO_SWITCH[dev]) dev = 'EUR';
    const f = dev === 'EUR' ? null : fxBy.get(mm);
    rows.push({
      m: mm, fixe, geo: gv, total: gv == null || fixe == null ? null : Math.round((fixe + gv) * 100) / 100,
      statut: g?.statut ?? 'manquant', source: g?.source ?? null, dev,
      fx: dev === 'EUR' ? 1 : f ? Number(f.taux) : null, fxSource: dev === 'EUR' ? null : f?.source ?? null,
      cpi: cpiBy.get(mm) ?? null,
    });
  }
  return rows;
}

/** Valeur dans la devise locale, et pouvoir d'achat (indemnité en devise ÷ indice des prix, si l'indice existe) */
export const inLocal = (r: Row) => (r.total == null || r.fx == null ? null : r.total * r.fx);
export const purchasing = (r: Row, withCpi: boolean) => { const l = inLocal(r); return l == null ? null : withCpi ? (r.cpi == null ? null : l / r.cpi) : l; };

export const parseZone = (z: string | string[] | undefined) => (typeof z === 'string' && z ? z : DEFAULT_ZONE);
export const parseMode = (m: string | string[] | undefined): Mode => (m === 'via' ? 'via' : 'vie');
export const currentMonth = () => new Date().toISOString().slice(0, 7);
