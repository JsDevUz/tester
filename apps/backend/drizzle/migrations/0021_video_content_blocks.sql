ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "processing_status" text NOT NULL DEFAULT 'ready';
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "source_key" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "hls_master_key" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "hls_base_key" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "aes_key_ref" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "duration_sec" integer;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "error_message" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "processed_at" timestamp with time zone;
