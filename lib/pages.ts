/**
 * Pages publiques : une vraie adresse par page (pour les moteurs de recherche et le partage de liens),
 * avec un titre et une description propres. La même table est reprise dans public/app.js (ROUTES) :
 * un test vérifie qu'elles restent identiques.
 */
export type Page = { vue: string; chemin: string; titre: string; description: string; frequence: 'daily' | 'weekly' | 'monthly'; priorite: number; indexer?: boolean };

export const PAGES: Page[] = [
  { vue: 'accueil', chemin: '/', titre: 'Indemnité VIE et VIA par pays : montant, évolution, pouvoir d’achat',
    description: 'Indemnité des volontaires internationaux (VIE, VIA) par pays, son évolution et le pouvoir d’achat sur place, d’après les sources officielles. Gratuit, sans compte.',
    frequence: 'daily', priorite: 1 },
  { vue: 'remuneration', chemin: '/pouvoir-achat', titre: 'Pouvoir d’achat VI : indemnité convertie en monnaie locale et inflation',
    description: 'Indemnité mensuelle VIE / VIA : part fixe, part géographique, conversion en monnaie locale au taux de la BCE et évolution du pouvoir d’achat sur place.',
    frequence: 'daily', priorite: 0.9 },
  { vue: 'historique', chemin: '/historique', titre: 'Historique mois par mois de l’indemnité et des taux de change',
    description: 'Évolution mois par mois de l’indemnité VIE / VIA depuis 2014 : part fixe, part géographique, taux de change et inflation, avec graphique et données.',
    frequence: 'weekly', priorite: 0.8 },
  { vue: 'pays', chemin: '/grille-indemnites', titre: 'Grille détaillée des indemnités par pays et par ville',
    description: 'Montant de l’indemnité mensuelle VIE et VIA dans chaque pays et chaque ville, tiré des arrêtés publiés au Journal officiel.',
    frequence: 'weekly', priorite: 0.9 },
  { vue: 'comparaison', chemin: '/comparaison-pays', titre: 'Carte et classement des pays : indemnité, change, coût de la vie',
    description: 'Carte du monde et classement des pays : indemnité des volontaires internationaux en euros, taux de change, coût de la vie et pouvoir d’achat.',
    frequence: 'weekly', priorite: 0.8 },
  { vue: 'proposer', chemin: '/proposer', titre: 'Proposer une valeur d’indemnité',
    description: 'Partager le montant d’une indemnité VIE ou VIA pas encore publié au Journal officiel, pour la rendre publique sans aucune donnée personnelle.',
    frequence: 'monthly', priorite: 0.4, indexer: false },
  { vue: 'methodo', chemin: '/methodologie', titre: 'Méthodologie et sources',
    description: 'Calcul de l’indemnité VIE / VIA (part fixe, part géographique) et origine des données : Journal officiel, Légifrance, BCE, Statistique Canada.',
    frequence: 'monthly', priorite: 0.6 },
  { vue: 'indices', chemin: '/villes-cout-de-la-vie', titre: 'Villes utilisées pour le coût de la vie',
    description: 'Ville retenue pour l’indice des prix de chaque zone d’indemnité suivie, et sa source officielle.',
    frequence: 'monthly', priorite: 0.3, indexer: false },
  { vue: 'roadmap', chemin: '/nouveautes', titre: 'Nouveautés et feuille de route',
    description: 'Dernières nouveautés du site et prochaines fonctionnalités prévues pour les volontaires internationaux.',
    frequence: 'weekly', priorite: 0.3, indexer: false },
  { vue: 'dons', chemin: '/dons', titre: 'Dons pour l’hébergement',
    description: 'Un site bénévole et gratuit : coûts réels d’hébergement et possibilité de faire un don, entièrement facultatif.',
    frequence: 'monthly', priorite: 0.2, indexer: false },
  { vue: 'legal', chemin: '/mentions-legales', titre: 'Mentions légales et contact',
    description: 'Éditeur, hébergeur, sources et licences, formulaire de contact.', frequence: 'monthly', priorite: 0.2, indexer: false },
  { vue: 'confidentialite', chemin: '/confidentialite', titre: 'Confidentialité',
    description: 'Données recueillies (très peu), leur durée de conservation et vos choix, dont le refus de la mesure d’audience.',
    frequence: 'monthly', priorite: 0.2, indexer: false },
];

/** Pages proposées aux moteurs de recherche (plan du site) */
export const PAGES_INDEXEES = PAGES.filter(p => p.indexer !== false);

export const pageParChemin = (chemin: string) => PAGES.find(p => p.chemin === chemin);
export const ROUTES: Record<string, string> = Object.fromEntries(PAGES.map(p => [p.vue, p.chemin]));
