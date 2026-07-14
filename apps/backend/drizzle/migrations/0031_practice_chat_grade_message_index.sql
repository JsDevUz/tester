-- The unique index on image_submission_id collided between the "student
-- submitted an image" auto-message and the "curator graded it" auto-message,
-- since both reference the same image_submission_id. Replace it with a
-- composite (image_submission_id, type) index so each message type gets its
-- own idempotency guarantee instead of colliding with the other type.
DROP INDEX IF EXISTS "practice_chat_messages_image_submission_key";

CREATE UNIQUE INDEX IF NOT EXISTS "practice_chat_messages_image_submission_type_key"
  ON "practice_chat_messages" ("image_submission_id", "type")
  WHERE "image_submission_id" IS NOT NULL;
