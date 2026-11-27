CREATE TABLE "contact_limites" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"cle" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text,
	"texte" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contact_limites_cle" ON "contact_limites" USING btree ("cle");--> statement-breakpoint
CREATE INDEX "messages_at" ON "messages" USING btree ("at");