CREATE TABLE IF NOT EXISTS "payment_cancellations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id" uuid NOT NULL,
  "cancelled_by_admin_id" uuid,
  "cancelled_paid_amount" integer NOT NULL,
  "cancelled_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "payment_cancellations"
  ADD CONSTRAINT "payment_cancellations_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "monthly_payments"("id") ON DELETE CASCADE;

ALTER TABLE "payment_cancellations"
  ADD CONSTRAINT "payment_cancellations_cancelled_by_admin_id_fkey"
  FOREIGN KEY ("cancelled_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "payment_cancellations_payment_id_idx"
  ON "payment_cancellations" ("payment_id");
