import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { questions, options, tests } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class StudentQuestionsService {
  private async verifyTestOwnership(testId: string, studentId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, studentId)),
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  private async verifyQuestionOwnership(questionId: string, studentId: string) {
    const question = await db.query.questions.findFirst({
      where: eq(questions.id, questionId),
      with: { test: true },
    });
    if (!question || question.test.adminId !== studentId) throw new NotFoundException('Question not found');
    return question;
  }

  async addQuestion(testId: string, studentId: string, data: {
    text: string;
    type: string;
    options: Array<{ text: string; isCorrect: boolean; orderIndex?: number }>;
    imageUrl?: string;
    audioUrl?: string;
    correctAnswer?: string | null;
  }) {
    await this.verifyTestOwnership(testId, studentId);
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

    if (data.options.length > 0) {
      await db.insert(options).values(
        data.options.map((o, index) => ({
          questionId: question.id,
          text: o.text,
          isCorrect: o.isCorrect,
          orderIndex: o.orderIndex ?? index,
        })),
      );
    }
    return question;
  }

  async updateQuestion(id: string, studentId: string, data: {
    text?: string; type?: string; orderIndex?: number;
    imageUrl?: string; audioUrl?: string; correctAnswer?: string;
  }) {
    await this.verifyQuestionOwnership(id, studentId);
    const [question] = await db.update(questions).set(data).where(eq(questions.id, id)).returning();
    return question;
  }

  async removeQuestion(id: string, studentId: string) {
    await this.verifyQuestionOwnership(id, studentId);
    await db.delete(questions).where(eq(questions.id, id));
  }
}
