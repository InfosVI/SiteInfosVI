/**
 * Données des pages publiques, au même format que la maquette validée (data.json et histo.json),
 * construites à partir de la base (données publiques réelles uniquement).
 */
import { asc } from 'drizzle-orm';
import { getDb, schema } from './db';
import { quarterStart } from './format';

const CANADA: Record<string, string> = {
  'CANADA (AUTRES VILLES)': 'Montréal et villes francophones',
  'CANADA (OTTAWA, MONCTON)': 'Ottawa, Moncton',
  'CANADA (TORONTO)': 'Toronto et villes anglophones',
  'CANADA (VANCOUVER)': 'Vancouver',
};
const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
const ds = (v: unknown) => (v == null ? '' : String(v instanceof Date ? v.toISOString() : v).slice(0, 10));

function code(s: string | null) {
  if (!s || s === 'manquant') return 'M';
  if (/^deduit/.test(s)) return 'X';
  if (/saisie admin/.test(s)) return 'A';
  if (/derogatoire \(montant/.test(s)) return 'D';
  if (/derogatoire/.test(s)) return 'd';
  if (/^base/.test(s)) return 'O';
  if (/verifie/.test(s)) return 'V';
  if (/identique/.test(s)) return 'I';
  if (/bareme VIE/.test(s)) return 'B';
  if (/reconstitue/.test(s)) return 'R';
  return 'C';
}

function monthsUntil(first: string, last: string) {
  const out: string[] = [];
  for (let [y, m] = first.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= last; m === 12 ? (y++, m = 1) : m++) out.push(`${y}-${String(m).padStart(2, '0')}`);
  return out;
}

let cache: { at: number; data: any; histo: any } | null = null;
export const resetExportCache = () => { cache = null; };

export async function buildExports() {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache;
  const db = await getDb() as any;
  const curM = new Date().toISOString().slice(0, 7);
  const months = monthsUntil('2014-01', curM);
  const quarters = months.filter((m) => m === quarterStart(m));

  const zonesT = await db.select().from(schema.zones);
  const devOf = new Map<string, string | null>(zonesT.map((z: any) => [z.zone, z.devise]));
  const paysOf = new Map<string, string>(zonesT.map((z: any) => [z.zone, z.pays]));
  const geo = await db.select().from(schema.partGeo).orderBy(asc(schema.partGeo.trimestre));
  const fixes = await db.select().from(schema.partFixe).orderBy(asc(schema.partFixe.dateEffet));
  const fxRows = await db.select().from(schema.tauxChange);
  const daily = await db.select().from(schema.coursQuotidiens);
  const cpi = await db.select().from(schema.coutVie).orderBy(asc(schema.coutVie.mois));
  const arr = await db.select().from(schema.arretes).orderBy(asc(schema.arretes.publieLe));

  // Valeurs saisies par l'admin (la plus récente l'emporte) : elles remplacent la valeur publiée
  const ovr = new Map<string, any>();
  for (const o of await db.select().from(schema.valeursAdmin).orderBy(asc(schema.valeursAdmin.id))) ovr.set(`${o.donnee}|${o.cle}|${o.periode}`, o);
  for (const o of ovr.values()) {
    if (o.donnee === 'fixe') {
      if (o.valeur == null) continue;
      const i = fixes.findIndex((f: any) => ds(f.dateEffet).slice(0, 7) === o.periode);
      const row = { dateEffet: `${o.periode}-01`, montant: o.valeur, sourceIndices: 'saisie admin', sourceTraitement: 'saisie admin' };
      if (i >= 0) fixes[i] = row; else { fixes.push(row); fixes.sort((a: any, b: any) => ds(a.dateEffet).localeCompare(ds(b.dateEffet))); }
    } else {
      const mode = String(o.donnee).split('-')[1];
      const r = geo.find((g: any) => g.zone === o.cle && g.mode === mode && ds(g.trimestre).startsWith(o.periode));
      if (r) { r.montant = o.valeur; r.statut = o.valeur == null ? 'manquant' : 'saisie admin'; }
      else if (o.valeur != null) geo.push({ zone: o.cle, trimestre: `${o.periode}-01`, mode, montant: o.valeur, statut: 'saisie admin', source: null });
    }
  }

  // Cours quotidiens du mois en cours → moyenne provisoire
  const dCur = daily.filter((r: any) => ds(r.date).startsWith(curM));
  const dDates = [...new Set<string>(dCur.map((r: any) => ds(r.date)))].sort();
  const dBy: Record<string, Record<string, number>> = {};
  for (const r of dCur) (dBy[r.devise] ??= {})[ds(r.date)] = Number(r.taux);
  const dRates = Object.fromEntries(Object.keys(dBy).sort().map((c) => [c, dDates.map((d) => dBy[c][d] ?? null)]));
  const provAvg = (c: string) => { const v = Object.values(dBy[c] ?? {}); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 1e6) / 1e6 : null; };
  const provDays = Math.max(0, ...Object.values(dBy).map((o) => Object.keys(o).length));

  // Taux mensuels par devise (mois en cours : moyenne provisoire des cours quotidiens quand ils existent)
  const fxBy: Record<string, Record<string, any>> = {};
  for (const r of fxRows) (fxBy[r.devise] ??= {})[r.mois] = r;
  const fx: Record<string, (number | null)[]> = {}, fxSrc: Record<string, string> = {};
  for (const c of Object.keys(fxBy).sort()) {
    fx[c] = months.map((m) => (m === curM && provAvg(c) != null ? provAvg(c) : fxBy[c][m] ? Math.round(Number(fxBy[c][m].taux) * 1e6) / 1e6 : null));
    const rs = Object.values(fxBy[c]); fxSrc[c] = rs.filter((r: any) => String(r.source).startsWith('BCE')).length > rs.length / 2 ? 'BCE' : 'Frankfurter';
  }

  // Part géographique par zone et par trimestre
  const gBy: Record<string, Record<string, any>> = {};
  for (const r of geo) ((gBy[r.zone] ??= {})[`${ds(r.trimestre).slice(0, 7)}|${r.mode}`] = r);
  const zones: Record<string, any> = {};
  for (const z of Object.keys(gBy).sort()) {
    const vie: (number | null)[] = [], via: (number | null)[] = []; let vs = '', as = '';
    const sv: Record<string, string> = {}, sa: Record<string, string> = {}; let lv = '', la = '';
    for (const q of quarters) {
      const v = gBy[z][`${q}|vie`], a = gBy[z][`${q}|via`];
      vie.push(n(v?.montant)); via.push(n(a?.montant)); vs += code(v?.statut ?? null); as += code(a?.statut ?? null);
      if (v?.source && v.source !== lv) { sv[q] = v.source; lv = v.source; }
      if (a?.source && a.source !== la) { sa[q] = a.source; la = a.source; }
    }
    if (![...vie, ...via].some((x) => x != null)) continue;
    zones[z] = { p: paysOf.get(z), d: devOf.get(z), vie, via, vs, as, sv, sa };
  }

  const tri = arr.filter((a: any) => a.type === 'trim_pct');
  const ar = (a: any) => a && { id: a.cid, signe: ds(a.signeLe), publi: ds(a.publieLe), effet: ds(a.effet) };
  const histo = {
    quarters, months, zones, fx, fxSrc,
    prov: { month: curM, to: dDates.at(-1) ?? '', days: provDays },
    daily: { dates: dDates, rates: dRates },
    arretes: { cur: ar(tri.at(-1)), prev: ar(tri.at(-2)) },
    fixe: fixes.map((f: any) => [ds(f.dateEffet).slice(0, 7), Number(f.montant), f.sourceIndices, f.sourceTraitement]),
  };

  // Séries détaillées des zones canadiennes (indemnité, taux, indice des prix)
  const canada: Record<string, any> = {};
  for (const [z, label] of Object.entries(CANADA)) {
    const cpiBy = new Map<string, number>(cpi.filter((r: any) => r.zone === z).map((r: any) => [r.mois, Number(r.indice)]));
    const series = months.map((m) => {
      const q = quarterStart(m), v = gBy[z]?.[`${q}|vie`], a = gBy[z]?.[`${q}|via`];
      let fixe = null as number | null; for (const f of fixes) if (ds(f.dateEffet).slice(0, 7) <= m) fixe = Number(f.montant);
      return { m, fixe, vie: n(v?.montant), vieSt: v?.statut ?? '', vieSrc: v?.source ?? '', via: n(a?.montant), viaSt: a?.statut ?? '', viaSrc: a?.source ?? '',
        fx: m === curM ? null : fxBy.CAD?.[m] ? Number(fxBy.CAD[m].taux) : null, fxd: null, cpi: cpiBy.get(m) ?? null };
    });
    canada[z] = { label, series };
  }
  const curQ = quarters.filter((q) => geo.some((r: any) => ds(r.trimestre).startsWith(q) && r.montant != null)).at(-1)!;
  const zonesNow = geo.filter((r: any) => r.mode === 'vie' && ds(r.trimestre).startsWith(curQ) && r.montant != null)
    .map((r: any) => ({ z: r.zone, pays: paysOf.get(r.zone), geo: Number(r.montant), st: r.statut, dev: devOf.get(r.zone) }));
  const cpiLast: Record<string, { m: string; pub: string }> = {};
  for (const r of cpi) cpiLast[r.serie] = { m: r.mois, pub: ds(r.publieLe) };

  const data = { generated: new Date().toISOString().slice(0, 10), canada, zones: zonesNow, cpiLast, currentPeriod: curQ };
  cache = { at: Date.now(), data, histo };
  return cache;
}
