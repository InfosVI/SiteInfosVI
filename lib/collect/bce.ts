/** BCE : cours de référence quotidiens → table cours_quotidiens ; moyenne du mois (provisoire puis définitive) */
import { and, eq, gte, lt } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { checkVal, allOk } from '../checks';
import { newEntry, log, fetchRetry, saveEntry, addHistory, type Value } from './core';
import { addMonths } from '../format';

const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length * 1e6) / 1e6;

export async function collectBce() {
  const db = await getDb() as any;
  const curM = new Date().toISOString().slice(0, 7), prevM = addMonths(curM, -1);
  const [prevDone] = await db.select().from(schema.tauxChange).where(and(eq(schema.tauxChange.mois, prevM), eq(schema.tauxChange.devise, 'CAD')));
  const start = prevDone ? `${curM}-01` : `${prevM}-01`;
  const url = `https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?startPeriod=${start}&format=csvdata`;
  const e = newEntry('fx', 'BCE', 'Cours de référence quotidiens', url);
  const body = await fetchRetry(e, url, {}, 60);
  if (!body) { e.err = 'La BCE n’a pas répondu.'; e.todo = 'Rien à faire : les cours manquants seront demandés au prochain passage.'; await saveEntry(e); return e; }

  const lines = body.toString('utf8').trim().split('\n'), head = lines[0].split(',');
  const iC = head.indexOf('CURRENCY'), iD = head.indexOf('TIME_PERIOD'), iV = head.indexOf('OBS_VALUE');
  const rows = lines.slice(1).map((l) => l.split(',')).filter((c) => c[iV] && c[iV] !== 'NaN');
  log(e, 'info', `${rows.length} cours lus (depuis le ${start})`);

  const before = await db.select().from(schema.coursQuotidiens).where(gte(schema.coursQuotidiens.date, `${prevM}-01`));
  const have = new Set(before.map((r: any) => `${String(r.date).slice(0, 10)}|${r.devise}`));
  const avgBefore = (c: string) => { const v = before.filter((r: any) => r.devise === c && String(r.date).startsWith(curM)).map((r: any) => Number(r.taux)); return v.length ? avg(v) : null; };

  let added = 0, refused = 0;
  const latest: Record<string, { d: string; raw: string; checks: ReturnType<typeof checkVal> }> = {};
  for (const c of rows) {
    const cur = c[iC], d = c[iD], raw = c[iV];
    const ck = checkVal('fx', raw, d, /^\d{4}-\d\d-\d\d$/.test(d) && d.slice(0, 7) >= prevM);
    if (!latest[cur] || d > latest[cur].d) latest[cur] = { d, raw, checks: ck };
    if (!allOk(ck)) { refused++; continue; }
    if (have.has(`${d}|${cur}`)) continue;
    await db.insert(schema.coursQuotidiens).values({ date: d, devise: cur, taux: raw, source: 'BCE' }); added++;
  }
  log(e, refused ? 'err' : 'info', `Contrôle type et format : ${rows.length - refused}/${rows.length} valeurs conformes${refused ? ` (${refused} refusées, non enregistrées)` : ''}`);
  if (refused) { e.status = 'check'; e.todo = 'Des cours ont été refusés au contrôle : voir le détail des valeurs.'; }

  // Moyenne provisoire du mois en cours, par devise
  const after = await db.select().from(schema.coursQuotidiens).where(gte(schema.coursQuotidiens.date, `${curM}-01`));
  for (const [cur, l] of Object.entries(latest).sort()) {
    const vs = after.filter((r: any) => r.devise === cur).map((r: any) => Number(r.taux)), a = vs.length ? avg(vs) : null, b = avgBefore(cur);
    e.values.push({ key: cur, label: `1 € = ${cur} (cours du ${l.d.slice(8)}/${l.d.slice(5, 7)})`, v: Number(l.raw), raw: l.raw, dec: 4, avg: a, n: vs.length, date: l.d, checks: l.checks } as Value);
    if (a != null && b !== a && allOk(l.checks)) await addHistory({ auteur: 'Collecte automatique', origine: 'bce', donnee: 'fx', cle: cur, periode: curM, avant: b, apres: a, brut: `cours du ${l.d} : ${l.raw}`, controles: l.checks, enregistree: true, source: `BCE · ${vs.length} cours jusqu’au ${l.d}` });
  }
  e.concerne = Object.values(latest).reduce((m, l) => (l.d > m ? l.d : m), '');

  // Mois précédent terminé : moyenne définitive
  if (!prevDone) {
    const prev = await db.select().from(schema.coursQuotidiens).where(and(gte(schema.coursQuotidiens.date, `${prevM}-01`), lt(schema.coursQuotidiens.date, `${curM}-01`)));
    const by: Record<string, number[]> = {}; for (const r of prev) (by[r.devise] ??= []).push(Number(r.taux));
    for (const [cur, vs] of Object.entries(by)) {
      await db.delete(schema.tauxChange).where(and(eq(schema.tauxChange.mois, prevM), eq(schema.tauxChange.devise, cur)));
      await db.insert(schema.tauxChange).values({ mois: prevM, devise: cur, taux: String(avg(vs)), source: 'BCE (moyenne des cours quotidiens)', nbJours: vs.length });
    }
    if (Object.keys(by).length) log(e, 'ok', `Moyenne définitive de ${prevM} enregistrée pour ${Object.keys(by).length} devises`);
  }
  log(e, 'ok', added ? `${added} nouveaux cours enregistrés ; moyennes provisoires de ${curM} mises à jour` : 'Aucun nouveau cours (week-end, jour férié ou déjà enregistré)');
  if (!added && e.status === 'ok') e.status = 'none';
  await saveEntry(e);
  return e;
}
