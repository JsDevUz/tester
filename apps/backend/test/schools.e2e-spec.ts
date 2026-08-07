import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Schools (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let originalImageUrl: string | null;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    if (res.status !== 200) {
      throw new Error(`Login failed with status ${res.status}: ${JSON.stringify(res.body)}`);
    }
    token = res.body.access_token;

    const currentRes = await request(app.getHttpServer())
      .get('/api/v1/school')
      .set('Authorization', `Bearer ${token}`);
    originalImageUrl = currentRes.body.imageUrl ?? null;
  });

  afterAll(async () => {
    // This test's PATCH overwrites the real super admin school's imageUrl -
    // restore it so the shared dev DB isn't left permanently mutated.
    await request(app.getHttpServer())
      .patch('/api/v1/school')
      .set('Authorization', `Bearer ${token}`)
      .send({ imageUrl: originalImageUrl ?? '' });
    await app.close();
  });

  it('PATCH /api/v1/school updates imageUrl and GET /api/v1/school returns it', async () => {
    const patchRes = await request(app.getHttpServer())
      .patch('/api/v1/school')
      .set('Authorization', `Bearer ${token}`)
      .send({ imageUrl: 'https://cdn.example.com/school-logo.png' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.imageUrl).toBe('https://cdn.example.com/school-logo.png');

    const getRes = await request(app.getHttpServer())
      .get('/api/v1/school')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.imageUrl).toBe('https://cdn.example.com/school-logo.png');
  });

  it('GET /api/v1/school - no token returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/school');
    expect(res.status).toBe(401);
  });
});
