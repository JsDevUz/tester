CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_admin_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "uploader_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "key" text NOT NULL,
  "type" text NOT NULL,
  "original_name" text NOT NULL,
  "folder" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "media_assets_school_admin_type_idx"
  ON "media_assets" ("school_admin_id", "type", "created_at");
