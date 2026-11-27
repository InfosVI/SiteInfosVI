/**
 * Outils communs de la collecte : requêtes avec 3 essais, journal pas à pas, écriture dans la base.
 * Aucun secret n'est jamais écrit dans le journal.
 */
import { getDb, schema } from '../db';
import type { Check } from '../checks';

export type Level = 'info' | 'ok' | 'warn' | 'err';
export type Value = { key: string; label: string; v: number; raw: string; dec: number; checks: Check[]; [k: string]: unknown };
export type Entry = {
  type: 'geo' | 'fixe' | 'fx' | 'cpi'; src: string; title: string; concerne: string; url: string; method: string;
  http: number | null; ms: number | null; size: number | null; status: 'ok' | 'none' | 'retry' | 'check' | 'fail';
  values: Value[]; logs: [string, Level, string][]; err: string | null; todo: string | null; at: Date;
};

const now = () => new Date().toISOString().slice(0, 19);
export const newEntry = (type: Entry['type'], src: string, title: string, url: string, method = 'GET'): Entry =>
  ({ type, src, title, concerne: '', url, method, http: null, ms: null, size: null, status: 'ok', values: [], logs: [], err: null, todo: null, at: new Date() });
export const log = (e: Entry, level: Level, msg: string) => { e.logs.push([now(), level, msg]); if (process.env.COLLECTE_VERBOSE) console.log(`[${e.src}] ${msg}`); };

/** Délais entre essais (secondes) : 0, 10 min, 30 min par défaut (réglable pour les tests) */
const DELAYS = (process.env.COLLECTE_DELAIS ?? '0,600,1800').split(',').map(Number);
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

/** Requête HTTP avec 3 essais ; journalise chaque essai ; renvoie le corps ou null */
export async function fetchRetry(e: Entry, url: string, init: RequestInit = {}, timeoutS = 30): Promise<Buffer | null> {
  const t0 = Date.now();
  for (let k = 0; k < DELAYS.length; k++) {
    if (k) { log(e, 'info', `Nouvel essai dans ${Math.round(DELAYS[k] / 60) || DELAYS[k] + ' s'}${DELAYS[k] >= 60 ? ' min' : ''} (essai ${k + 1}/${DELAYS.length})`); await sleep(DELAYS[k]); }
    log(e, 'info', `Requête envoyée (essai ${k + 1}/${DELAYS.length}, délai maximum ${timeoutS} s)`);
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutS * 1000), headers: { 'User-Agent': 'collecte-indemnite-vi/1.0', ...(init.headers ?? {}) } });
      e.http = r.status;
      if (!r.ok) { log(e, 'warn', `Réponse HTTP ${r.status}`); continue; }
      const body = Buffer.from(await r.arrayBuffer());
      e.ms = Date.now() - t0; e.size = body.length;
      log(e, 'info', `Réponse HTTP ${r.status} en ${body.length > 1e5 ? (e.ms / 1000).toFixed(1) + ' s' : e.ms + ' ms'} (${body.length > 1e5 ? (body.length / 1e6).toFixed(2) + ' Mo' : body.length + ' octets'})`);
      if (k > 0) e.status = 'retry';
      return body;
    } catch (ex: any) { e.http = null; log(e, 'warn', ex?.name === 'TimeoutError' ? `Pas de réponse après ${timeoutS} s` : `Échec : ${ex?.message ?? ex}`); }
  }
  e.ms = Date.now() - t0; e.status = 'fail';
  log(e, 'err', `Abandon après ${DELAYS.length} essais : nouvel essai au prochain passage (rattrapage automatique)`);
  return null;
}

/** Enregistre une entrée du journal des requêtes */
export async function saveEntry(e: Entry) {
  const db = await getDb() as any;
  await db.insert(schema.journal).values({
    at: e.at, donnee: e.type, source: e.src, titre: e.title, concerne: e.concerne || null, url: e.url, methode: e.method,
    http: e.http, ms: e.ms, taille: e.size, statut: e.status, valeurs: e.values, cause: e.err, queFaire: e.todo,
    // Un import lancé à la main depuis l'espace admin est signalé en tête des étapes (affiché dans le journal)
    etapes: auteurManuel ? [[e.at.toISOString().slice(0, 19), 'info', IMPORT_MANUEL], ...e.logs] : e.logs,
  });
}

/** Auteur affiché dans l'historique pendant un import lancé à la main depuis l'espace admin */
let auteurManuel: string | null = null;
export const IMPORT_MANUEL = 'Import lancé à la main depuis l’espace admin';
export async function avecAuteur<T>(auteur: string, fn: () => Promise<T>): Promise<T> {
  auteurManuel = auteur; try { return await fn(); } finally { auteurManuel = null; }
}

/** Ajoute une ligne à l'historique des modifications (ajout seul) */
export async function addHistory(h: { auteur: string; origine: string; donnee: string; cle: string; periode: string; avant: number | null; apres: number | null; brut: string; controles: Check[]; enregistree: boolean; source: string }) {
  const db = await getDb() as any;
  await db.insert(schema.historique).values({ ...h, auteur: auteurManuel ?? h.auteur, avant: h.avant == null ? null : String(h.avant), apres: h.apres == null ? null : String(h.apres), enregistree: h.enregistree ? 1 : 0 });
}
