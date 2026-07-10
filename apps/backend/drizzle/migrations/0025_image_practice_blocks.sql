ALTER TABLE "practice_blocks" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'test';
UPDATE "practice_blocks" SET "type" = 'test' WHERE "test_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "image_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "practice_block_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "image_url" text NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now(),
  "score" integer,
  "graded_at" timestamp with time zone,
  "graded_by_admin_id" uuid
);

ALTER TABLE "image_submissions"
  ADD CONSTRAINT "image_submissions_practice_block_id_fkey"
  FOREIGN KEY ("practice_block_id") REFERENCES "practice_blocks"("id") ON DELETE CASCADE;

ALTER TABLE "image_submissions"
  ADD CONSTRAINT "image_submissions_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "image_submissions"
  ADD CONSTRAINT "image_submissions_graded_by_admin_id_fkey"
  FOREIGN KEY ("graded_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "image_submissions_practice_block_id_student_id_idx"
  ON "image_submissions" ("practice_block_id", "student_id");
