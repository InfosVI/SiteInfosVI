import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, inArray, or, lt, desc, like } from 'drizzle-orm';
import { getDb, schema } from './db';
import { buildExports } from './export';
import { quarterStart, addMonths } from './format';
import { addHistory } from './collect/core';

/**
 * Propositions de la communauté et votes.
 * - une proposition toutes les 12 h par visiteur (cookie OU réseau) pour un même type de valeur, une même zone et une même date, captcha obligatoire ;
 * - votes : 3 positifs et 2 négatifs par 24 h, un seul vote par proposition ; captcha résolu une fois par heure ;
 * - une seule valeur validée par partie + zone + date (les autres sont rejetées automatiquement) ;
 * - nettoyage quotidien : rejetées de plus de 3 mois, en attente de plus de 6 mois, et 7 propositions au plus par groupe.
 * Aucune donnée personnelle : le visiteur n'est connu que par des empreintes (cookie et adresse IP hachés).
 */
export const QUOTA = { up: 3, down: 2 }, MAX_PROPS = 7, DELAI_PROP_H = 12;
const STATUT_AFFICHE: Record<string, string> = { attente: 'En attente', validee: 'Validée par un admin', rejetee: 'Rejetée' };
const num = (v: unknown) => Number(v);
const SECRET = () => process.env.SESSION_SECRET || 'dev-uniquement-pas-pour-la-production';

/** Jeton « captcha résolu » pour voter pendant 1 h sans refaire le captcha à chaque vote */
export const COOKIE_VOTE = 'mi_vote';
export function jetonVote() {
  const exp = Date.now() + 3600_000, sig = createHmac('sha256', SECRET()).update(`vote.${exp}`).digest('base64url');
  return `${COOKIE_VOTE}=${exp}.${sig}; Path=/; Max-Age=3600; HttpOnly; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export function jetonVoteValide(v: string | null) {
  if (!v) return false;
  const [exp, sig] = v.split('.'); if (!exp || !sig || +exp < Date.now()) return false;
  const bon = createHmac('sha256', SECRET()).update(`vote.${exp}`).digest('base64url');
  return sig.length === bon.length && timingSafeEqual(Buffer.from(sig), Buffer.from(bon));
}

/** Liste publique (format attendu par la page), avec les votes du visiteur et ce qu'il lui reste à voter */
export async function lister(cles: { votant: string; reseau: string }) {
  const db = await getDb() as any;
  const rows = await db.select().from(schema.propositions).orderBy(desc(schema.propositions.id));
  const ids = rows.map((r: any) => r.id);
  const vs = ids.length ? await db.select().from(schema.votes).where(inArray(schema.votes.propositionId, ids)) : [];
  const propositions = rows.map((r: any) => {
    const v = vs.filter((x: any) => x.propositionId === r.id), mien = v.find((x: any) => x.votant === cles.votant);
    return {
      id: r.id, type: r.type, z: r.zone, eff: r.eff, input: r.saisie, geo: num(r.valeur), pct: num(r.pct), ref: r.ref, refGeo: num(r.refValeur),
      up: v.filter((x: any) => x.sens === 1).length, down: v.filter((x: any) => x.sens === -1).length,
      s: STATUT_AFFICHE[r.statut] ?? 'En attente', auto: !!r.auto, my: mien ? mien.sens : 0, at: new Date(r.at).toISOString().slice(0, 10),
    };
  });
  return { propositions, quota: await quotaRestant(cles), deja: await dejaProposees(cles) };
}

/** Clés de la limite des 12 h : une par type de valeur + zone + date, pour le cookie et pour le réseau */
export const clesLimite = (type: string, zone: string, eff: string, cles: { votant: string; reseau: string }) =>
  [cles.votant, cles.reseau].map(h => `prop|${type}|${zone}|${eff}|${h}`);

/** Types + zones + dates déjà proposés par ce visiteur depuis moins de 12 h, avec l'heure de la prochaine proposition possible */
export async function dejaProposees(cles: { votant: string; reseau: string }) {
  const db = await getDb() as any;
  const rows = await db.select().from(schema.contactLimites).where(and(gt(schema.contactLimites.at, new Date(Date.now() - DELAI_PROP_H * 3600_000)),
    or(like(schema.contactLimites.cle, `prop|%|${cles.votant}`), like(schema.contactLimites.cle, `prop|%|${cles.reseau}`))));
  const out = new Map<string, { type: string; z: string; eff: string; prochain: string }>();
  for (const r of rows) {
    const parts = String(r.cle).split('|'), eff = parts[parts.length - 2];
    if (parts.length < 5 || !/^\d{4}-\d\d$/.test(eff)) continue;   // anciennes clés (sans date) ignorées
    const type = parts[1], z = parts.slice(2, -2).join('|'), k = `${type}|${z}|${eff}`;
    const prochain = new Date(new Date(r.at).getTime() + DELAI_PROP_H * 3600_000).toISOString();
    if (!out.has(k) || out.get(k)!.prochain < prochain) out.set(k, { type, z, eff, prochain });
  }
  return [...out.values()];
}

async function quotaRestant(cles: { votant: string; reseau: string }) {
  const db = await getDb() as any;
  const recents = await db.select().from(schema.votes).where(and(gt(schema.votes.at, new Date(Date.now() - 86400_000)),
    or(eq(schema.votes.votant, cles.votant), eq(schema.votes.reseau, cles.reseau))));
  return { up: Math.max(0, QUOTA.up - recents.filter((x: any) => x.sens === 1).length), down: Math.max(0, QUOTA.down - recents.filter((x: any) => x.sens === -1).length) };
}

/** Valeur de référence (dernière valeur officielle connue avant le mois choisi), calculée par le serveur */
export async function reference(type: 'geo' | 'fixe', zone: string, eff: string) {
  const { data, histo } = await buildExports() as any;
  if (type === 'fixe') {
    const f = [...histo.fixe].reverse().find((x: any) => x[0] < eff) ?? histo.fixe[0];
    return f ? { ref: f[0] as string, valeur: Number(f[1]) } : null;
  }
  const sr = data.canada[zone]?.series as any[] | undefined; if (!sr) return null;
  const r = [...sr].reverse().find(x => x.m < eff && x.vie != null);
  return r ? { ref: quarterStart(r.m), valeur: Number(r.vie) } : null;
}

/** Mois proposables : les 6 mois précédents, le mois en cours et les 3 suivants (comme le formulaire) */
export function moisAutorises(maintenant = new Date()) {
  const m = maintenant.toISOString().slice(0, 7);
  return Array.from({ length: 10 }, (_, k) => addMonths(m, k - 6));
}
export const zonesAutorisees = async () => Object.keys((await buildExports() as any).data.canada);

/** Enregistre une proposition (valeurs déjà vérifiées par l'appelant) ; l'autre valeur est calculée ici */
export async function creer(p: { type: 'geo' | 'fixe'; zone: string; eff: string; saisie: 'eur' | 'pct'; valeur: number; source: string | null }, ref: { ref: string; valeur: number }) {
  const geo = p.saisie === 'pct' ? Math.trunc(ref.valeur * (1 + p.valeur / 100) * 100) / 100 : Math.round(p.valeur * 100) / 100;
  const pct = p.saisie === 'pct' ? Math.round(p.valeur * 100) / 100 : Math.round((geo / ref.valeur - 1) * 10000) / 100;
  if (!(geo > 0) || Math.abs(pct) > 30) return { erreur: 'Valeur peu vraisemblable : l’écart avec la valeur précédente dépasse 30 %.' };
  const db = await getDb() as any;
  await db.insert(schema.propositions).values({
    type: p.type, zone: p.type === 'fixe' ? 'TOUTES' : p.zone, eff: p.eff, saisie: p.saisie, valeur: String(geo), pct: String(pct),
    ref: ref.ref, refValeur: String(ref.valeur), source: p.source, statut: 'attente',
  });
  return { ok: true as const };
}

/** Vote (1, -1) ou annulation (0) ; un seul vote par proposition et par votant, dans la limite des 24 h */
export async function voter(id: number, sens: 1 | -1 | 0, cles: { votant: string; reseau: string }) {
  const db = await getDb() as any;
  const [p] = await db.select().from(schema.propositions).where(eq(schema.propositions.id, id));
  if (!p) return { erreur: 'Proposition introuvable.' };
  if (p.statut !== 'attente') return { erreur: 'Cette proposition n’est plus ouverte aux votes.' };
  const [mien] = await db.select().from(schema.votes).where(and(eq(schema.votes.propositionId, id), eq(schema.votes.votant, cles.votant)));
  if (sens === 0) { if (mien) await db.delete(schema.votes).where(eq(schema.votes.id, mien.id)); return { ok: true as const }; }
  if (mien) return { erreur: 'Vous avez déjà voté pour cette valeur : annulez d’abord votre vote.' };
  const q = await quotaRestant(cles);
  if ((sens === 1 && !q.up) || (sens === -1 && !q.down)) return { erreur: `Plus de vote ${sens === 1 ? 'positif' : 'négatif'} disponible : ils sont renouvelés toutes les 24 heures.` };
  await db.insert(schema.votes).values({ propositionId: id, votant: cles.votant, reseau: cles.reseau, sens });
  return { ok: true as const };
}

/** « Réinitialiser mes votes » : retire les votes de ce visiteur sur les propositions encore ouvertes */
export async function reinitialiserVotes(cles: { votant: string }) {
  const db = await getDb() as any;
  const ouvertes = (await db.select().from(schema.propositions).where(eq(schema.propositions.statut, 'attente'))).map((r: any) => r.id);
  if (ouvertes.length) await db.delete(schema.votes).where(and(eq(schema.votes.votant, cles.votant), inArray(schema.votes.propositionId, ouvertes)));
}

/** Actions de l'administrateur : valider, dévalider, rejeter, remettre en attente, supprimer (définitif) */
export async function moderer(id: number, action: 'valider' | 'devalider' | 'rejeter' | 'rouvrir' | 'supprimer') {
  const db = await getDb() as any;
  const [p] = await db.select().from(schema.propositions).where(eq(schema.propositions.id, id));
  if (!p) return { erreur: 'Proposition introuvable.' };
  const groupe = and(eq(schema.propositions.type, p.type), eq(schema.propositions.zone, p.zone), eq(schema.propositions.eff, p.eff));
  const autres = (await db.select().from(schema.propositions).where(groupe)).filter((q: any) => q.id !== p.id);
  const set = (q: any, statut: string, auto: number) => db.update(schema.propositions).set({ statut, auto }).where(eq(schema.propositions.id, q.id));
  const v = await db.select().from(schema.votes).where(eq(schema.votes.propositionId, p.id));
  const votesTxt = `▲ ${v.filter((x: any) => x.sens === 1).length} · ▼ ${v.filter((x: any) => x.sens === -1).length}`;
  if (action === 'valider') {
    const prev = autres.find((q: any) => q.statut === 'validee');
    for (const q of autres) if (q.statut !== 'rejetee') await set(q, 'rejetee', 1);
    await set(p, 'validee', 0);
    await addHistory({ auteur: 'Administrateur', origine: 'val', donnee: p.type, cle: p.zone, periode: p.eff, avant: prev ? num(prev.valeur) : null, apres: num(p.valeur),
      brut: String(p.valeur), controles: [], enregistree: true, source: `proposition communautaire (${votesTxt})` });
  } else if (action === 'supprimer') {
    // Une valeur validée est d'abord dévalidée (les propositions rejetées automatiquement repassent en attente)
    if (p.statut === 'validee') {
      for (const q of autres) if (q.auto) await set(q, 'attente', 0);
      await addHistory({ auteur: 'Administrateur', origine: 'unval', donnee: p.type, cle: p.zone, periode: p.eff, avant: num(p.valeur), apres: null,
        brut: '', controles: [], enregistree: true, source: 'proposition validée supprimée' });
    }
    await db.delete(schema.votes).where(eq(schema.votes.propositionId, p.id));
    await db.delete(schema.propositions).where(eq(schema.propositions.id, p.id));
  } else if (action === 'devalider') {
    if (p.statut !== 'validee') return { erreur: 'Cette proposition n’est pas validée.' };
    await set(p, 'attente', 0);
    for (const q of autres) if (q.auto) await set(q, 'attente', 0);
    await addHistory({ auteur: 'Administrateur', origine: 'unval', donnee: p.type, cle: p.zone, periode: p.eff, avant: num(p.valeur), apres: null,
      brut: '', controles: [], enregistree: true, source: 'valeur communautaire retirée' });
  } else if (action === 'rejeter') await set(p, 'rejetee', 0);
  else await set(p, 'attente', 0);
  return { ok: true as const };
}

/** Nettoyage (chaque jour avec la collecte, ou bouton de l'espace admin) ; renvoie le nombre de propositions retirées */
export async function nettoyerPropositions() {
  const db = await getDb() as any;
  // Page Confidentialité : votes « sans lien avec vous après 30 jours » → empreintes du votant effacées au bout de 30 jours
  await db.update(schema.votes).set({ votant: 'anonyme', reseau: 'anonyme' }).where(lt(schema.votes.at, new Date(Date.now() - 30 * 86400_000)));
  const il = (mois: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - mois); return d; };
  const anciennes = await db.select().from(schema.propositions).where(or(
    and(eq(schema.propositions.statut, 'rejetee'), lt(schema.propositions.at, il(3))),
    and(eq(schema.propositions.statut, 'attente'), lt(schema.propositions.at, il(6)))));
  const retirer = new Set<number>(anciennes.map((r: any) => r.id));
  const toutes = (await db.select().from(schema.propositions)).filter((r: any) => !retirer.has(r.id));
  const vs = await db.select().from(schema.votes);
  const score = (r: any) => vs.filter((x: any) => x.propositionId === r.id).reduce((s: number, x: any) => s + x.sens, 0);
  const groupes = new Map<string, any[]>();
  for (const r of toutes) { const k = `${r.type}|${r.zone}|${r.eff}`; groupes.set(k, [...(groupes.get(k) ?? []), r]); }
  for (const g of groupes.values()) {
    if (g.length <= MAX_PROPS) continue;
    const dist = (r: any) => Math.abs(num(r.valeur) - num(r.refValeur));
    const classees = g.slice().sort((a, b) => Number(a.statut === 'validee') - Number(b.statut === 'validee') || score(a) - score(b) || dist(b) - dist(a));
    for (const r of classees.slice(0, g.length - MAX_PROPS)) retirer.add(r.id);
  }
  if (retirer.size) {
    const ids = [...retirer];
    await db.delete(schema.votes).where(inArray(schema.votes.propositionId, ids));
    await db.delete(schema.propositions).where(inArray(schema.propositions.id, ids));
  }
  return retirer.size;
}
