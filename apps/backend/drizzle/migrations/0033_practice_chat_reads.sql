CREATE TABLE IF NOT EXISTS "practice_chat_reads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" uuid NOT NULL REFERENCES "practice_chats"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_read_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "practice_chat_reads_chat_user_key"
  ON "practice_chat_reads" ("chat_id", "user_id");
