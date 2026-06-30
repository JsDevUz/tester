import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule, AdminsModule],
})
export class AppModule {}
