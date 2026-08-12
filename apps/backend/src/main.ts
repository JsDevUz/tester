import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import 'dotenv/config';
import { validateEnv } from './validate-env';
import { getAllowedOrigins } from './cors';
import { RedisIoAdapter } from './redis/redis-io.adapter';

validateEnv();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const redisAdapter = new RedisIoAdapter(app, process.env.REDIS_URL);
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });
  app.setGlobalPrefix('api/v1', { exclude: ['public/(.*)', 'uploads/(.*)'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: getAllowedOrigins() });
  // 3001 — lokal ishlab chiqish porti (frontend .env va src'dagi
  // fallback'lar shu portni kutadi). Deploy'da PORT=3000 beriladi
  // (docker-compose), shuning uchun bu qiymat faqat lokalda ishlaydi.
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
