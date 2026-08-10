CREATE TABLE "deck_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"word" text NOT NULL,
	"translation" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "word_decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "word_decks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "deck_words" ADD CONSTRAINT "deck_words_deck_id_word_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."word_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_decks" ADD CONSTRAINT "word_decks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_words_deck_id_idx" ON "deck_words" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "word_decks_owner_id_idx" ON "word_decks" USING btree ("owner_id");