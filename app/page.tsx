import PageSite, { metadonnees } from './PageSite';
import { pageParChemin } from '@/lib/pages';

export const dynamic = 'force-dynamic';
const accueil = pageParChemin('/')!;

export const generateMetadata = () => metadonnees(accueil);
export default function Accueil() { return <PageSite page={accueil} />; }
