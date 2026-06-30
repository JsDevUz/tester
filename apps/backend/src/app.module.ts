import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule, AdminsModule, FoldersModule],
})
export class AppModule {}
