import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { questions, options, tests } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { parseBulk } from './bulk-parser';

@Injectable()
export class QuestionsService {
  private async verifyTestOwnership(testId: string, adminId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, adminId)),
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  private async verifyQuestionOwnership(questionId: string, adminId: string) {
    const question = await db.query.questions.findFirst({
      where: eq(questions.id, questionId),
      with: { test: true },
    });
    if (!question || question.test.adminId !== adminId) throw new NotFoundException('Question not found');
    return question;
  }

  private async verifyOptionOwnership(optionId: string, adminId: string) {
    const option = await db.query.options.findFirst({
      where: eq(options.id, optionId),
      with: { question: { with: { test: true } } },
    });
    if (!option || option.question.test.adminId !== adminId) throw new NotFoundException('Option not found');
    return option;
  }

  async addQuestion(testId: string, adminId: string, data: {
    text: string;
    type: string;
    options: Array<{ text: string; isCorrect: boolean; orderIndex?: number }>;
    imageUrl?: string;
    audioUrl?: string;
    correctAnswer?: string | null;
  }) {
    await this.verifyTestOwnership(testId, adminId);
    if ((data.type === 'single' || data.type === 'multi') && data.options.length > 0) {
      const hasCorrect = data.options.some((o) => o.isCorrect);
      if (!hasCorrect) throw new BadRequestException('Kamida bitta to\'g\'ri javob belgilanishi shart');
    }
    const existing = await db.query.questions.findMany({ where: eq(questions.testId, testId) });
    const [question] = await db.insert(questions).values({
      testId,
      text: data.text,
      type: data.type,
      orderIndex: existing.length,
      imageUrl: data.imageUrl ?? null,
      audioUrl: data.audioUrl ?? null,
      correctAnswer: data.correctAnswer ?? null,
    }).returning();

    const insertedOptions = data.options.length > 0
      ? await db.insert(options).values(
          data.options.map((o, i) => ({
            questionId: question.id,
            text: o.text,
            isCorrect: o.isCorrect,
            orderIndex: o.orderIndex ?? i,
          }))
        ).returning()
      : [];

    return { ...question, options: insertedOptions };
  }

  async bulkImport(testId: string, adminId: string, text: string) {
    await this.verifyTestOwnership(testId, adminId);
    const parsed = parseBulk(text);
    const existing = await db.query.questions.findMany({ where: eq(questions.testId, testId) });
    let orderOffset = existing.length;

    for (const q of parsed) {
      const [question] = await db.insert(questions).values({
        testId,
        text: q.text,
        type: q.type,
        orderIndex: orderOffset++,
        correctAnswer: q.correctAnswer ?? null,
      }).returning();

      if (q.options.length > 0) {
        await db.insert(options).values(
          q.options.map((o, i) => ({
            questionId: question.id,
            text: o.text,
            isCorrect: o.isCorrect,
            orderIndex: i,
          }))
        );
      }
    }

    return { imported: parsed.length };
  }

  async updateQuestion(id: string, adminId: string, data: { text?: string; type?: string; orderIndex?: number; imageUrl?: string; audioUrl?: string; correctAnswer?: string | null }) {
    await this.verifyQuestionOwnership(id, adminId);
    const [question] = await db.update(questions).set(data).where(eq(questions.id, id)).returning();
    return question;
  }

  async removeQuestion(id: string, adminId: string) {
    await this.verifyQuestionOwnership(id, adminId);
    await db.delete(questions).where(eq(questions.id, id));
  }

  async updateOption(id: string, adminId: string, data: { text?: string; isCorrect?: boolean; orderIndex?: number }) {
    await this.verifyOptionOwnership(id, adminId);
    const [option] = await db.update(options).set(data).where(eq(options.id, id)).returning();
    return option;
  }

  async removeOption(id: string, adminId: string) {
    await this.verifyOptionOwnership(id, adminId);
    await db.delete(options).where(eq(options.id, id));
  }
}
