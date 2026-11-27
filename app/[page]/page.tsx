import { notFound } from 'next/navigation';
import PageSite, { metadonnees } from '../PageSite';
import { pageParChemin } from '@/lib/pages';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ page: string }> };

/** Pages publiques : /pouvoir-achat, /historique, /grille-indemnites… (toute autre adresse : page introuvable) */
export async function generateMetadata({ params }: Params) {
  const p = pageParChemin('/' + (await params).page);
  return p ? metadonnees(p) : {};
}
export default async function Page({ params }: Params) {
  const p = pageParChemin('/' + (await params).page);
  if (!p || p.chemin === '/') notFound();
  return <PageSite page={p} />;
}
