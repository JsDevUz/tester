import { pgTable, text, uuid, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

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
