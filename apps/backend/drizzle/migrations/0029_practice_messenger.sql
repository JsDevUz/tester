CREATE TABLE IF NOT EXISTS "practice_chats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "curator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "practice_chats_group_student_key"
  ON "practice_chats" ("group_id", "student_id");

CREATE TABLE IF NOT EXISTS "practice_chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" uuid NOT NULL REFERENCES "practice_chats"("id") ON DELETE CASCADE,
  "sender_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL DEFAULT 'text',
  "content" text NOT NULL DEFAULT '',
  "practice_block_id" uuid REFERENCES "practice_blocks"("id") ON DELETE SET NULL,
  "test_submission_id" uuid REFERENCES "submissions"("id") ON DELETE SET NULL,
  "image_submission_id" uuid REFERENCES "image_submissions"("id") ON DELETE SET NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "practice_chat_messages_chat_created_at_idx"
  ON "practice_chat_messages" ("chat_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "practice_chat_messages_test_submission_key"
  ON "practice_chat_messages" ("test_submission_id") WHERE "test_submission_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "practice_chat_messages_image_submission_key"
  ON "practice_chat_messages" ("image_submission_id") WHERE "image_submission_id" IS NOT NULL;
