import { z } from 'zod';
import { and, gt, inArray } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { sameOrigin } from '@/lib/admin-api';
import { blockedUntil, blockedResponse, clientKeys, clesLimite, idCookie } from '@/lib/auth';
import { captchaValide } from '@/lib/altcha';
import { DELAI_H, MAX_TEXTE, nettoyerContact, nettoyerTexte } from '@/lib/contact';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().trim().max(254).email().optional().or(z.literal('')),
  message: z.string().max(MAX_TEXTE * 2),
  altcha: z.string().max(10_000),
}).strict();

/** Formulaire de contact : captcha, 1 message / 12 h par visiteur, texte nettoyé et limité, aucune donnée d'identification stockée avec le message */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  if ((Number(req.headers.get('content-length')) || 0) > 32_000) return Response.json({ error: 'message trop long' }, { status: 413 });
  const until = await blockedUntil(req); if (until) return blockedResponse(until);
  const k = clientKeys(req), headers = new Headers();
  if (k.isNew) headers.append('Set-Cookie', idCookie(k.cookieId));
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'Vérifiez l’adresse email (ou laissez-la vide) et le message.' }, { status: 400, headers });
  const texte = nettoyerTexte(p.data.message);
  if (!texte) return Response.json({ error: 'Écrivez votre message.' }, { status: 400, headers });
  if (texte.length > MAX_TEXTE) return Response.json({ error: `Message trop long (${MAX_TEXTE} caractères au maximum).` }, { status: 400, headers });
  if (!await captchaValide(p.data.altcha)) return Response.json({ error: 'Vérification anti-robot non valide : cochez-la à nouveau.' }, { status: 400, headers });

  const db = await getDb() as any;
  await nettoyerContact();
  const cles = clesLimite(req, k.cookieId);
  const recent = await db.select().from(schema.contactLimites)
    .where(and(inArray(schema.contactLimites.cle, cles), gt(schema.contactLimites.at, new Date(Date.now() - DELAI_H * 3600_000)))).limit(1);
  if (recent.length) {
    const prochain = new Date(new Date(recent[0].at).getTime() + DELAI_H * 3600_000);
    return Response.json({ error: 'Un seul message toutes les 12 heures.', prochain: prochain.toISOString() }, { status: 429, headers });
  }
  await db.insert(schema.messages).values({ email: p.data.email ? p.data.email.toLowerCase() : null, texte });
  await db.insert(schema.contactLimites).values(cles.map(cle => ({ cle })));
  return Response.json({ ok: true }, { headers });
}
