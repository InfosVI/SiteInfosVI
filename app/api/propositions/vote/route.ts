import { z } from 'zod';
import { sameOrigin } from '@/lib/admin-api';
import { blockedUntil, blockedResponse, readCookie } from '@/lib/auth';
import { captchaValide } from '@/lib/altcha';
import { visiteur } from '@/lib/visiteur';
import { COOKIE_VOTE, jetonVote, jetonVoteValide, lister, reinitialiserVotes, voter } from '@/lib/propositions';

export const dynamic = 'force-dynamic';

const Body = z.object({ id: z.number().int().positive(), sens: z.union([z.literal(1), z.literal(-1), z.literal(0)]), altcha: z.string().max(10_000).optional() }).strict();

/** Vote (1 / -1) ou annulation (0). Captcha demandé une fois par heure (jeton « captcha résolu » ensuite). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const until = await blockedUntil(req); if (until) return blockedResponse(until);
  const { cles, headers } = visiteur(req);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'requête invalide' }, { status: 400, headers });
  if (!jetonVoteValide(readCookie(req, COOKIE_VOTE))) {
    if (!p.data.altcha || !await captchaValide(p.data.altcha)) {
      return Response.json({ error: 'Cochez d’abord la vérification anti-robot (au-dessus des propositions).', captcha: true }, { status: 400, headers });
    }
    headers.append('Set-Cookie', jetonVote());
  }
  const r = await voter(p.data.id, p.data.sens, cles);
  if ('erreur' in r) return Response.json({ error: r.erreur, ...(await lister(cles)) }, { status: 400, headers });
  return Response.json({ ok: true, ...(await lister(cles)) }, { headers });
}

/** « Réinitialiser mes votes » */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const { cles, headers } = visiteur(req);
  await reinitialiserVotes(cles);
  return Response.json({ ok: true, ...(await lister(cles)) }, { headers });
}
