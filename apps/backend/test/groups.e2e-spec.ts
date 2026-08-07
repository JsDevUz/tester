import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Groups / My Schools (e2e)', () => {
  let app: INestApplication;
  let teacherToken: string;
  let studentToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const teacherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    teacherToken = teacherRes.body.access_token;

    const phone = `+998${Math.floor(900000000 + Math.random() * 99999999)}`;
    await request(app.getHttpServer())
      .post('/api/v1/school/students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'My Schools Test Student', phone, password: 'testpass123' });

    const studentLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: 'testpass123' });
    studentToken = studentLoginRes.body.access_token;
  });

  afterAll(() => app.close());

  it('GET /api/v1/my/schools returns the school the student was enrolled into, with counts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/my/schools')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      studentCount: expect.any(Number),
      courseCount: expect.any(Number),
    });
    expect(res.body[0].studentCount).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/my/schools - no token returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/my/schools');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/my/courses?schoolId filters to that school, empty for an unknown schoolId', async () => {
    const schoolsRes = await request(app.getHttpServer())
      .get('/api/v1/my/schools')
      .set('Authorization', `Bearer ${studentToken}`);
    const ownSchoolId = schoolsRes.body[0].id;

    const unfiltered = await request(app.getHttpServer())
      .get('/api/v1/my/courses')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(unfiltered.status).toBe(200);

    const filteredToOwnSchool = await request(app.getHttpServer())
      .get('/api/v1/my/courses')
      .query({ schoolId: ownSchoolId })
      .set('Authorization', `Bearer ${studentToken}`);
    expect(filteredToOwnSchool.status).toBe(200);
    expect(filteredToOwnSchool.body).toEqual(unfiltered.body);

    const filteredToUnknownSchool = await request(app.getHttpServer())
      .get('/api/v1/my/courses')
      .query({ schoolId: '00000000-0000-0000-0000-000000000000' })
      .set('Authorization', `Bearer ${studentToken}`);
    expect(filteredToUnknownSchool.status).toBe(200);
    expect(filteredToUnknownSchool.body).toEqual([]);
  });
});
