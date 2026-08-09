import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { TelegramModule } from '../telegram/telegram.module';
import { StorageModule } from '../storage/storage.module';
import 'dotenv/config';

@Module({
  imports: [
    PassportModule,
    TelegramModule,
    StorageModule,
    JwtModule.register({ secret: process.env.JWT_SECRET!, signOptions: { expiresIn: '365d' } }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
