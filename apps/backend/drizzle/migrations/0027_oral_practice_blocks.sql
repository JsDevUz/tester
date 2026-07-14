CREATE TABLE IF NOT EXISTS "oral_practice_grades" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "practice_block_id" uuid NOT NULL REFERENCES "practice_blocks"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "score" integer NOT NULL,
  "graded_at" timestamp with time zone DEFAULT now(),
  "graded_by_admin_id" uuid REFERENCES "admins"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "oral_practice_grades_block_student_key"
  ON "oral_practice_grades" ("practice_block_id", "student_id");
