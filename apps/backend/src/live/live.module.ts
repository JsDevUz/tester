import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LiveService } from './live.service';
import { LiveGateway } from './live.gateway';
import { LiveController } from './live.controller';
import 'dotenv/config';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET! })],
  controllers: [LiveController],
  providers: [LiveService, LiveGateway],
})
export class LiveModule {}
