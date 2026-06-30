import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Folders (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let folderId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    token = res.body.access_token;
  });

  afterAll(() => app.close());

  it('POST /api/v1/folders - create folder', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Math Tests', color: '#ef4444' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Math Tests');
    expect(res.body.color).toBe('#ef4444');
    folderId = res.body.id;
  });

  it('GET /api/v1/folders - list only own folders', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/folders')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((f: any) => f.name !== undefined)).toBe(true);
  });

  it('PATCH /api/v1/folders/:id - rename folder', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/folders/${folderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Science Tests' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Science Tests');
  });

  it('DELETE /api/v1/folders/:id', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/folders/${folderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('GET /api/v1/folders - no token returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/folders');
    expect(res.status).toBe(401);
  });
});
