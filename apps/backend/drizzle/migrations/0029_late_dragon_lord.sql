CREATE TABLE "challenge_word_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_participant_id" uuid NOT NULL,
	"challenge_word_id" uuid NOT NULL,
	"known" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challenge_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"word" text NOT NULL,
	"translation" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "challenge_word_progress" ADD CONSTRAINT "challenge_word_progress_challenge_participant_id_challenge_participants_id_fk" FOREIGN KEY ("challenge_participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_word_progress" ADD CONSTRAINT "challenge_word_progress_challenge_word_id_challenge_words_id_fk" FOREIGN KEY ("challenge_word_id") REFERENCES "public"."challenge_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_words" ADD CONSTRAINT "challenge_words_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_word_progress_participant_id_word_id_key" ON "challenge_word_progress" USING btree ("challenge_participant_id","challenge_word_id");