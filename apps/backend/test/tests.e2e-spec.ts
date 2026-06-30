import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders } from '../src/db/schema';

describe('Tests (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let folderId: string;
  let testId: string;

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

    const folderRes = await db.insert(folders).values({
      adminId: loginRes.body.admin.id,
      name: 'Test Folder for Tests',
    }).returning();
    folderId = folderRes[0].id;
  });

  afterAll(() => app.close());

  it('POST /api/v1/tests - create test', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tests')
      .set('Authorization', `Bearer ${token}`)
      .send({ folderId, name: 'Math Quiz', showResults: 'immediately' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Math Quiz');
    expect(res.body.folderId).toBe(folderId);
    testId = res.body.id;
  });

  it('GET /api/v1/tests?folder_id= - list tests', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tests?folder_id=${folderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((t: any) => t.id === testId)).toBe(true);
  });

  it('GET /api/v1/tests/:id - get test detail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tests/${testId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testId);
    expect(Array.isArray(res.body.questions)).toBe(true);
  });

  it('PATCH /api/v1/tests/:id - update test', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/tests/${testId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Quiz', timeLimit: 30 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Quiz');
    expect(res.body.timeLimit).toBe(30);
  });

  it('DELETE /api/v1/tests/:id', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/tests/${testId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('GET /api/v1/tests - 401 without token', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/tests?folder_id=${folderId}`);
    expect(res.status).toBe(401);
  });
});
