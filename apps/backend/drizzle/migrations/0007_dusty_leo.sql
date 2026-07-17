ALTER TABLE "users" ADD COLUMN "custom_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text GENERATED ALWAYS AS (coalesce("users"."custom_name", "users"."name")) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_avatar_url" text GENERATED ALWAYS AS (coalesce("users"."custom_avatar_url", "users"."avatar_url")) STORED;