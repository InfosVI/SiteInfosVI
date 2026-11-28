import { z } from 'zod';
import { and, gt, inArray } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { sameOrigin } from '@/lib/admin-api';
import { blockedUntil, blockedResponse } from '@/lib/auth';
import { captchaValide } from '@/lib/altcha';
import { nettoyerTexte } from '@/lib/contact';
import { visiteur } from '@/lib/visiteur';
import { clesLimite, creer, lister, moisAutorises, reference, zonesAutorisees, DELAI_PROP_H } from '@/lib/propositions';

export const dynamic = 'force-dynamic';

/** Liste publique des propositions, avec les votes du visiteur et ses votes restants */
export async function GET(req: Request) {
  const v = visiteur(req);
  v.headers.set('Cache-Control', 'no-store');
  return Response.json(await lister(v.cles), { headers: v.headers });
}

const Body = z.object({
  type: z.enum(['geo', 'fixe']), z: z.string().max(80), eff: z.string().regex(/^\d{4}-\d\d$/), saisie: z.enum(['eur', 'pct']),
  valeur: z.number().finite(), source: z.string().max(300).optional().default(''), altcha: z.string().max(10_000),
}).strict();

/** Nouvelle proposition : captcha, une toutes les 12 h par visiteur pour un même type, une même zone et une même date, valeur de référence recalculée par le serveur */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const until = await blockedUntil(req); if (until) return blockedResponse(until);
  const { cles, headers } = visiteur(req);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'Proposition incomplète ou invalide.' }, { status: 400, headers });
  const b = p.data;
  if (!moisAutorises().includes(b.eff)) return Response.json({ error: 'Mois non proposable.' }, { status: 400, headers });
  if (b.type === 'geo' && !(await zonesAutorisees()).includes(b.z)) return Response.json({ error: 'Zone inconnue.' }, { status: 400, headers });
  if (!await captchaValide(b.altcha)) return Response.json({ error: 'Vérification anti-robot non valide : cochez-la à nouveau.' }, { status: 400, headers });
  const db = await getDb() as any;
  const limite = clesLimite(b.type, b.type === 'fixe' ? 'TOUTES' : b.z, b.eff, cles);
  const recent = await db.select().from(schema.contactLimites)
    .where(and(inArray(schema.contactLimites.cle, limite), gt(schema.contactLimites.at, new Date(Date.now() - DELAI_PROP_H * 3600_000)))).limit(1);
  if (recent.length) {
    const prochain = new Date(new Date(recent[0].at).getTime() + DELAI_PROP_H * 3600_000).toISOString();
    return Response.json({ error: 'Une seule proposition toutes les 12 heures pour ce type de valeur, cette zone et cette date.', prochain }, { status: 429, headers });
  }
  const ref = await reference(b.type, b.z, b.eff);
  if (!ref) return Response.json({ error: 'Aucune valeur de référence pour cette zone et cette date.' }, { status: 400, headers });
  const r = await creer({ type: b.type, zone: b.z, eff: b.eff, saisie: b.saisie, valeur: b.valeur, source: nettoyerTexte(b.source).slice(0, 300) || null }, ref);
  if ('erreur' in r) return Response.json({ error: r.erreur }, { status: 400, headers });
  // Limite des 12 h (même table que le formulaire de contact, effacée après 12 h)
  await db.insert(schema.contactLimites).values(limite.map(cle => ({ cle })));
  return Response.json({ ok: true, ...(await lister(cles)) }, { headers });
}
