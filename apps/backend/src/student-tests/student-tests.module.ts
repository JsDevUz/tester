import { Module } from '@nestjs/common';
import { StudentFoldersController } from './student-folders.controller';
import { StudentFoldersService } from './student-folders.service';
import { StudentTestsController } from './student-tests.controller';
import { StudentTestsService } from './student-tests.service';
import { StudentQuestionsController } from './student-questions.controller';
import { StudentQuestionsService } from './student-questions.service';

@Module({
  controllers: [StudentFoldersController, StudentTestsController, StudentQuestionsController],
  providers: [StudentFoldersService, StudentTestsService, StudentQuestionsService],
})
export class StudentTestsModule {}
