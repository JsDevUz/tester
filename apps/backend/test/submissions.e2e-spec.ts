import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders, tests, questions, options, submissions, answers } from '../src/db/schema';

describe('Submissions (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let adminId: string;
  let testId: string;
  let submissionId: string;
  let questionId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['public/(.*)'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    token = loginRes.body.access_token;
    adminId = loginRes.body.admin.id;

    const [folder] = await db.insert(folders).values({ adminId, name: 'Sub Test Folder' }).returning();
    const [test] = await db.insert(tests).values({
      adminId, folderId: folder.id, name: 'Sub Test', showResults: 'immediately',
    }).returning();
    testId = test.id;

    const [q] = await db.insert(questions).values({ testId, text: 'Q1', type: 'single', orderIndex: 0 }).returning();
    questionId = q.id;
    const [opt] = await db.insert(options).values({ questionId, text: 'A', isCorrect: true, orderIndex: 0 }).returning();

    const [sub] = await db.insert(submissions).values({
      testId, studentName: 'Test Student', submittedAt: new Date(), score: 1, total: 1,
    }).returning();
    submissionId = sub.id;
    await db.insert(answers).values({
      submissionId, questionId, selectedOptionIds: [opt.id], isCorrect: true,
    });
  });

  afterAll(() => app.close());

  it('GET /api/v1/tests/:testId/submissions - requires auth', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/tests/${testId}/submissions`);
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/tests/:testId/submissions - returns list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tests/${testId}/submissions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].studentName).toBe('Test Student');
    expect(res.body[0].score).toBe(1);
  });

  it('GET /api/v1/submissions/:id - returns detail with answers', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.studentName).toBe('Test Student');
    expect(Array.isArray(res.body.answers)).toBe(true);
    expect(res.body.answers[0].questionId).toBe(questionId);
    expect(res.body.answers[0].isCorrect).toBe(true);
  });
});
