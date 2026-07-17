ALTER TABLE "users" DROP CONSTRAINT "users_phone_unique";--> statement-breakpoint
ALTER TABLE "user_telegram_links" DROP CONSTRAINT "user_telegram_links_phone_unique";--> statement-breakpoint
UPDATE "users" SET "phone" = regexp_replace("phone", '[^0-9]', '', 'g') WHERE "phone" IS NOT NULL;--> statement-breakpoint
UPDATE "user_telegram_links" SET "phone" = regexp_replace("phone", '[^0-9]', '', 'g');--> statement-breakpoint
UPDATE "auth_codes" SET "phone" = regexp_replace("phone", '[^0-9]', '', 'g');--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "phone" IS NULL OR "phone" = '') THEN
    RAISE EXCEPTION 'Email removal requires every user to have a phone number';
  END IF;
  IF EXISTS (SELECT 1 FROM "users" GROUP BY "phone" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Email removal found duplicate user phone numbers';
  END IF;
  IF EXISTS (SELECT 1 FROM "user_telegram_links" GROUP BY "phone" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Email removal found duplicate Telegram phone numbers';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_unique" UNIQUE("phone");--> statement-breakpoint
ALTER TABLE "user_telegram_links" ADD CONSTRAINT "user_telegram_links_phone_unique" UNIQUE("phone");--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_codes" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email";
