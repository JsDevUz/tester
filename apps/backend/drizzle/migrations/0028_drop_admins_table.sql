-- Custom SQL migration file, put your code below! --

-- Repoint FKs from admins(id) to users(id), then drop the now-unused admins table.

-- image_submissions.graded_by_admin_id
ALTER TABLE "image_submissions"
  DROP CONSTRAINT IF EXISTS "image_submissions_graded_by_admin_id_fkey";
ALTER TABLE "image_submissions"
  ADD CONSTRAINT "image_submissions_graded_by_admin_id_fkey"
  FOREIGN KEY ("graded_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- oral_practice_grades.graded_by_admin_id
ALTER TABLE "oral_practice_grades"
  DROP CONSTRAINT IF EXISTS "oral_practice_grades_graded_by_admin_id_fkey";
ALTER TABLE "oral_practice_grades"
  ADD CONSTRAINT "oral_practice_grades_graded_by_admin_id_fkey"
  FOREIGN KEY ("graded_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- payment_cancellations.cancelled_by_admin_id
ALTER TABLE "payment_cancellations"
  DROP CONSTRAINT IF EXISTS "payment_cancellations_cancelled_by_admin_id_fkey";
ALTER TABLE "payment_cancellations"
  ADD CONSTRAINT "payment_cancellations_cancelled_by_admin_id_fkey"
  FOREIGN KEY ("cancelled_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- schools.admin_id
ALTER TABLE "schools"
  DROP CONSTRAINT IF EXISTS "schools_admin_id_admins_id_fk";
ALTER TABLE "schools"
  ADD CONSTRAINT "schools_admin_id_users_id_fk"
  FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- Drop the now-unused admins table.
DROP TABLE IF EXISTS "admins";
