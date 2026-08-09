CREATE TABLE "challenge_book_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_participant_id" uuid NOT NULL,
	"challenge_book_id" uuid NOT NULL,
	"last_page_read" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_book_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_book_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"trigger_page" integer,
	"force_now" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "challenge_book_tests_challenge_book_id_unique" UNIQUE("challenge_book_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"title" text NOT NULL,
	"total_pages" integer NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challenge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_participant_id" uuid NOT NULL,
	"challenge_book_id" uuid NOT NULL,
	"start_page" integer NOT NULL,
	"end_page" integer NOT NULL,
	"new_words_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"type" text DEFAULT 'kitobxonlik' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "challenge_book_progress" ADD CONSTRAINT "challenge_book_progress_challenge_participant_id_challenge_participants_id_fk" FOREIGN KEY ("challenge_participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_book_progress" ADD CONSTRAINT "challenge_book_progress_challenge_book_id_challenge_books_id_fk" FOREIGN KEY ("challenge_book_id") REFERENCES "public"."challenge_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_book_tests" ADD CONSTRAINT "challenge_book_tests_challenge_book_id_challenge_books_id_fk" FOREIGN KEY ("challenge_book_id") REFERENCES "public"."challenge_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_book_tests" ADD CONSTRAINT "challenge_book_tests_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_books" ADD CONSTRAINT "challenge_books_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_events" ADD CONSTRAINT "challenge_events_challenge_participant_id_challenge_participants_id_fk" FOREIGN KEY ("challenge_participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_events" ADD CONSTRAINT "challenge_events_challenge_book_id_challenge_books_id_fk" FOREIGN KEY ("challenge_book_id") REFERENCES "public"."challenge_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_book_progress_participant_id_book_id_key" ON "challenge_book_progress" USING btree ("challenge_participant_id","challenge_book_id");--> statement-breakpoint
CREATE INDEX "challenge_events_participant_id_idx" ON "challenge_events" USING btree ("challenge_participant_id");--> statement-breakpoint
CREATE INDEX "challenge_events_book_id_idx" ON "challenge_events" USING btree ("challenge_book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_participants_challenge_id_student_id_key" ON "challenge_participants" USING btree ("challenge_id","student_id");