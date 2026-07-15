ALTER TABLE "submissions" ADD COLUMN "practice_score_override" integer;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "practice_score_overridden_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "practice_score_overridden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_practice_score_overridden_by_admin_id_users_id_fk" FOREIGN KEY ("practice_score_overridden_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "practice_chat_messages_test_submission_key";--> statement-breakpoint
CREATE UNIQUE INDEX "practice_chat_messages_test_submission_message_key" ON "practice_chat_messages" USING btree ("test_submission_id") WHERE "practice_chat_messages"."test_submission_id" IS NOT NULL AND "practice_chat_messages"."type" = 'practice_test';
