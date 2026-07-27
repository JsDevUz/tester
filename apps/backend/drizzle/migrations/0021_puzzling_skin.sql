CREATE TABLE "free_session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "class_sessions" ALTER COLUMN "course_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "free_session_participants" ADD CONSTRAINT "free_session_participants_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_session_participants" ADD CONSTRAINT "free_session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "free_session_participants_session_id_idx" ON "free_session_participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "free_session_participants_user_id_idx" ON "free_session_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "free_session_participants_session_user_uniq" ON "free_session_participants" USING btree ("session_id","user_id");