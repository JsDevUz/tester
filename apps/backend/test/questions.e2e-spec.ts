import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders, tests } from '../src/db/schema';

describe('Questions (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let adminId: string;
  let testId: string;
  let questionId: string;
  let optionId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    token = loginRes.body.access_token;
    adminId = loginRes.body.admin.id;

    const [folder] = await db.insert(folders).values({ adminId, name: 'Q Test Folder' }).returning();
    const [test] = await db.insert(tests).values({ adminId, folderId: folder.id, name: 'Q Test' }).returning();
    testId = test.id;
  });

  afterAll(() => app.close());

  it('POST /api/v1/tests/:id/questions - add single-choice question', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tests/${testId}/questions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'What is 2+2?',
        type: 'single',
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.text).toBe('What is 2+2?');
    expect(res.body.options).toHaveLength(3);
    questionId = res.body.id;
    optionId = res.body.options[0].id;
  });

  it('PATCH /api/v1/questions/:id - update question', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/questions/${questionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'What is 3+3?' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('What is 3+3?');
  });

  it('PATCH /api/v1/options/:id - update option', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/options/${optionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Updated option', isCorrect: false });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Updated option');
  });

  it('POST /api/v1/tests/:id/questions/bulk - bulk import', async () => {
    const bulkText = `# Capital of France?
+ Paris
- London
- Berlin

# Open question here

# Multi correct
+ First correct
+ Second correct
- Wrong one`;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tests/${testId}/questions/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: bulkText });
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(3);
  });

  it('DELETE /api/v1/questions/:id', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/questions/${questionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('DELETE /api/v1/options/:id - 404 after question deleted', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/options/${optionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
