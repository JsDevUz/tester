-- 1. Create group_enrollments table
CREATE TABLE IF NOT EXISTS "group_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_member_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "selected_plan_id" uuid,
  "forced_closed" boolean NOT NULL DEFAULT false,
  "joined_at" timestamp with time zone DEFAULT now(),
  "removed_at" timestamp with time zone
);

ALTER TABLE "group_enrollments"
  ADD CONSTRAINT "group_enrollments_school_member_id_fkey"
  FOREIGN KEY ("school_member_id") REFERENCES "school_members"("id") ON DELETE CASCADE;

ALTER TABLE "group_enrollments"
  ADD CONSTRAINT "group_enrollments_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;

ALTER TABLE "group_enrollments"
  ADD CONSTRAINT "group_enrollments_selected_plan_id_fkey"
  FOREIGN KEY ("selected_plan_id") REFERENCES "pricing_plans"("id") ON DELETE SET NULL;

-- 2. Backfill: for every group_members row whose student has no school_members row
--    in the school that owns that group's course, create one (role='student').
INSERT INTO "school_members" ("id", "school_id", "student_id", "role", "joined_at")
SELECT gen_random_uuid(), s.id, gm.student_id, 'student', gm.joined_at
FROM "group_members" gm
JOIN "groups" g ON g.id = gm.group_id
JOIN "courses" c ON c.id = g.course_id
JOIN "schools" s ON s.admin_id = c.admin_id
WHERE NOT EXISTS (
  SELECT 1 FROM "school_members" sm
  WHERE sm.school_id = s.id AND sm.student_id = gm.student_id
);

-- 3. Copy group_members rows into group_enrollments, resolving school_member_id
--    via the (school, student) pair established/confirmed in step 2.
INSERT INTO "group_enrollments" ("id", "school_member_id", "group_id", "selected_plan_id", "forced_closed", "joined_at", "removed_at")
SELECT gm.id, sm.id, gm.group_id, gm.selected_plan_id, gm.forced_closed, gm.joined_at, gm.removed_at
FROM "group_members" gm
JOIN "groups" g ON g.id = gm.group_id
JOIN "courses" c ON c.id = g.course_id
JOIN "schools" s ON s.admin_id = c.admin_id
JOIN "school_members" sm ON sm.school_id = s.id AND sm.student_id = gm.student_id;

-- 4. Repoint monthly_payments: add enrollment_id, backfill from group_member_id
--    (group_enrollments.id was seeded identical to group_members.id in step 3,
--    so the FK value itself does not change, only the column name/target).
ALTER TABLE "monthly_payments" ADD COLUMN IF NOT EXISTS "enrollment_id" uuid;
UPDATE "monthly_payments" SET "enrollment_id" = "group_member_id";
ALTER TABLE "monthly_payments" ALTER COLUMN "enrollment_id" SET NOT NULL;

ALTER TABLE "monthly_payments"
  ADD CONSTRAINT "monthly_payments_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "group_enrollments"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "monthly_payments_group_member_id_period_month_key";
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_payments_enrollment_id_period_month_key"
  ON "monthly_payments" ("enrollment_id", "period_month");

ALTER TABLE "monthly_payments" DROP CONSTRAINT IF EXISTS "monthly_payments_group_member_id_group_members_id_fk";
ALTER TABLE "monthly_payments" DROP COLUMN IF EXISTS "group_member_id";

-- 5. Drop the old group_members table now that all data has been migrated.
DROP TABLE IF EXISTS "group_members";
