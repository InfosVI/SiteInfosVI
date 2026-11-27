CREATE TABLE "arretes" (
	"cid" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"publie_le" date NOT NULL,
	"signe_le" date,
	"effet" date,
	"titre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocages" (
	"id" serial PRIMARY KEY NOT NULL,
	"cle" text NOT NULL,
	"jusqua" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cours_quotidiens" (
	"date" date NOT NULL,
	"devise" text NOT NULL,
	"taux" numeric(18, 6) NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "cours_quotidiens_date_devise_pk" PRIMARY KEY("date","devise")
);
--> statement-breakpoint
CREATE TABLE "cout_vie" (
	"zone" text NOT NULL,
	"mois" text NOT NULL,
	"indice" numeric(8, 1) NOT NULL,
	"serie" text NOT NULL,
	"vecteur" text,
	"source" text NOT NULL,
	"publie_le" date,
	CONSTRAINT "cout_vie_zone_mois_pk" PRIMARY KEY("zone","mois")
);
--> statement-breakpoint
CREATE TABLE "historique" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"auteur" text NOT NULL,
	"origine" text NOT NULL,
	"donnee" text NOT NULL,
	"cle" text NOT NULL,
	"periode" text NOT NULL,
	"avant" numeric(18, 6),
	"apres" numeric(18, 6),
	"brut" text,
	"controles" jsonb NOT NULL,
	"enregistree" integer NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "journal" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"donnee" text NOT NULL,
	"source" text NOT NULL,
	"titre" text NOT NULL,
	"concerne" text,
	"url" text NOT NULL,
	"methode" text NOT NULL,
	"http" integer,
	"ms" integer,
	"taille" integer,
	"statut" text NOT NULL,
	"valeurs" jsonb NOT NULL,
	"etapes" jsonb NOT NULL,
	"cause" text,
	"que_faire" text
);
--> statement-breakpoint
CREATE TABLE "part_fixe" (
	"date_effet" date PRIMARY KEY NOT NULL,
	"indice_majore" integer NOT NULL,
	"traitement_annuel" numeric(10, 2) NOT NULL,
	"montant" numeric(10, 2) NOT NULL,
	"source_indices" text NOT NULL,
	"source_traitement" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_geo" (
	"zone" text NOT NULL,
	"trimestre" date NOT NULL,
	"mode" text NOT NULL,
	"montant" numeric(10, 2),
	"statut" text NOT NULL,
	"source" text,
	CONSTRAINT "part_geo_zone_trimestre_mode_pk" PRIMARY KEY("zone","trimestre","mode")
);
--> statement-breakpoint
CREATE TABLE "taux_change" (
	"mois" text NOT NULL,
	"devise" text NOT NULL,
	"taux" numeric(18, 6) NOT NULL,
	"source" text NOT NULL,
	"nb_jours" integer,
	CONSTRAINT "taux_change_mois_devise_pk" PRIMARY KEY("mois","devise")
);
--> statement-breakpoint
CREATE TABLE "tentatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"cookie_id" text,
	"ip_hash" text,
	"sig_hash" text
);
--> statement-breakpoint
CREATE TABLE "valeurs_admin" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"donnee" text NOT NULL,
	"cle" text NOT NULL,
	"periode" text NOT NULL,
	"valeur" numeric(10, 2),
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"zone" text PRIMARY KEY NOT NULL,
	"pays" text NOT NULL,
	"devise" text
);
--> statement-breakpoint
ALTER TABLE "part_geo" ADD CONSTRAINT "part_geo_zone_zones_zone_fk" FOREIGN KEY ("zone") REFERENCES "public"."zones"("zone") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocages_cle" ON "blocages" USING btree ("cle");--> statement-breakpoint
CREATE INDEX "historique_at" ON "historique" USING btree ("at");--> statement-breakpoint
CREATE INDEX "journal_at" ON "journal" USING btree ("at");--> statement-breakpoint
CREATE INDEX "tentatives_at" ON "tentatives" USING btree ("at");