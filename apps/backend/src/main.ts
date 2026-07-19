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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // LiveKit webhook so'rovlari Content-Type: application/webhook+json bilan
  // keladi — bu standart 'application/json' parser mos keladigan turlar
  // ro'yxatiga kirmaydi, shuning uchun req.rawBody hech qachon
  // to'ldirilmasdi (ClassroomRecordingController jimgina erta qaytib
  // ketardi, log ham qoldirmasdan). express.json({ verify }) NestJS'ning
  // o'z rawBody mexanizmi qoldiradigan hook'ni qo'lda bajaradi.
  app.use(
    express.json({
      type: 'application/webhook+json',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });
  app.setGlobalPrefix('api/v1', { exclude: ['public/(.*)', 'uploads/(.*)'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.FRONTEND_URL });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
