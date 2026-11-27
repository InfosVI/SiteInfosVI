/**
 * Journal officiel (open data DILA) : lecture des fichiers quotidiens, détection de l'arrêté trimestriel
 * « fixant par pays (et par groupe) les taux… », lecture de son tableau (un % par zone) et calcul des nouveaux montants.
 */
import { gunzipSync } from 'node:zlib';
import { and, eq, like } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { checkVal, allOk } from '../checks';
import { newEntry, log, fetchRetry, saveEntry, addHistory } from './core';
import { addMonths } from '../format';

const BASE = 'https://echanges.dila.gouv.fr/OPENDATA/JORF/';
const MONTHS: Record<string, number> = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };
export const TITLE_RX = /fixant par pays (et par groupe )?les taux/i;
const PART_FIXE_RX = /(majoration de la rémunération des personnels civils et militaires|valeur du point d'indice)/i;

/** Lecteur tar minimal (archives .tar.gz de la DILA) */
export function* untar(buf: Buffer): Generator<{ name: string; data: Buffer }> {
  let off = 0;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = (h.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '') ? h.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '') + '/' : '') + h.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(h.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
    const type = String.fromCharCode(h[156]);
    if (type === '0' || type === '\0') yield { name, data: buf.subarray(off + 512, off + 512 + size) };
    off += 512 + Math.ceil(size / 512) * 512;
  }
}

export const normZone = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const plain = (x: string) => x.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Lignes du tableau (zone → %) d'un article */
export function parseTable(xml: string): { zone: string; raw: string }[] {
  const out: { zone: string; raw: string }[] = [];
  for (const tr of xml.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => plain(m[1]));
    if (cells.length < 2) continue;
    const v = cells.slice(1).map((c) => c.replace(/[―–—−]/g, '-').replace(/\s/g, '').replace('%', '')).find((c) => /^[-+]?\d+(,\d+)?$/.test(c));
    if (v != null) out.push({ zone: cells[0], raw: v.replace(',', '.').replace(/^\+/, '') });
  }
  return out;
}
/** Date d'effet (« entrera en vigueur le 1er octobre 2026 ») */
export function parseEffet(text: string): string | null {
  const m = plain(text).match(/(?:effet|vigueur)[^.]{0,60}?(?:1 ?er|premier) (janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre) (\d{4})/i);
  return m ? `${m[2]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-01` : null;
}

type Texte = { cid: string; publi: string; signe: string; titre: string; articles: string[] };

export async function collectJo() {
  const db = await getDb() as any, out = [];
  const eL = newEntry('geo', 'Journal officiel (DILA)', 'Liste des fichiers du Journal officiel', BASE);
  const lst = await fetchRetry(eL, BASE);
  if (!lst) { eL.err = 'Le site de la DILA n’a pas répondu.'; eL.todo = 'Rien à faire : les fichiers manqués seront relus au prochain passage.'; await saveEntry(eL); return [eL]; }
  const files = [...new Set(lst.toString('utf8').match(/JORF_\d{8}-\d{6}\.tar\.gz/g) ?? [])].sort();
  const done = new Set((await db.select({ url: schema.journal.url, statut: schema.journal.statut }).from(schema.journal).where(like(schema.journal.url, `${BASE}JORF_%`)))
    .filter((r: any) => r.statut !== 'fail').map((r: any) => r.url));
  const todo = files.filter((f) => !done.has(BASE + f)).slice(-10);
  eL.status = 'none'; log(eL, 'ok', `${files.length} fichiers disponibles ; ${todo.length} à lire (non encore lus)`);
  await saveEntry(eL); out.push(eL);

  for (const fn of todo) {
    const day = `${fn.slice(5, 9)}-${fn.slice(9, 11)}-${fn.slice(11, 13)}`;
    const e = newEntry('geo', 'Journal officiel (DILA)', 'Fichier du Journal officiel', BASE + fn); e.concerne = day;
    const gz = await fetchRetry(e, BASE + fn, {}, 120);
    if (!gz) { e.err = 'Le site de la DILA n’a pas répondu.'; e.todo = 'Rien à faire : le fichier sera relu au prochain passage (rattrapage automatique).'; await saveEntry(e); out.push(e); continue; }
    const textes = new Map<string, Texte>(); let n = 0; const fixeHits: string[] = [];
    for (const f of untar(gunzipSync(gz))) {
      if (!f.name.endsWith('.xml')) continue;
      const x = f.data.toString('utf8'), t = x.match(/<TITRE_TXT[^>]*>([^<]+)<\/TITRE_TXT>/); if (!t) continue;
      n++;
      if (PART_FIXE_RX.test(t[1])) fixeHits.push(t[1].trim());
      if (!TITLE_RX.test(t[1])) continue;
      const m = x.match(/<TEXTE cid="([^"]+)" date_publi="([^"]+)" date_signature="([^"]+)"/); if (!m) continue;
      const tx = textes.get(m[1]) ?? { cid: m[1], publi: m[2], signe: m[3], titre: t[1].trim(), articles: [] };
      tx.articles.push(x); textes.set(m[1], tx);
    }
    log(e, 'info', `${n} titres lus ; recherche de « fixant par pays et par groupe les taux » et des textes sur la part fixe`);
    for (const h of fixeHits) { log(e, 'warn', `Texte sur la part fixe : ${h.slice(0, 160)} → vérifier la part fixe`); e.status = 'check'; e.todo = 'Un texte peut modifier la part fixe : ouvrir le texte, vérifier le calcul, saisir la nouvelle valeur dans l’espace admin si besoin.'; }
    if (!textes.size) { log(e, 'info', 'Aucun nouvel arrêté de part géographique dans ce fichier : rien enregistré'); if (e.status === 'ok') e.status = 'none'; }
    for (const tx of textes.values()) await applyArrete(e, tx);
    await saveEntry(e); out.push(e);
  }
  return out;
}

/** Applique un arrêté trimestriel : nouveaux montants = ancien × (1 + %), tronqués au centime ; zone absente = inchangée */
async function applyArrete(e: ReturnType<typeof newEntry>, tx: Texte) {
  const db = await getDb() as any;
  const all = tx.articles.join('\n'), effet = parseEffet(all), rows = tx.articles.flatMap(parseTable);
  log(e, 'ok', `Arrêté trouvé : ${tx.titre.slice(0, 120)} (${tx.cid}), ${rows.length} lignes de tableau, en vigueur le ${effet ?? '?'}`);
  await db.insert(schema.arretes).values({ cid: tx.cid, type: 'trim_pct', publieLe: tx.publi, signeLe: tx.signe, effet, titre: tx.titre }).onConflictDoNothing();
  if (!effet || !rows.length) { e.status = 'check'; e.err = 'Arrêté trouvé mais date d’effet ou tableau illisible.'; e.todo = 'Ouvrir l’arrêté sur Légifrance et saisir les valeurs dans l’espace admin.'; log(e, 'err', e.err); return; }
  const q = effet.slice(0, 7), qPrev = addMonths(q, -3);
  const zones: { zone: string }[] = await db.select({ zone: schema.zones.zone }).from(schema.zones);
  const byNorm = new Map(zones.map((z) => [normZone(z.zone), z.zone]));
  const pct = new Map<string, { raw: string; ok: boolean; checks: ReturnType<typeof checkVal> }>(); const unknown: string[] = [];
  for (const r of rows) {
    const z = byNorm.get(normZone(r.zone)); const ck = checkVal('geo', r.raw, effet, true);
    if (!z) { unknown.push(r.zone); continue; }
    pct.set(z, { raw: r.raw, ok: allOk(ck), checks: ck });
  }
  let changed = 0, refused = 0;
  for (const { zone } of zones) {
    const prev = await db.select().from(schema.partGeo).where(and(eq(schema.partGeo.zone, zone), eq(schema.partGeo.trimestre, `${qPrev}-01`)));
    const exist = await db.select().from(schema.partGeo).where(and(eq(schema.partGeo.zone, zone), eq(schema.partGeo.trimestre, `${q}-01`)));
    if (exist.length || !prev.length) continue;
    const p = pct.get(zone); if (p && !p.ok) refused++;
    const via = prev.find((r: any) => r.mode === 'via'), vie = prev.find((r: any) => r.mode === 'vie');
    const calc = (v: any) => v?.montant == null ? null : (p && p.ok ? Math.floor(Math.round(Number(v.montant) * (1 + Number(p.raw) / 100) * 1e6) / 1e4) / 100 : Number(v.montant));
    const viaNew = p && !p.ok ? null : calc(via);
    const vieSame = vie && (String(vie.statut).startsWith('identique VIA') || vie.montant === via?.montant);
    const vieNew = vieSame ? viaNew : vie?.montant == null ? null : Number(vie.montant);
    await db.insert(schema.partGeo).values([
      { zone, trimestre: `${q}-01`, mode: 'via', montant: viaNew == null ? null : String(viaNew), statut: viaNew == null ? 'manquant' : p ? 'calcule' : (via?.statut ?? 'calcule'), source: p ? tx.cid : via?.source ?? null },
      { zone, trimestre: `${q}-01`, mode: 'vie', montant: vieNew == null ? null : String(vieNew), statut: vieNew == null ? 'manquant' : vieSame ? 'identique VIA' : (vie?.statut ?? 'calcule'), source: vieSame && p ? tx.cid : vie?.source ?? null },
    ]);
    if (p && via?.montant != null && (viaNew == null || viaNew !== Number(via.montant))) {
      changed++;
      await addHistory({ auteur: 'Collecte automatique', origine: 'jo', donnee: 'geo', cle: zone, periode: q, avant: Number(via.montant), apres: viaNew, brut: `variation lue : ${p.raw} %`, controles: p.checks, enregistree: p.ok, source: tx.cid });
    }
  }
  log(e, 'info', `Contrôle type et format : ${pct.size - refused}/${pct.size} variations conformes`);
  log(e, 'ok', `${changed} zones modifiées au ${effet} ; les zones absentes du tableau restent inchangées`);
  e.values = [...pct.entries()].slice(0, 400).map(([zone, p]) => ({ key: zone, label: `variation lue (effet ${effet})`, v: Number(p.raw), raw: p.raw, dec: 2, unit: '%', checks: p.checks }));
  if (unknown.length || refused) {
    e.status = 'check';
    e.todo = `${unknown.length ? `${unknown.length} zone(s) du tableau non reconnue(s) (${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}) : nouvelle zone ou nouveau nom, à rattacher. ` : ''}${refused ? `${refused} valeur(s) refusée(s) au contrôle : à saisir dans l’espace admin.` : ''}`;
    log(e, 'warn', e.todo);
  }
}
