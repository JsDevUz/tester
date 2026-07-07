CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "submissions" RENAME COLUMN "mode" TO "submission_mode";--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "violation_reason" text;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;