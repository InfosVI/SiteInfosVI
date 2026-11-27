/**
 * Connexion admin, session signée et blocage de 48 h après 5 échecs en 1 h.
 * Identification anti-abus : cookie aléatoire, adresse IP hachée (clé du jour), empreinte de l'appareil hachée.
 * Le blocage porte sur le cookie OU sur (IP + appareil) ensemble : jamais sur l'adresse IP seule.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, gt, inArray, or, eq } from 'drizzle-orm';
import { verify } from '@node-rs/argon2';
import { getDb, schema } from './db';

const SECRET = () => process.env.SESSION_SECRET || 'dev-uniquement-pas-pour-la-production';
const hmac = (s: string, key = SECRET()) => createHmac('sha256', key).update(s).digest('base64url');
const BLOCK_AFTER = 5, WINDOW_MS = 3600_000, BLOCK_MS = 48 * 3600_000, SESSION_MS = 8 * 3600_000;

export const COOKIE_SESSION = 'mi_session', COOKIE_ID = 'mi_id';

export function readCookie(req: Request, name: string) {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Identifiants anonymisés de la requête */
export function clientKeys(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  const day = new Date().toISOString().slice(0, 10);
  const sig = [req.headers.get('user-agent'), req.headers.get('accept-language'), req.headers.get('sec-ch-ua-platform')].join('|');
  let cookieId = readCookie(req, COOKIE_ID);
  const isNew = !cookieId || !/^[A-Za-z0-9_-]{22}$/.test(cookieId);
  if (isNew) cookieId = randomBytes(16).toString('base64url');
  return { cookieId: cookieId!, isNew, ipHash: hmac(ip, SECRET() + day), sigHash: hmac(sig) };
}
/** Empreintes stables (sans clé du jour) pour les limites d'envoi : cookie haché et adresse IP hachée, jamais en clair */
export function clesLimite(req: Request, cookieId: string) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  return [`c:${hmac(`cookie:${cookieId}`)}`, `n:${hmac(`ip:${ip}`)}`];
}
export const idCookie = (id: string) => `${COOKIE_ID}=${id}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

/** Fin du blocage en cours pour ce visiteur, ou null */
export async function blockedUntil(req: Request): Promise<Date | null> {
  const k = clientKeys(req), db = await getDb() as any;
  const rows = await db.select().from(schema.blocages)
    .where(and(inArray(schema.blocages.cle, [`c:${k.cookieId}`, `n:${k.ipHash}|${k.sigHash}`]), gt(schema.blocages.jusqua, new Date())));
  return rows.length ? new Date(Math.max(...rows.map((r: any) => +new Date(r.jusqua)))) : null;
}

/**
 * Limite par réseau, pour la connexion admin seulement : un robot qui change de cookie et de navigateur à chaque essai
 * contourne le blocage ci-dessous ; au-delà de quelques dizaines d'échecs en 1 h depuis la même adresse (rendue
 * illisible), les essais de connexion sont refusés pendant 1 h. Le reste du site reste accessible à ce réseau.
 */
const ECHECS_RESEAU_MAX = 20;
export async function reseauSature(req: Request) {
  const k = clientKeys(req), db = await getDb() as any;
  const recent = await db.select().from(schema.tentatives)
    .where(and(gt(schema.tentatives.at, new Date(Date.now() - WINDOW_MS)), eq(schema.tentatives.ipHash, k.ipHash))).limit(ECHECS_RESEAU_MAX);
  return recent.length >= ECHECS_RESEAU_MAX;
}

/** Enregistre un échec ; bloque 48 h au 5e échec en 1 h */
export async function recordFailure(req: Request) {
  const k = clientKeys(req), db = await getDb() as any;
  await db.insert(schema.tentatives).values({ cookieId: k.cookieId, ipHash: k.ipHash, sigHash: k.sigHash });
  const since = new Date(Date.now() - WINDOW_MS);
  const recent = await db.select().from(schema.tentatives).where(and(gt(schema.tentatives.at, since),
    or(eq(schema.tentatives.cookieId, k.cookieId), and(eq(schema.tentatives.ipHash, k.ipHash), eq(schema.tentatives.sigHash, k.sigHash)))));
  if (recent.length >= BLOCK_AFTER) {
    const jusqua = new Date(Date.now() + BLOCK_MS);
    await db.insert(schema.blocages).values([{ cle: `c:${k.cookieId}`, jusqua }, { cle: `n:${k.ipHash}|${k.sigHash}`, jusqua }]);
    return jusqua;
  }
  return null;
}

export async function checkPassword(email: string, password: string) {
  const hash = process.env.ADMIN_PASSWORD_HASH, expected = process.env.ADMIN_EMAIL;
  if (!hash || !expected) return false;
  const a = Buffer.from(email.trim().toLowerCase()), b = Buffer.from(expected.trim().toLowerCase());
  const emailOk = a.length === b.length && timingSafeEqual(a, b);
  const passOk = await verify(hash, password).catch(() => false);
  return emailOk && passOk;
}

export const sessionCookie = () => {
  const exp = Date.now() + SESSION_MS, v = `${exp}.${hmac(`admin.${exp}`)}`;
  return `${COOKIE_SESSION}=${v}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
};
export const clearSession = () => `${COOKIE_SESSION}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;

export function isAdmin(req: Request) {
  const v = readCookie(req, COOKIE_SESSION); if (!v) return false;
  const [exp, sig] = v.split('.'); if (!exp || !sig || +exp < Date.now()) return false;
  const good = hmac(`admin.${exp}`);
  return sig.length === good.length && timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

/** Réponse « bloqué » commune (le site entier, en lecture comme en écriture) */
export const blockedResponse = (until: Date) =>
  Response.json({ blocked: true, until: until.toISOString() }, { status: 403, headers: { 'Retry-After': String(Math.ceil((+until - Date.now()) / 1000)) } });
