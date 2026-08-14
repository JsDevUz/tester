import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClassroomService } from './classroom.service';
import { ClassroomGateway } from './classroom.gateway';
import { ClassroomController } from './classroom.controller';
import { ClassroomRecordingService } from './classroom-recording.service';
import { ClassroomRecordingController } from './classroom-recording.controller';
import { BoardsController } from './boards.controller';
import { StorageModule } from '../storage/storage.module';
import { UploadModule } from '../upload/upload.module';
import { PracticeMessengerModule } from '../practice-messenger/practice-messenger.module';

import { BoardsService } from './boards.service';
import { ClassroomVoiceService } from './classroom-voice.service';
import { ClassroomAttendanceService } from './classroom-attendance.service';
import { ClassroomReplayService } from './classroom-replay.service';
import { ClassroomSnapshotService } from './classroom-snapshot.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    StorageModule,
    UploadModule,
    // "Jonli dars boshlandi" bildirishnomasini foydalanuvchining
    // user:<userId> xonasiga yuborish uchun (PracticeMessengerGateway'ning
    // umumiy notifyUsers metodi).
    PracticeMessengerModule,
  ],
  controllers: [ClassroomController, ClassroomRecordingController, BoardsController],
  providers: [
    ClassroomService,
    ClassroomGateway,
    ClassroomRecordingService,
    BoardsService,
    ClassroomVoiceService,
    ClassroomAttendanceService,
    ClassroomReplayService,
    ClassroomSnapshotService,
  ],
  exports: [
    ClassroomService,
    BoardsService,
    ClassroomVoiceService,
    ClassroomAttendanceService,
    ClassroomReplayService,
    ClassroomSnapshotService,
  ],
})
export class ClassroomModule {}

