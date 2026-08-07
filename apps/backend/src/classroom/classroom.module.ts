import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClassroomService } from './classroom.service';
import { ClassroomGateway } from './classroom.gateway';
import { ClassroomController } from './classroom.controller';
import { ClassroomRecordingService } from './classroom-recording.service';
import { ClassroomRecordingController } from './classroom-recording.controller';
import { BoardsController } from './boards.controller';
import { StorageModule } from '../storage/storage.module';
import { UploadModule } from '../upload/upload.module';
import 'dotenv/config';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET! }), StorageModule, UploadModule],
  controllers: [ClassroomController, ClassroomRecordingController, BoardsController],
  providers: [ClassroomService, ClassroomGateway, ClassroomRecordingService],
})
export class ClassroomModule {}

