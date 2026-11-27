CREATE TABLE "propositions" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"zone" text NOT NULL,
	"eff" text NOT NULL,
	"saisie" text NOT NULL,
	"valeur" numeric NOT NULL,
	"pct" numeric NOT NULL,
	"ref" text NOT NULL,
	"ref_valeur" numeric NOT NULL,
	"source" text,
	"statut" text DEFAULT 'attente' NOT NULL,
	"auto" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"proposition_id" integer NOT NULL,
	"votant" text NOT NULL,
	"reseau" text NOT NULL,
	"sens" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "propositions_groupe" ON "propositions" USING btree ("type","zone","eff");--> statement-breakpoint
CREATE INDEX "votes_proposition" ON "votes" USING btree ("proposition_id");--> statement-breakpoint
CREATE INDEX "votes_votant" ON "votes" USING btree ("votant");--> statement-breakpoint
CREATE INDEX "votes_reseau" ON "votes" USING btree ("reseau");