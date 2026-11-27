import { blockedUntil, blockedResponse, isAdmin } from './auth';

/** Garde commune des routes admin : visiteur bloqué → 403 ; non connecté → 401 */
export async function guardAdmin(req: Request): Promise<Response | null> {
  const until = await blockedUntil(req);
  if (until) return blockedResponse(until);
  if (!isAdmin(req)) return Response.json({ error: 'non connecté' }, { status: 401 });
  return null;
}

/** Vérifie que la requête vient bien du site (protection contre les envois depuis un autre site) */
export function sameOrigin(req: Request) {
  const o = req.headers.get('origin'); if (!o) return true;
  try { return new URL(o).host === new URL(req.url).host || new URL(o).host === req.headers.get('host'); } catch { return false; }
}
