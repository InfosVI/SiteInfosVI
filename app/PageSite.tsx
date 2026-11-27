import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Script from 'next/script';
import pkg from '@/package.json';
import { headers } from 'next/headers';
import { reseauTronque } from '@/lib/reseau';
import type { Metadata } from 'next';
import { reglagesSite, jsonScript } from '@/lib/site';
import { PAGES, type Page } from '@/lib/pages';

/**
 * Pages publiques : reprise fidèle de la maquette validée. Une adresse par page (/pouvoir-achat, /historique…) ;
 * le code est dans public/app.js, les données viennent de la base via /api/data et /api/histo.
 * Le serveur écrit déjà le titre et la description de la page (lisibles par les moteurs de recherche),
 * remplacés par le contenu complet dès que app.js a chargé les données.
 */
const shell = readFileSync(join(process.cwd(), 'content', 'shell.html'), 'utf8');

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const base = () => (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** Titre, description, adresse canonique et aperçu de partage de la page */
export function metadonnees(page: Page): Metadata {
  const site = reglagesSite();
  const titre = page.vue === 'accueil' ? `${site.nom} · ${page.titre}` : `${page.titre} · ${site.nom}`;
  return {
    metadataBase: new URL(base()),
    title: titre, description: page.description,
    alternates: { canonical: page.chemin },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: site.nom, title: titre, description: page.description, url: page.chemin,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: page.titre }] },
    twitter: { card: 'summary_large_image', title: titre, description: page.description, images: ['/opengraph-image'] },
  };
}

export default async function PageSite({ page }: { page: Page }) {
  // Version en ligne : vX.Y.Z ; aperçu : prochaine version (package.json) + repère du code
  const v = process.env.APP_VERSION;
  const version = v && /^v\d/.test(v) ? v
    : `v${pkg.version} en préparation${process.env.GIT_SHA ? ` · ${process.env.GIT_SHA.slice(0, 7)}` : ''}`;
  const site = reglagesSite();
  // Contenu écrit par le serveur dans la zone principale : titre et description de la page, et liens vers les autres pages
  const apercuSeo = `<h1>${esc(page.titre)}</h1><p>${esc(page.description)}</p><ul>${PAGES.filter(p => p.vue !== page.vue)
    .map(p => `<li><a href="${p.chemin}">${esc(p.titre)}</a></li>`).join('')}</ul>`;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: site.nom, url: base() + '/', description: site.description, inLanguage: 'fr' };
  const html = shell.replace('<main class="wrap" id="app"></main>', `<main class="wrap" id="app">${apercuSeo}</main>`).replace('__VERSION__', version).replaceAll('__SITE_NOM__', esc(site.nom)).replaceAll('__SITE_SOUS_TITRE__', esc(site.sousTitre));
  // Mesure d'audience (Umami, sur le serveur du site) : seulement si elle est installée ; le script n'est chargé
  // par app.js que si le visiteur ne l'a pas refusée dans la page Confidentialité.
  const id = process.env.UMAMI_WEBSITE_ID, domaine = process.env.SITE_URL?.replace(/^https?:\/\/(apercu\.)?/, '');
  const apercu = /\/\/apercu\./.test(process.env.SITE_URL ?? '');   // l'aperçu privé n'est jamais compté
  const stats = id && !apercu && /^[0-9a-f-]{36}$/i.test(id) ?`window.SITE_STATS=${jsonScript({ websiteId: id, hostUrl: '/u', url: domaine ? `https://stats.${domaine}` : '', reseau: reseauTronque((await headers()).get('x-forwarded-for')) })};` : '';
  return (<>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonScript(jsonLd) }} />
    <script dangerouslySetInnerHTML={{ __html: `window.SITE=${jsonScript(site)};` }} />
    {stats && <script dangerouslySetInnerHTML={{ __html: stats }} />}
    <div dangerouslySetInnerHTML={{ __html: html }} />
    <Script src="/app.js" strategy="afterInteractive" />
  </>);
}
