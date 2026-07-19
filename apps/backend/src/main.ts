import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as express from 'express';
import 'dotenv/config';
import { validateEnv } from './validate-env';

validateEnv();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });
  // LiveKit webhook imzosini tekshirish uchun RAW (parse qilinmagan) body
  // kerak — global JSON parserdan oldin shu bitta yo'l uchun alohida
  // ulanadi.
  app.use('/api/v1/webhooks/livekit', express.raw({ type: '*/*' }));
  app.setGlobalPrefix('api/v1', { exclude: ['public/(.*)', 'uploads/(.*)'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.FRONTEND_URL });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
