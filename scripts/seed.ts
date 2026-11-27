/**
 * Chargement des données publiques de départ (dossier data/) dans la base.
 * Relançable sans risque : les tables de données sont vidées puis rechargées ;
 * l'historique et le journal (ajout seul) ne sont jamais touchés.
 */
import { readFileSync } from 'node:fs';
import { parseCsv } from '../lib/csv';
import { getDb, schema } from '../lib/db';
import { migrate } from '../lib/db/migrate';
import { checkVal } from '../lib/checks';
import { sql } from 'drizzle-orm';

const read = (f: string) => parseCsv(readFileSync(`data/${f}`, 'utf8'));
const num = (v: string) => (v === '' ? null : v);

async function insertAll<T>(db: Awaited<ReturnType<typeof getDb>>, table: any, rows: T[], size = 1000) {
  for (let i = 0; i < rows.length; i += size) await (db as any).insert(table).values(rows.slice(i, i + size));
}

async function main() {
  await migrate();
  const db = await getDb();
  const devises = new Map(read('pays-devises.csv').map((r) => [r.pays, r.devise || null]));
  const geo = read('indemnite-part-geo-trimestrielle.csv');

  await (db as any).delete(schema.partGeo);
  await (db as any).delete(schema.zones);
  await (db as any).delete(schema.partFixe);
  await (db as any).delete(schema.tauxChange);
  await (db as any).delete(schema.coutVie);

  const zones = [...new Map(geo.map((r) => [r.zone, { zone: r.zone, pays: r.pays, devise: devises.get(r.pays) ?? null }])).values()];
  await insertAll(db, schema.zones, zones);

  const pg = geo.flatMap((r) => (['vie', 'via'] as const).map((mode) => ({
    zone: r.zone, trimestre: r.trimestre, mode,
    montant: num(r[`${mode}_part_geo`]), statut: r[`${mode}_statut`] || 'manquant', source: r[`${mode}_source`] || null,
  })));
  await insertAll(db, schema.partGeo, pg);

  await insertAll(db, schema.partFixe, read('part-fixe.csv').map((r) => ({
    dateEffet: r.date_effet, indiceMajore: Number(r.indice_majore), traitementAnnuel: r.traitement_annuel,
    montant: r.part_fixe_tronquee, sourceIndices: r.source_ib_im, sourceTraitement: r.source_traitement,
  })));

  await insertAll(db, schema.tauxChange, read('taux-change-mensuel.csv').map((r) => ({
    mois: r.mois, devise: r.devise, taux: r.eur_vers_devise, source: r.source, nbJours: r.nb_jours ? Number(r.nb_jours) : null,
  })));

  await insertAll(db, schema.coutVie, read('cout-vie-mensuel.csv').map((r) => ({
    zone: r.zone, mois: r.mois, indice: r.indice, serie: r.serie, vecteur: r.vecteur || null, source: r.source, publieLe: r.publie_le || null,
  })));

  await (db as any).delete(schema.coursQuotidiens);
  await insertAll(db, schema.coursQuotidiens, read('cours-quotidiens.csv').map((r) => ({ date: r.date, devise: r.devise, taux: r.eur_vers_devise, source: r.source })));

  await (db as any).delete(schema.arretes);
  await insertAll(db, schema.arretes, read('arretes.csv').map((r) => ({
    cid: r.cid, type: r.type, publieLe: r.publie_le, signeLe: r.signe_le || null, effet: r.effet || null, titre: r.titre,
  })));

  // Journal et historique : ajout seul. Remplis une seule fois, avec des données réelles :
  // le passage de collecte réel du 25/11/2026 et les valeurs publiques importées (aucune entrée inventée).
  const [{ n: nj }] = await (db as any).execute(sql`select count(*)::int as n from journal`).then((r: any) => r.rows ?? r);
  if (!nj) {
    const J = JSON.parse(readFileSync('data/journal-initial.json', 'utf8'));
    await insertAll(db, schema.journal, J.entries.map((e: any) => ({
      at: new Date(e.at + 'Z'), donnee: e.type, source: e.src, titre: e.title, concerne: e.concerne || null, url: e.url, methode: e.method,
      http: e.http, ms: e.ms, taille: e.size, statut: e.status, valeurs: e.values, etapes: e.logs, cause: e.err, queFaire: e.todo,
    })), 200);
    const H: any[] = [];
    // Part géographique : changements apportés par le dernier arrêté trimestriel
    const tri = read('arretes.csv').filter((a) => a.type === 'trim_pct').at(-1)!;
    const q = tri.effet.slice(0, 7), qPrev = `${Number(q.slice(0, 4)) - (q.slice(5) === '01' ? 1 : 0)}-${String(((Number(q.slice(5)) + 8) % 12) + 1).padStart(2, '0')}`;
    for (const r of geo.filter((g) => g.trimestre.startsWith(q))) {
      const p = geo.find((g) => g.zone === r.zone && g.trimestre.startsWith(qPrev));
      if (!p || !r.via_part_geo || !p.via_part_geo || r.via_part_geo === p.via_part_geo) continue;
      const pv = String(+(Math.round((Number(r.via_part_geo) / Number(p.via_part_geo) - 1) * 10000) / 100).toFixed(2));
      H.push({ at: new Date(`${tri.publie_le}T00:00:00Z`), auteur: 'Import initial (données publiques)', origine: 'jo', donnee: 'geo', cle: r.zone, periode: q,
        avant: p.via_part_geo, apres: r.via_part_geo, brut: `variation lue : ${pv} %`, controles: checkVal('geo', pv, `${q}-01`, true), enregistree: 1, source: tri.cid });
    }
    // Indice des prix de Montréal et taux de change : valeurs reçues lors du passage de collecte réel
    const ipc = J.entries.find((e: any) => e.title?.startsWith('Historique de l’indice'));
    ipc?.values.forEach((v: any, i: number) => H.push({ at: new Date(v.release + ':00Z'), auteur: 'Statistique Canada (publication)', origine: 'statcan', donnee: 'cpi',
      cle: v.key, periode: v.per, avant: i ? String(ipc.values[i - 1].v) : null, apres: String(v.v), brut: v.raw, controles: v.checks, enregistree: 1, source: 'Statistique Canada, tableau 18-10-0004-01' }));
    const bce = J.entries.find((e: any) => e.type === 'fx' && e.values.length);
    const daily = read('cours-quotidiens.csv');
    for (const v of bce?.values ?? []) {
      const before = daily.filter((d) => d.devise === v.key && d.date < v.date).map((d) => Number(d.eur_vers_devise));
      if (!before.length) continue;
      const old = Math.round(before.reduce((a, b) => a + b, 0) / before.length * 1e6) / 1e6;
      if (Math.abs(old - v.avg) < 5e-7) continue;
      H.push({ at: new Date(bce.at + 'Z'), auteur: 'Collecte (passage réel)', origine: 'bce', donnee: 'fx', cle: v.key, periode: v.date.slice(0, 7),
        avant: String(old), apres: String(v.avg), brut: `cours du ${v.date} : ${v.raw}`, controles: v.checks, enregistree: 1, source: `BCE · ${v.n} cours jusqu’au ${v.date}` });
    }
    await insertAll(db, schema.historique, H, 200);
    console.log(`journal=${J.entries.length} historique=${H.length}`);
  }
  console.log(`zones=${zones.length} part_geo=${pg.length}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
