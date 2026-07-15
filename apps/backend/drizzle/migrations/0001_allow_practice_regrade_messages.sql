DROP INDEX IF EXISTS "practice_chat_messages_image_submission_type_key";--> statement-breakpoint
CREATE UNIQUE INDEX "practice_chat_messages_image_submission_message_key" ON "practice_chat_messages" USING btree ("image_submission_id") WHERE "practice_chat_messages"."image_submission_id" IS NOT NULL AND "practice_chat_messages"."type" = 'practice_image';
