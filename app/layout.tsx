import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './maquette.css';
import './globals.css';
import { reglagesSite } from '@/lib/site';

/** Titre et description : réglages de l'installation (config-site/site.json), jamais écrits dans le code */
export async function generateMetadata(): Promise<Metadata> {
  const site = reglagesSite();
  return { title: `${site.nom} · ${site.sousTitre}`, description: site.description };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
