import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Réglages propres à UNE installation du site (nom, hébergeur, lien de dons, coûts d'hébergement).
 * Ils ne sont jamais dans le dépôt : fichier `config-site/site.json` à côté du code (voir `site.exemple.json`),
 * monté en lecture seule dans le conteneur. Sans ce fichier, le site affiche des valeurs neutres.
 */
const Poste = (par: 'mois' | 'an') => z.object({ nom: z.string().max(120), ht: z.number().nonnegative(), taxes: z.number().min(0).max(1).default(0), dev: z.string().regex(/^[A-Z]{3}$/), par: z.literal(par).default(par) });
const Site = z.object({
  nom: z.string().min(1).max(60).default('Mon site VI'),
  sousTitre: z.string().max(120).default('Infos publiques sur les volontaires internationaux'),
  description: z.string().max(300).default("Le guide pratique des volontaires internationaux : indemnité VIE / VIA et pouvoir d'achat, à partir de données publiques."),
  dons: z.string().url().startsWith('https://').nullable().default(null),
  hebergeur: z.object({
    nom: z.string().max(120), adresse: z.string().max(200), telephone: z.string().max(60).optional(),
    lieu: z.string().max(120).optional(), lien: z.string().url().startsWith('https://').optional(),
  }).nullable().default(null),
  hebergement: z.object({ debut: z.string().regex(/^\d{4}-\d\d-\d\d$/), serveur: Poste('mois'), domaine: Poste('an') }).nullable().default(null),
});
export type SiteConf = z.infer<typeof Site>;

let cache: { at: number; conf: SiteConf } | null = null;

/** Réglages du site (relus au plus une fois par minute) */
export function reglagesSite(): SiteConf {
  if (cache && Date.now() - cache.at < 60_000) return cache.conf;
  let brut: unknown = {};
  try { brut = JSON.parse(readFileSync(process.env.SITE_CONFIG || join(/* turbopackIgnore: true */ process.cwd(), 'config-site', 'site.json'), 'utf8')); }
  catch { /* fichier absent : valeurs neutres */ }
  const p = Site.safeParse(brut);
  if (!p.success) console.error('config-site/site.json invalide, valeurs neutres utilisées :', p.error.issues.map(i => i.path.join('.')).join(', '));
  const conf = p.success ? p.data : Site.parse({});
  cache = { at: Date.now(), conf };
  return conf;
}

/** JSON sûr à placer dans une balise <script> */
export const jsonScript = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
