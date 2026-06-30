import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Admins (e2e)', () => {
  let app: INestApplication;
  let superToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    superToken = res.body.access_token;
  });

  afterAll(() => app.close());

  it('GET /api/v1/admins - super admin sees list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admins')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/v1/admins - create admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admins')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email: 'newadmin@test.com', password: 'pass1234', name: 'Test Admin' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('newadmin@test.com');
    expect(res.body.role).toBe('admin');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('DELETE /api/v1/admins/:id - delete admin', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admins')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email: 'todelete@test.com', password: 'pass1234', name: 'To Delete' });
    const id = createRes.body.id;

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/admins/${id}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(204);
  });

  it('GET /api/v1/admins - no token returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admins');
    expect(res.status).toBe(401);
  });
});
