CREATE UNIQUE INDEX IF NOT EXISTS "answers_submission_id_question_id_key" ON "answers" USING btree ("submission_id","question_id");
