import { pgTable, text, uuid, timestamp, integer, boolean, varchar, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  username: text('username').unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('student'),
  phone: text('phone').unique(),
  telegramChatId: text('telegram_chat_id'),
  telegramUserId: text('telegram_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const authCodes = pgTable('auth_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull(),
  email: text('email'),
  name: text('name'),
  telegramChatId: text('telegram_chat_id'),
  purpose: text('purpose').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const userTelegramLinks = pgTable('user_telegram_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').unique().notNull(),
  telegramChatId: text('telegram_chat_id').notNull(),
  telegramUserId: text('telegram_user_id'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  icon: text('icon').notNull().default('folder'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const coursesRelations = relations(courses, ({ one, many }) => ({
  owner: one(users, { fields: [courses.adminId], references: [users.id] }),
  modules: many(modules),
  groups: many(groups),
  launches: many(launches),
}));

export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  status: text('status').notNull().default('draft'),
  passThresholdEnabled: boolean('pass_threshold_enabled').notNull().default(false),
  passThresholdPercent: integer('pass_threshold_percent'),
  completionScore: integer('completion_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const modulesRelations = relations(modules, ({ one, many }) => ({
  course: one(courses, { fields: [modules.courseId], references: [courses.id] }),
  lessons: many(lessons),
}));

export const contentBlocks = pgTable('content_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('editor'),
  orderIndex: integer('order_index').notNull().default(0),
  html: text('html'),
  fileName: text('file_name'),
  previewUrl: text('preview_url'),
  embedUrl: text('embed_url'),
  label: text('label'),
  processingStatus: text('processing_status').notNull().default('ready'),
  sourceKey: text('source_key'),
  hlsMasterKey: text('hls_master_key'),
  hlsBaseKey: text('hls_base_key'),
  aesKeyRef: text('aes_key_ref'),
  durationSec: integer('duration_sec'),
  errorMessage: text('error_message'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const contentBlocksRelations = relations(contentBlocks, ({ one }) => ({
  lesson: one(lessons, { fields: [contentBlocks.lessonId], references: [lessons.id] }),
}));

export const videoWatchSegments = pgTable('video_watch_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentBlockId: uuid('content_block_id').notNull().references(() => contentBlocks.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startSec: integer('start_sec').notNull(),
  endSec: integer('end_sec').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const videoWatchSegmentsRelations = relations(videoWatchSegments, ({ one }) => ({
  contentBlock: one(contentBlocks, { fields: [videoWatchSegments.contentBlockId], references: [contentBlocks.id] }),
}));

export const practiceBlocks = pgTable('practice_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('test'),
  testId: uuid('test_id').references(() => tests.id, { onDelete: 'set null' }),
  orderIndex: integer('order_index').notNull().default(0),
  description: text('description').notNull().default(''),
  maxScore: integer('max_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const practiceBlocksRelations = relations(practiceBlocks, ({ one }) => ({
  lesson: one(lessons, { fields: [practiceBlocks.lessonId], references: [lessons.id] }),
  test: one(tests, { fields: [practiceBlocks.testId], references: [tests.id] }),
}));

export const imageSubmissions = pgTable('image_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  practiceBlockId: uuid('practice_block_id').notNull().references(() => practiceBlocks.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  imageUrl: text('image_url').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),
  score: integer('score'),
  gradedAt: timestamp('graded_at', { withTimezone: true }),
  gradedByAdminId: uuid('graded_by_admin_id').references(() => admins.id, { onDelete: 'set null' }),
});

export const imageSubmissionsRelations = relations(imageSubmissions, ({ one }) => ({
  practiceBlock: one(practiceBlocks, { fields: [imageSubmissions.practiceBlockId], references: [practiceBlocks.id] }),
  student: one(users, { fields: [imageSubmissions.studentId], references: [users.id] }),
}));

export const lessonCompletions = pgTable('lesson_completions', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueLessonStudent: uniqueIndex('lesson_completions_lesson_id_student_id_key').on(table.lessonId, table.studentId),
}));

export const lessonCompletionsRelations = relations(lessonCompletions, ({ one }) => ({
  lesson: one(lessons, { fields: [lessonCompletions.lessonId], references: [lessons.id] }),
  student: one(users, { fields: [lessonCompletions.studentId], references: [users.id] }),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  module: one(modules, { fields: [lessons.moduleId], references: [modules.id] }),
  blocks: many(contentBlocks),
}));

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  groupChatEnabled: boolean('group_chat_enabled').notNull().default(false),
  groupChannelEnabled: boolean('group_channel_enabled').notNull().default(false),
  inviteToken: text('invite_token').notNull().unique(),
  paymentDay: integer('payment_day').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const launches = pgTable('launches', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const pricingPlans = pgTable('pricing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  launchId: uuid('launch_id').notNull().references(() => launches.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(),
  originalPrice: integer('original_price'),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const monthlyPayments = pgTable('monthly_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').notNull().references(() => groupEnrollments.id, { onDelete: 'cascade' }),
  periodMonth: timestamp('period_month', { withTimezone: true }).notNull(),
  expectedAmount: integer('expected_amount').notNull(),
  discountAmount: integer('discount_amount').notNull().default(0),
  paidAmount: integer('paid_amount').notNull().default(0),
  status: text('status').notNull().default('pending'),
  paymentMethod: text('payment_method'),
  note: text('note'),
  receiptUrl: text('receipt_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueMemberPeriod: uniqueIndex('monthly_payments_enrollment_id_period_month_key').on(table.enrollmentId, table.periodMonth),
}));

export const paymentCancellations = pgTable('payment_cancellations', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull().references(() => monthlyPayments.id, { onDelete: 'cascade' }),
  cancelledByAdminId: uuid('cancelled_by_admin_id').references(() => admins.id, { onDelete: 'set null' }),
  cancelledPaidAmount: integer('cancelled_paid_amount').notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }).defaultNow(),
});

export const paymentCancellationsRelations = relations(paymentCancellations, ({ one }) => ({
  payment: one(monthlyPayments, { fields: [paymentCancellations.paymentId], references: [monthlyPayments.id] }),
  cancelledByAdmin: one(admins, { fields: [paymentCancellations.cancelledByAdminId], references: [admins.id] }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  course: one(courses, { fields: [groups.courseId], references: [courses.id] }),
  enrollments: many(groupEnrollments),
  plans: many(pricingPlans),
}));

export const launchesRelations = relations(launches, ({ one, many }) => ({
  course: one(courses, { fields: [launches.courseId], references: [courses.id] }),
  plans: many(pricingPlans),
}));

export const pricingPlansRelations = relations(pricingPlans, ({ one }) => ({
  launch: one(launches, { fields: [pricingPlans.launchId], references: [launches.id] }),
  group: one(groups, { fields: [pricingPlans.groupId], references: [groups.id] }),
}));

export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().unique().references(() => admins.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Mening maktabim'),
  description: text('description').notNull().default(''),
  inviteToken: text('invite_token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const schoolMembers = pgTable('school_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('student'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSchoolStudent: uniqueIndex('school_members_school_id_student_id_key').on(table.schoolId, table.studentId),
}));

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  admin: one(admins, { fields: [schools.adminId], references: [admins.id] }),
  members: many(schoolMembers),
}));

export const schoolMembersRelations = relations(schoolMembers, ({ one, many }) => ({
  school: one(schools, { fields: [schoolMembers.schoolId], references: [schools.id] }),
  student: one(users, { fields: [schoolMembers.studentId], references: [users.id] }),
  enrollments: many(groupEnrollments),
}));

export const groupEnrollments = pgTable('group_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolMemberId: uuid('school_member_id').notNull().references(() => schoolMembers.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  selectedPlanId: uuid('selected_plan_id').references(() => pricingPlans.id, { onDelete: 'set null' }),
  forcedClosed: boolean('forced_closed').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
});

export const groupEnrollmentsRelations = relations(groupEnrollments, ({ one, many }) => ({
  group: one(groups, { fields: [groupEnrollments.groupId], references: [groups.id] }),
  schoolMember: one(schoolMembers, { fields: [groupEnrollments.schoolMemberId], references: [schoolMembers.id] }),
  selectedPlan: one(pricingPlans, { fields: [groupEnrollments.selectedPlanId], references: [pricingPlans.id] }),
  payments: many(monthlyPayments),
}));

export const monthlyPaymentsRelations = relations(monthlyPayments, ({ one }) => ({
  enrollment: one(groupEnrollments, { fields: [monthlyPayments.enrollmentId], references: [groupEnrollments.id] }),
}));

export const tests = pgTable('tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  adminId: uuid('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  timeLimit: integer('time_limit'),
  showResults: text('show_results').notNull().default('immediately'),
  shuffleQuestions: boolean('shuffle_questions').notNull().default(false),
  shuffleOptions: boolean('shuffle_options').notNull().default(false),
  oneByOne: boolean('one_by_one').notNull().default(false),
  requireAuth: boolean('require_auth').notNull().default(false),
  deadline: timestamp('deadline', { withTimezone: true }),
  slug: varchar('slug', { length: 8 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  type: text('type').notNull().default('single'),
  orderIndex: integer('order_index').notNull().default(0),
  imageUrl: text('image_url'),
  audioUrl: text('audio_url'),
  correctAnswer: text('correct_answer'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const liveSessions = pgTable('live_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
  adminId: uuid('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pin: varchar('pin', { length: 6 }).notNull(),
  mode: text('mode').notNull(),
  questionTimeSec: integer('question_time_sec').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const options = pgTable('options', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  isCorrect: boolean('is_correct').notNull().default(false),
  orderIndex: integer('order_index').notNull().default(0),
});

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  studentName: text('student_name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  score: integer('score'),
  total: integer('total'),
  mode: text('submission_mode').notNull().default('normal'),
  violationReason: text('violation_reason'),
});

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  selectedOptionIds: uuid('selected_option_ids').array().notNull().default(sql`'{}'::uuid[]`),
  textAnswer: text('text_answer'),
  isCorrect: boolean('is_correct'),
});

export const testsRelations = relations(tests, ({ many }) => ({
  questions: many(questions),
  submissions: many(submissions),
}));

export const usersRelations = relations(users, ({ many }) => ({
  folders: many(folders),
  tests: many(tests),
  submissions: many(submissions),
  courses: many(courses),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  owner: one(users, { fields: [folders.adminId], references: [users.id] }),
  tests: many(tests),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  test: one(tests, { fields: [questions.testId], references: [tests.id] }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, { fields: [options.questionId], references: [questions.id] }),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  test: one(tests, { fields: [submissions.testId], references: [tests.id] }),
  user: one(users, { fields: [submissions.userId], references: [users.id] }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  submission: one(submissions, { fields: [answers.submissionId], references: [submissions.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
}));

export const liveSessionsRelations = relations(liveSessions, ({ one }) => ({
  test: one(tests, { fields: [liveSessions.testId], references: [tests.id] }),
}));
