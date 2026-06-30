import { pgTable, text, uuid, timestamp, integer, boolean, varchar } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  icon: text('icon').notNull().default('folder'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const tests = pgTable('tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  adminId: uuid('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  timeLimit: integer('time_limit'),
  showResults: text('show_results').notNull().default('immediately'),
  shuffleQuestions: boolean('shuffle_questions').notNull().default(false),
  shuffleOptions: boolean('shuffle_options').notNull().default(false),
  oneByOne: boolean('one_by_one').notNull().default(false),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  studentName: text('student_name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  score: integer('score'),
  total: integer('total'),
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

export const questionsRelations = relations(questions, ({ one, many }) => ({
  test: one(tests, { fields: [questions.testId], references: [tests.id] }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, { fields: [options.questionId], references: [questions.id] }),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  test: one(tests, { fields: [submissions.testId], references: [tests.id] }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  submission: one(submissions, { fields: [answers.submissionId], references: [submissions.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
}));
