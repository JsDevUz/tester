CREATE TABLE "content_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"type" text DEFAULT 'editor' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"html" text,
	"file_name" text,
	"preview_url" text,
	"embed_url" text,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;