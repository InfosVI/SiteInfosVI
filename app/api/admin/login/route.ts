import { z } from 'zod';
import { blockedUntil, blockedResponse, checkPassword, clientKeys, idCookie, recordFailure, sessionCookie } from '@/lib/auth';
import { sameOrigin } from '@/lib/admin-api';

const Body = z.object({ email: z.string().max(200), password: z.string().max(200) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const until = await blockedUntil(req);
  if (until) return blockedResponse(until);
  const k = clientKeys(req), headers = new Headers();
  if (k.isNew) headers.append('Set-Cookie', idCookie(k.cookieId));
  const p = Body.safeParse(await req.json().catch(() => null));
  if (p.success && await checkPassword(p.data.email, p.data.password)) {
    headers.append('Set-Cookie', sessionCookie());
    return Response.json({ ok: true }, { headers });
  }
  const blocked = await recordFailure(req);
  if (blocked) return Response.json({ blocked: true, until: blocked.toISOString() }, { status: 403, headers });
  return Response.json({ ok: false, error: 'Identifiants incorrects.' }, { status: 401, headers });
}
