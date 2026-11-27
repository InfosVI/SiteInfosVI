/** Statistique Canada : indice des prix de Montréal (tableau 18-10-0004-01), vérifié chaque jour jusqu'à parution */
import { and, eq, desc } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { checkVal, allOk } from '../checks';
import { newEntry, log, fetchRetry, saveEntry, addHistory } from './core';
import { addMonths } from '../format';

const SERIES = [{ zone: 'CANADA (AUTRES VILLES)', ville: 'Montréal', coord: '13.2.0.0.0.0.0.0.0.0', serie: 'Montréal (Québec)', vecteur: 'v41692876' }];

export async function collectStatcan() {
  const db = await getDb() as any, out = [];
  const expected = addMonths(new Date().toISOString().slice(0, 7), -1);   // indice du mois écoulé, publié vers le 15-20
  for (const s of SERIES) {
    const [last] = await db.select().from(schema.coutVie).where(eq(schema.coutVie.zone, s.zone)).orderBy(desc(schema.coutVie.mois)).limit(1);
    if (last && last.mois >= expected) continue;   // rien à chercher : pas d'appel inutile
    const url = 'https://www150.statcan.gc.ca/t1/wds/rest/getDataFromCubePidCoordAndLatestNPeriods';
    const e = newEntry('cpi', 'Statistique Canada', `Indice des prix à la consommation · ${s.ville}`, url, 'POST');
    const body = await fetchRetry(e, url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ productId: 18100004, coordinate: s.coord, latestN: 3 }]) });
    if (!body) { e.err = 'Statistique Canada n’a pas répondu.'; e.todo = 'Rien à faire : nouvel essai au prochain passage.'; await saveEntry(e); out.push(e); continue; }
    let pts: any[] = [];
    try { pts = JSON.parse(body.toString('utf8'))[0].object.vectorDataPoint; } catch { e.status = 'fail'; e.err = 'Réponse illisible (format inattendu).'; e.todo = 'Vérifier si Statistique Canada a changé le format de son API.'; log(e, 'err', e.err); await saveEntry(e); out.push(e); continue; }
    let added = 0;
    for (const p of pts) {
      const per = String(p.refPer).slice(0, 7), raw = String(p.value);
      const ck = checkVal('cpi', raw, per, /^\d{4}-\d\d$/.test(per));
      e.values.push({ key: s.zone, label: `IPC ${s.ville}, ${per} (publié le ${String(p.releaseTime).slice(8, 10)}/${String(p.releaseTime).slice(5, 7)})`, v: Number(p.value), raw, dec: 1, checks: ck, per, release: p.releaseTime });
      const [exists] = await db.select().from(schema.coutVie).where(and(eq(schema.coutVie.zone, s.zone), eq(schema.coutVie.mois, per)));
      if (exists) continue;
      const [prev] = await db.select().from(schema.coutVie).where(and(eq(schema.coutVie.zone, s.zone), eq(schema.coutVie.mois, addMonths(per, -1))));
      if (allOk(ck)) { await db.insert(schema.coutVie).values({ zone: s.zone, mois: per, indice: raw, serie: s.serie, vecteur: s.vecteur, source: 'Statistique Canada, IPC mensuel non desaisonnalise, tableau 18-10-0004-01', publieLe: String(p.releaseTime).slice(0, 10) }); added++; }
      await addHistory({ auteur: 'Collecte automatique', origine: 'statcan', donnee: 'cpi', cle: s.zone, periode: per, avant: prev ? Number(prev.indice) : null, apres: allOk(ck) ? Number(raw) : null, brut: raw, controles: ck, enregistree: allOk(ck), source: 'Statistique Canada, tableau 18-10-0004-01' });
      log(e, allOk(ck) ? 'ok' : 'err', allOk(ck) ? `${s.ville} ${per} = ${raw} enregistré` : `${s.ville} ${per} = ${raw} refusé au contrôle : non enregistré`);
      if (!allOk(ck)) { e.status = 'check'; e.todo = 'Une valeur a été refusée au contrôle : voir le détail.'; }
    }
    e.concerne = pts.length ? String(pts.at(-1).refPer).slice(0, 10) : '';
    if (!added && e.status === 'ok') { e.status = 'none'; log(e, 'info', `Indice de ${expected} pas encore publié : nouvel essai demain`); }
    await saveEntry(e); out.push(e);
  }
  return out;
}
