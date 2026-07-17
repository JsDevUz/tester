CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"first_joined_at" timestamp with time zone,
	"last_left_at" timestamp with time zone,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'absent' NOT NULL,
	"overridden_by_admin_id" uuid
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"teacher_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"pdf_name" text,
	"pdf_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollment_id_group_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."group_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_overridden_by_admin_id_users_id_fk" FOREIGN KEY ("overridden_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_id_enrollment_id_key" ON "attendance_records" USING btree ("session_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "class_sessions_group_id_idx" ON "class_sessions" USING btree ("group_id");