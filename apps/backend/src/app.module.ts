import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule],
})
export class AppModule {}
