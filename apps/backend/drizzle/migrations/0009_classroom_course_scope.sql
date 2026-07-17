-- class_sessions endi group emas, course darajasida ochiladi: bitta darsni
-- kursning barcha guruhlariga birdan o'tish mumkin bo'lishi kerak edi.
-- Jadval hali production ma'lumot saqlamagan, shuning uchun xavfsiz almashtiramiz.
ALTER TABLE "class_sessions" DROP CONSTRAINT "class_sessions_group_id_groups_id_fk";
--> statement-breakpoint
DROP INDEX "class_sessions_group_id_idx";
--> statement-breakpoint
ALTER TABLE "class_sessions" RENAME COLUMN "group_id" TO "course_id";
--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "class_sessions_course_id_idx" ON "class_sessions" USING btree ("course_id");
