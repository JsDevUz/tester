CREATE TABLE IF NOT EXISTS "video_watch_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "content_block_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "start_sec" integer NOT NULL,
  "end_sec" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "video_watch_segments"
  ADD CONSTRAINT "video_watch_segments_content_block_id_fkey"
  FOREIGN KEY ("content_block_id") REFERENCES "content_blocks"("id") ON DELETE CASCADE;

ALTER TABLE "video_watch_segments"
  ADD CONSTRAINT "video_watch_segments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "video_watch_segments_content_block_id_student_id_idx"
  ON "video_watch_segments" ("content_block_id", "student_id");
