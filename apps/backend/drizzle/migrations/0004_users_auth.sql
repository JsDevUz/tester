CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"phone" text,
	"telegram_chat_id" text,
	"telegram_user_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
INSERT INTO "users" ("id", "email", "password_hash", "name", "role", "created_at")
SELECT "id", "email", "password_hash", "name",
	CASE WHEN "role" = 'super' THEN 'super' ELSE 'teacher' END,
	"created_at"
FROM "admins"
ON CONFLICT ("email") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"telegram_chat_id" text,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_telegram_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"telegram_user_id" text,
	"first_name" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_telegram_links_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "folders" DROP CONSTRAINT IF EXISTS "folders_admin_id_admins_id_fk";
--> statement-breakpoint
ALTER TABLE "tests" DROP CONSTRAINT IF EXISTS "tests_admin_id_admins_id_fk";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "folders" ADD CONSTRAINT "folders_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tests" ADD CONSTRAINT "tests_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
