import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import { CoursesModule } from './courses/courses.module';
import { CourseModulesModule } from './course-modules/course-modules.module';
import { LessonsModule } from './lessons/lessons.module';
import { ContentBlocksModule } from './content-blocks/content-blocks.module';
import { PracticeBlocksModule } from './practice-blocks/practice-blocks.module';
import { GroupsModule } from './groups/groups.module';
import { LaunchesModule } from './launches/launches.module';
import { PaymentsModule } from './payments/payments.module';
import { TestsModule } from './tests/tests.module';
import { QuestionsModule } from './questions/questions.module';
import { DeliveryModule } from './delivery/delivery.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UploadModule } from './upload/upload.module';
import { TelegramModule } from './telegram/telegram.module';
import { LiveModule } from './live/live.module';
import { SchoolsModule } from './schools/schools.module';
import { VideosModule } from './videos/videos.module';
import { PracticeMessengerModule } from './practice-messenger/practice-messenger.module';
import { ClassroomModule } from './classroom/classroom.module';
import { ChallengesModule } from './challenges/challenges.module';
import { StudentTestsModule } from './student-tests/student-tests.module';
import { WordDecksModule } from './word-decks/word-decks.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import 'dotenv/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RedisModule,
    HealthModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    AuthModule,
    AdminsModule,
    FoldersModule,
    CoursesModule,
    CourseModulesModule,
    LessonsModule,
    ContentBlocksModule,
    PracticeBlocksModule,
    GroupsModule,
    LaunchesModule,
    PaymentsModule,
    TestsModule,
    QuestionsModule,
    DeliveryModule,
    SubmissionsModule,
    UploadModule,
    TelegramModule,
    LiveModule,
    SchoolsModule,
    VideosModule,
    PracticeMessengerModule,
    ClassroomModule,
    ChallengesModule,
    StudentTestsModule,
    WordDecksModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
