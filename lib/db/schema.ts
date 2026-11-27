import { pgTable, text, integer, numeric, date, timestamp, serial, jsonb, primaryKey, index } from 'drizzle-orm/pg-core';

/** Zones d'indemnité (ville ou pays), avec leur pays et leur devise */
export const zones = pgTable('zones', {
  zone: text('zone').primaryKey(),
  pays: text('pays').notNull(),
  devise: text('devise'),
});

/** Part géographique en vigueur le 1er jour de chaque trimestre, par mode (VIE / VIA) */
export const partGeo = pgTable('part_geo', {
  zone: text('zone').notNull().references(() => zones.zone),
  trimestre: date('trimestre').notNull(),
  mode: text('mode', { enum: ['vie', 'via'] }).notNull(),
  montant: numeric('montant', { precision: 10, scale: 2 }),   // vide si aucune source
  statut: text('statut').notNull(),
  source: text('source'),                                      // JORFTEXT…
}, (t) => [primaryKey({ columns: [t.zone, t.trimestre, t.mode] })]);

/** Part fixe, commune à toutes les zones */
export const partFixe = pgTable('part_fixe', {
  dateEffet: date('date_effet').primaryKey(),
  indiceMajore: integer('indice_majore').notNull(),
  traitementAnnuel: numeric('traitement_annuel', { precision: 10, scale: 2 }).notNull(),
  montant: numeric('montant', { precision: 10, scale: 2 }).notNull(),
  sourceIndices: text('source_indices').notNull(),
  sourceTraitement: text('source_traitement').notNull(),
});

/** Taux € → devise, moyenne mensuelle */
export const tauxChange = pgTable('taux_change', {
  mois: text('mois').notNull(),            // AAAA-MM
  devise: text('devise').notNull(),
  taux: numeric('taux', { precision: 18, scale: 6 }).notNull(),
  source: text('source').notNull(),
  nbJours: integer('nb_jours'),
}, (t) => [primaryKey({ columns: [t.mois, t.devise] })]);

/** Cours quotidiens € → devise (BCE) : la moyenne provisoire du mois en cours se calcule à partir d'eux */
export const coursQuotidiens = pgTable('cours_quotidiens', {
  date: date('date').notNull(),
  devise: text('devise').notNull(),
  taux: numeric('taux', { precision: 18, scale: 6 }).notNull(),
  source: text('source').notNull(),
}, (t) => [primaryKey({ columns: [t.date, t.devise] })]);

/** Textes du Journal officiel utilisés (arrêtés), avec leurs dates */
export const arretes = pgTable('arretes', {
  cid: text('cid').primaryKey(),
  type: text('type').notNull(),            // trim_pct, via_base, vie_annuel, vie_derog
  publieLe: date('publie_le').notNull(),
  signeLe: date('signe_le'),
  effet: date('effet'),
  titre: text('titre').notNull(),
});

/** Indice des prix à la consommation par zone (2002 = 100) */
export const coutVie = pgTable('cout_vie', {
  zone: text('zone').notNull(),
  mois: text('mois').notNull(),
  indice: numeric('indice', { precision: 8, scale: 1 }).notNull(),
  serie: text('serie').notNull(),
  vecteur: text('vecteur'),
  source: text('source').notNull(),
  publieLe: date('publie_le'),
}, (t) => [primaryKey({ columns: [t.zone, t.mois] })]);

/** Historique des modifications : ajout seul, jamais modifié ni supprimé */
export const historique = pgTable('historique', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  auteur: text('auteur').notNull(),
  origine: text('origine').notNull(),      // jo, bce, statcan, legifrance, man, rest, val, unval
  donnee: text('donnee').notNull(),        // geo, fixe, fx, cpi
  cle: text('cle').notNull(),              // zone ou devise
  periode: text('periode').notNull(),
  avant: numeric('avant', { precision: 18, scale: 6 }),
  apres: numeric('apres', { precision: 18, scale: 6 }),
  brut: text('brut'),                      // valeur telle que reçue
  controles: jsonb('controles').notNull(), // [{c, exp, got, ok}]
  enregistree: integer('enregistree').notNull(), // 1 = enregistrée, 0 = refusée
  source: text('source'),
}, (t) => [index('historique_at').on(t.at)]);

/** Valeurs saisies par l'admin : elles remplacent la valeur publiée pour la période donnée */
export const valeursAdmin = pgTable('valeurs_admin', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  donnee: text('donnee').notNull(),        // geo, fixe
  cle: text('cle').notNull(),              // zone (ou TOUTES pour la part fixe)
  periode: text('periode').notNull(),      // AAAA-MM (début de trimestre pour la part géo)
  valeur: numeric('valeur', { precision: 10, scale: 2 }),   // vide = valeur saisie retirée
  source: text('source').notNull(),
});

/** Tentatives de connexion admin échouées (identifiants anonymisés) */
export const tentatives = pgTable('tentatives', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  cookieId: text('cookie_id'),
  ipHash: text('ip_hash'),
  sigHash: text('sig_hash'),
}, (t) => [index('tentatives_at').on(t.at)]);

/** Blocages de 48 h (par cookie, ou par empreinte réseau + appareil ; jamais par l'adresse IP seule) */
export const blocages = pgTable('blocages', {
  id: serial('id').primaryKey(),
  cle: text('cle').notNull(),              // c:<cookie> ou n:<ip_hash>|<sig_hash>
  jusqua: timestamp('jusqua', { withTimezone: true }).notNull(),
}, (t) => [index('blocages_cle').on(t.cle)]);

/** Journal des requêtes vers les sources */
export const journal = pgTable('journal', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  donnee: text('donnee').notNull(),
  source: text('source').notNull(),
  titre: text('titre').notNull(),
  concerne: text('concerne'),
  url: text('url').notNull(),
  methode: text('methode').notNull(),
  http: integer('http'),
  ms: integer('ms'),
  taille: integer('taille'),
  statut: text('statut').notNull(),        // ok, none, retry, check, fail
  valeurs: jsonb('valeurs').notNull(),
  etapes: jsonb('etapes').notNull(),       // [[horodatage, niveau, message]]
  cause: text('cause'),
  queFaire: text('que_faire'),
}, (t) => [index('journal_at').on(t.at)]);

/** Messages du formulaire de contact (effacés après 60 jours). Aucun identifiant du visiteur n'y est stocké. */
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  email: text('email'),                    // facultatif, seulement pour répondre
  texte: text('texte').notNull(),
}, (t) => [index('messages_at').on(t.at)]);

/** Limite d'envoi du formulaire de contact (1 message / 12 h) : empreintes anonymisées, effacées après 12 h */
export const contactLimites = pgTable('contact_limites', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  cle: text('cle').notNull(),              // c:<cookie haché> ou n:<adresse IP hachée>
}, (t) => [index('contact_limites_cle').on(t.cle)]);
