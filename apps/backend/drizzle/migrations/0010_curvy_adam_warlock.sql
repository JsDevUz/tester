ALTER TABLE "media_assets" ADD COLUMN "size_bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "pdf_pages" jsonb;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "pdf_processing_status" text;