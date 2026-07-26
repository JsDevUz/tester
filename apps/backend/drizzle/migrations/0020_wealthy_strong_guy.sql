CREATE TABLE "test_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "test_pins_test_id_unique" UNIQUE("test_id")
);
--> statement-breakpoint
ALTER TABLE "test_pins" ADD CONSTRAINT "test_pins_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_pins" ADD CONSTRAINT "test_pins_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;