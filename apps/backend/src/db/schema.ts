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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const contentBlocksRelations = relations(contentBlocks, ({ one }) => ({
  lesson: one(lessons, { fields: [contentBlocks.lessonId], references: [lessons.id] }),
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

export const groupMembers = pgTable('group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('student'),
  selectedPlanId: uuid('selected_plan_id').references(() => pricingPlans.id, { onDelete: 'set null' }),
  forcedClosed: boolean('forced_closed').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueGroupStudent: uniqueIndex('group_members_group_id_student_id_key').on(table.groupId, table.studentId),
}));

export const monthlyPayments = pgTable('monthly_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupMemberId: uuid('group_member_id').notNull().references(() => groupMembers.id, { onDelete: 'cascade' }),
  periodMonth: timestamp('period_month', { withTimezone: true }).notNull(),
  expectedAmount: integer('expected_amount').notNull(),
  discountAmount: integer('discount_amount').notNull().default(0),
  paidAmount: integer('paid_amount').notNull().default(0),
  status: text('status').notNull().default('pending'),
  paymentMethod: text('payment_method'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueMemberPeriod: uniqueIndex('monthly_payments_group_member_id_period_month_key').on(table.groupMemberId, table.periodMonth),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  course: one(courses, { fields: [groups.courseId], references: [courses.id] }),
  members: many(groupMembers),
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

export const groupMembersRelations = relations(groupMembers, ({ one, many }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  student: one(users, { fields: [groupMembers.studentId], references: [users.id] }),
  selectedPlan: one(pricingPlans, { fields: [groupMembers.selectedPlanId], references: [pricingPlans.id] }),
  payments: many(monthlyPayments),
}));

export const monthlyPaymentsRelations = relations(monthlyPayments, ({ one }) => ({
  groupMember: one(groupMembers, { fields: [monthlyPayments.groupMemberId], references: [groupMembers.id] }),
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
