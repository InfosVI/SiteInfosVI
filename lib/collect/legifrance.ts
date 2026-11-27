/**
 * Légifrance (API PISTE, OAuth) : versions en vigueur des 3 textes de la part fixe et recalcul de la part fixe
 * (indice brut 244 → indice majoré → traitement annuel → 50 % ÷ 12, tronqué au centime). Le jeton n'est jamais journalisé.
 */
import { asc } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { checkVal, allOk } from '../checks';
import { newEntry, log, fetchRetry, saveEntry } from './core';

const API = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/getArticle';
const FORMULE = 'LEGIARTI000043238842';   // décret 2000-1159, art. 18
const plain = (x: string) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const ms2d = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Indice majoré de l'indice brut 244 (tableau lu par paires indice brut / indice majoré) */
export function majoreDe244(texteBaremeA: string) {
  const t = plain(texteBaremeA), i = t.toUpperCase().indexOf('INDICES MAJOR');
  const nums = (i >= 0 ? t.slice(i) : t).match(/\b\d{2,4}\b/g)!.map(Number);
  const pairs = new Map<number, number>(); for (let k = 0; k + 1 < nums.length; k += 2) pairs.set(nums[k], nums[k + 1]);
  return pairs.get(244) ?? null;
}
/** Traitement annuel brut d'un indice majoré (barème B : « 314 18 549,05 ») */
export function traitementDe(texteBaremeB: string, im: number) {
  const m = plain(texteBaremeB).match(new RegExp(`\\b${im} (\\d{1,2} \\d{3},\\d{2})`));
  return m ? Number(m[1].replace(' ', '').replace(',', '.')) : null;
}

export async function collectLegifrance() {
  const db = await getDb() as any, out = [];
  const id = process.env.PISTE_CLIENT_ID, secret = process.env.PISTE_CLIENT_SECRET;
  const eT = newEntry('fixe', 'Légifrance (API PISTE)', 'Jeton d’accès OAuth', 'https://oauth.piste.gouv.fr/api/oauth/token', 'POST');
  if (!id || !secret) {
    eT.status = 'fail'; eT.err = 'Identifiants de l’API Légifrance (PISTE) absents de la configuration.'; eT.todo = 'Ajouter PISTE_CLIENT_ID et PISTE_CLIENT_SECRET dans le fichier .env du serveur.';
    log(eT, 'err', 'Requête non envoyée : identifiants absents'); await saveEntry(eT); return [eT];
  }
  const tb = await fetchRetry(eT, 'https://oauth.piste.gouv.fr/api/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'openid' }).toString() });
  let tok: string | null = null; try { tok = tb ? JSON.parse(tb.toString('utf8')).access_token : null; } catch { /* réponse illisible */ }
  if (!tok) { eT.status = 'fail'; eT.err = 'Jeton d’accès refusé ou absent.'; eT.todo = 'Vérifier les identifiants PISTE et l’abonnement de l’application à l’API Légifrance.'; log(eT, 'err', eT.err); await saveEntry(eT); return [eT]; }
  eT.status = 'none'; log(eT, 'ok', 'Jeton obtenu (valable 1 heure ; jamais écrit dans le journal)'); await saveEntry(eT); out.push(eT);

  const fixes = await db.select().from(schema.partFixe).orderBy(asc(schema.partFixe.dateEffet)), last = fixes.at(-1);
  const arts: [string, string][] = [[FORMULE, 'Décret 2000-1159, art. 18 (formule)'], [last.sourceIndices, 'Grille des indices (barème A)'], [last.sourceTraitement, 'Barème des traitements (barème B)']];
  const txt: Record<string, string> = {}; let depuis = '';
  for (const [aid, lab] of arts) {
    const e = newEntry('fixe', 'Légifrance (API PISTE)', lab, `${API}  {"id":"${aid}"}`, 'POST');
    const b = await fetchRetry(e, API, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ id: aid }) });
    if (!b) { e.err = 'Légifrance n’a pas répondu.'; e.todo = 'Rien à faire : nouvel essai au prochain passage ; la part fixe stockée reste utilisée.'; await saveEntry(e); out.push(e); continue; }
    const a = JSON.parse(b.toString('utf8')).article ?? {};
    const vig = (a.articleVersions ?? []).filter((v: any) => v.etat === 'VIGUEUR').at(-1);
    e.concerne = a.dateDebut ? ms2d(a.dateDebut) : ''; if (aid !== FORMULE) depuis = e.concerne;
    txt[aid] = a.texte ?? '';
    log(e, 'info', `Version en vigueur : ${vig?.id ?? a.id} (depuis le ${e.concerne})`);
    if (vig && vig.id !== aid) { e.status = 'check'; e.todo = `Nouvelle version du texte en vigueur (${vig.id}) : vérifier le calcul de la part fixe et la saisir dans l’espace admin si elle change.`; log(e, 'warn', 'NOUVELLE VERSION en vigueur'); }
    else { e.status = 'none'; log(e, 'ok', 'Identique à la version connue : rien de nouveau'); }
    await saveEntry(e); out.push(e);
  }

  const e = newEntry('fixe', 'Légifrance (API PISTE)', 'Calcul de la part fixe', 'calcul à partir des 3 textes ci-dessus', 'calcul');
  const im = txt[last.sourceIndices] ? majoreDe244(txt[last.sourceIndices]) : null;
  const ann = im && txt[last.sourceTraitement] ? traitementDe(txt[last.sourceTraitement], im) : null;
  if (!im || !ann) { e.status = 'fail'; e.err = 'Calcul impossible : indice ou traitement introuvable dans les textes reçus.'; e.todo = 'Le format des barèmes a peut-être changé : ouvrir les textes et saisir la part fixe à la main si besoin.'; log(e, 'err', e.err); }
  else {
    const pf = Math.floor(ann / 24 * 100 + 1e-9) / 100, raw = pf.toFixed(2), stored = Number(last.montant);
    const ck = checkVal('fixe', raw, depuis.slice(0, 7), true);
    e.values = [{ key: 'TOUTES', label: 'part fixe mensuelle (toutes les zones)', v: pf, raw, dec: 2, checks: ck }]; e.concerne = depuis;
    log(e, 'info', `Indice brut 244 → indice majoré ${im} (barème A)`);
    log(e, 'info', `Indice majoré ${im} → traitement annuel brut ${ann.toFixed(2).replace('.', ',')} € (barème B)`);
    log(e, 'info', `Formule (art. 18) : 50 % × ${ann.toFixed(2).replace('.', ',')} ÷ 12 = ${(ann / 24).toFixed(4).replace('.', ',')} → tronqué au centime = ${raw.replace('.', ',')} €`);
    log(e, allOk(ck) ? 'info' : 'err', allOk(ck) ? 'Contrôle type et format : conforme' : 'Contrôle type et format : refusé');
    if (Math.abs(pf - stored) < 1e-9) { e.status = 'none'; log(e, 'ok', `Identique à la valeur stockée (${stored.toFixed(2).replace('.', ',')} €) : rien écrit`); }
    else { e.status = 'check'; e.todo = `Part fixe recalculée (${raw} €) différente de la valeur stockée (${stored.toFixed(2)} €) : vérifier, puis saisir la nouvelle valeur dans l’espace admin.`; log(e, 'warn', e.todo); }
  }
  e.http = null; await saveEntry(e); out.push(e);
  return out;
}
