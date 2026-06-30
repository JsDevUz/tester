import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders, questions, options } from '../src/db/schema';

describe('Delivery (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let adminId: string;
  let slug: string;
  let testId: string;
  let questionId: string;
  let correctOptionId: string;
  let wrongOptionId: string;

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

    const [folder] = await db.insert(folders).values({ adminId, name: 'Delivery Test Folder' }).returning();
    const testRes = await request(app.getHttpServer())
      .post('/api/v1/tests')
      .set('Authorization', `Bearer ${token}`)
      .send({ folderId: folder.id, name: 'Delivery Test', showResults: 'immediately' });
    testId = testRes.body.id;
    slug = testRes.body.slug;

    const [q] = await db.insert(questions).values({ testId, text: 'What is 2+2?', type: 'single', orderIndex: 0 }).returning();
    questionId = q.id;
    const opts = await db.insert(options).values([
      { questionId: q.id, text: '4', isCorrect: true, orderIndex: 0 },
      { questionId: q.id, text: '5', isCorrect: false, orderIndex: 1 },
    ]).returning();
    correctOptionId = opts[0].id;
    wrongOptionId = opts[1].id;
  });

  afterAll(() => app.close());

  it('GET /public/tests/:slug - returns test without isCorrect', async () => {
    const res = await request(app.getHttpServer()).get(`/public/tests/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Delivery Test');
    expect(res.body.questions[0].options[0].isCorrect).toBeUndefined();
    expect(res.body.questions[0].id).toBe(questionId);
  });

  it('GET /public/tests/NOTEXIST - returns 404', async () => {
    const res = await request(app.getHttpServer()).get('/public/tests/NOTEXIST');
    expect(res.status).toBe(404);
  });

  it('POST /public/submissions - start submission', async () => {
    const res = await request(app.getHttpServer())
      .post('/public/submissions')
      .send({ slug, studentName: 'Ali' });
    expect(res.status).toBe(201);
    expect(res.body.submissionId).toBeDefined();
  });

  it('POST /public/submissions/:id/submit - correct answer scores 1/1', async () => {
    const startRes = await request(app.getHttpServer())
      .post('/public/submissions')
      .send({ slug, studentName: 'Vali' });
    const submissionId = startRes.body.submissionId;

    const res = await request(app.getHttpServer())
      .post(`/public/submissions/${submissionId}/submit`)
      .send({ answers: [{ questionId, selectedOptionIds: [correctOptionId], textAnswer: null }] });
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(1);
    expect(res.body.total).toBe(1);
    expect(res.body.showResults).toBe('immediately');
    expect(res.body.answers[0].isCorrect).toBe(true);
  });

  it('POST /public/submissions/:id/submit - wrong answer scores 0/1', async () => {
    const startRes = await request(app.getHttpServer())
      .post('/public/submissions')
      .send({ slug, studentName: 'Jasur' });
    const submissionId = startRes.body.submissionId;

    const res = await request(app.getHttpServer())
      .post(`/public/submissions/${submissionId}/submit`)
      .send({ answers: [{ questionId, selectedOptionIds: [wrongOptionId], textAnswer: null }] });
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(0);
    expect(res.body.answers[0].isCorrect).toBe(false);
  });
});
