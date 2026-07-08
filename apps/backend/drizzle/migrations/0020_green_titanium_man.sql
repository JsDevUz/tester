DROP INDEX "group_members_group_id_student_id_key";--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "removed_at" timestamp with time zone;