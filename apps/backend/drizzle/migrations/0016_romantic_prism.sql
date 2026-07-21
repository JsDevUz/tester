CREATE TABLE "message_block_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_block_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "content_blocks" ADD COLUMN "button_url" text;--> statement-breakpoint
ALTER TABLE "content_blocks" ADD COLUMN "button_color" text;--> statement-breakpoint
ALTER TABLE "content_blocks" ADD COLUMN "button_text_color" text;--> statement-breakpoint
ALTER TABLE "content_blocks" ADD COLUMN "open_in_new_tab" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "message_block_lines" ADD CONSTRAINT "message_block_lines_content_block_id_content_blocks_id_fk" FOREIGN KEY ("content_block_id") REFERENCES "public"."content_blocks"("id") ON DELETE cascade ON UPDATE no action;