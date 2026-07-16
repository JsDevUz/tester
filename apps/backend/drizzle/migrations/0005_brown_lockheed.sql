CREATE INDEX "group_enrollments_school_member_id_idx" ON "group_enrollments" USING btree ("school_member_id");--> statement-breakpoint
CREATE INDEX "group_enrollments_group_id_idx" ON "group_enrollments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "live_sessions_test_id_idx" ON "live_sessions" USING btree ("test_id");--> statement-breakpoint
CREATE INDEX "options_question_id_idx" ON "options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "practice_chat_messages_chat_id_idx" ON "practice_chat_messages" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "questions_test_id_idx" ON "questions" USING btree ("test_id");--> statement-breakpoint
CREATE INDEX "submissions_test_id_idx" ON "submissions" USING btree ("test_id");--> statement-breakpoint
CREATE INDEX "submissions_user_id_idx" ON "submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tests_folder_id_idx" ON "tests" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "tests_admin_id_idx" ON "tests" USING btree ("admin_id");