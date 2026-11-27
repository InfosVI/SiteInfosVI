import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Script from 'next/script';
import pkg from '@/package.json';
import { headers } from 'next/headers';
import { reseauTronque } from '@/lib/reseau';
import { reglagesSite, jsonScript } from '@/lib/site';

/**
 * Pages publiques : reprise fidèle de la maquette validée (navigation par #accueil, #remuneration, #historique…).
 * Le code est dans public/app.js ; les données viennent de la base via /api/data et /api/histo.
 */
export const dynamic = 'force-dynamic';
const shell = readFileSync(join(process.cwd(), 'content', 'shell.html'), 'utf8');

export default async function Site() {
  // Version en ligne : vX.Y.Z ; aperçu : prochaine version (package.json) + repère du code
  const v = process.env.APP_VERSION;
  const version = v && /^v\d/.test(v) ? v
    : `v${pkg.version} en préparation${process.env.GIT_SHA ? ` · ${process.env.GIT_SHA.slice(0, 7)}` : ''}`;
  const site = reglagesSite();
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const html = shell.replace('__VERSION__', version).replaceAll('__SITE_NOM__', esc(site.nom)).replaceAll('__SITE_SOUS_TITRE__', esc(site.sousTitre));
  // Mesure d'audience (Umami, sur le serveur du site) : seulement si elle est installée ; le script n'est chargé
  // par app.js que si le visiteur ne l'a pas refusée dans la page Confidentialité.
  const id = process.env.UMAMI_WEBSITE_ID, domaine = process.env.SITE_URL?.replace(/^https?:\/\/(apercu\.)?/, '');
  const apercu = /\/\/apercu\./.test(process.env.SITE_URL ?? '');   // l'aperçu privé n'est jamais compté
  const stats = id && !apercu && /^[0-9a-f-]{36}$/i.test(id) ?`window.SITE_STATS=${jsonScript({ websiteId: id, hostUrl: '/u', url: domaine ? `https://stats.${domaine}` : '', reseau: reseauTronque((await headers()).get('x-forwarded-for')) })};` : '';
  return (<>
    <script dangerouslySetInnerHTML={{ __html: `window.SITE=${jsonScript(site)};` }} />
    {stats && <script dangerouslySetInnerHTML={{ __html: stats }} />}
    <div dangerouslySetInnerHTML={{ __html: html }} />
    <Script src="/app.js" strategy="afterInteractive" />
  </>);
}
