-- 1. Add score/pass-threshold columns to lessons
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "pass_threshold_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "pass_threshold_percent" integer;
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "completion_score" integer;

-- 2. Create practice_blocks table
CREATE TABLE IF NOT EXISTS "practice_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lesson_id" uuid NOT NULL,
  "test_id" uuid,
  "order_index" integer NOT NULL DEFAULT 0,
  "description" text NOT NULL DEFAULT '',
  "max_score" integer,
  "created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "practice_blocks"
  ADD CONSTRAINT "practice_blocks_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE;

ALTER TABLE "practice_blocks"
  ADD CONSTRAINT "practice_blocks_test_id_fkey"
  FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE SET NULL;

-- 3. Create lesson_completions table
CREATE TABLE IF NOT EXISTS "lesson_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lesson_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "lesson_completions"
  ADD CONSTRAINT "lesson_completions_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE;

ALTER TABLE "lesson_completions"
  ADD CONSTRAINT "lesson_completions_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_completions_lesson_id_student_id_key"
  ON "lesson_completions" ("lesson_id", "student_id");
