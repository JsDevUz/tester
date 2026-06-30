import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import { TestsModule } from './tests/tests.module';
import { QuestionsModule } from './questions/questions.module';
import { DeliveryModule } from './delivery/delivery.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UploadModule } from './upload/upload.module';
import 'dotenv/config';

@Module({
  imports: [
    AuthModule,
    AdminsModule,
    FoldersModule,
    TestsModule,
    QuestionsModule,
    DeliveryModule,
    SubmissionsModule,
    UploadModule,
  ],
})
export class AppModule {}
