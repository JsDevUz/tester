ALTER TABLE "class_sessions" ADD COLUMN "history_events" jsonb;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN "recording_url" text;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN "recording_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN "egress_id" text;