ALTER TABLE "practice_chat_messages"
  ADD COLUMN IF NOT EXISTS "reply_to_message_id" uuid REFERENCES "practice_chat_messages"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "practice_chat_messages_reply_to_message_idx"
  ON "practice_chat_messages" ("reply_to_message_id");
