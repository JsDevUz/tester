import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import { TestsModule } from './tests/tests.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule, AdminsModule, FoldersModule, TestsModule],
})
export class AppModule {}
