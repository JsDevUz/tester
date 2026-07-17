import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClassroomService } from './classroom.service';
import { ClassroomGateway } from './classroom.gateway';
import { ClassroomController } from './classroom.controller';
import { StorageModule } from '../storage/storage.module';
import 'dotenv/config';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET! }), StorageModule],
  controllers: [ClassroomController],
  providers: [ClassroomService, ClassroomGateway],
})
export class ClassroomModule {}
