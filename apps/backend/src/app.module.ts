import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import { CoursesModule } from './courses/courses.module';
import { CourseModulesModule } from './course-modules/course-modules.module';
import { LessonsModule } from './lessons/lessons.module';
import { TestsModule } from './tests/tests.module';
import { QuestionsModule } from './questions/questions.module';
import { DeliveryModule } from './delivery/delivery.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UploadModule } from './upload/upload.module';
import { TelegramModule } from './telegram/telegram.module';
import { LiveModule } from './live/live.module';
import 'dotenv/config';

@Module({
  imports: [
    AuthModule,
    AdminsModule,
    FoldersModule,
    CoursesModule,
    CourseModulesModule,
    LessonsModule,
    TestsModule,
    QuestionsModule,
    DeliveryModule,
    SubmissionsModule,
    UploadModule,
    TelegramModule,
    LiveModule,
  ],
})
export class AppModule {}
