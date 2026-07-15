ALTER TABLE "tests"
ADD COLUMN IF NOT EXISTS "auto_complete_on_leave" boolean DEFAULT true NOT NULL;
