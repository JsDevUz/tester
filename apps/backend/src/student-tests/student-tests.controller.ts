import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, HttpCode } from '@nestjs/common';
import { StudentTestsService } from './student-tests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsOptional, IsInt, IsBoolean, IsIn, Min, MinLength } from 'class-validator';

class CreateStudentTestDto {
  @IsString() folderId: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) timeLimit?: number;
  @IsOptional() @IsIn(['immediately', 'after_deadline', 'hidden', 'per_question']) showResults?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsBoolean() oneByOne?: boolean;
  @IsOptional() @IsBoolean() autoCompleteOnLeave?: boolean;
}

class UpdateStudentTestDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) timeLimit?: number;
  @IsOptional() @IsIn(['immediately', 'after_deadline', 'hidden', 'per_question']) showResults?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsBoolean() oneByOne?: boolean;
  @IsOptional() @IsBoolean() autoCompleteOnLeave?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/tests')
export class StudentTestsController {
  constructor(private studentTestsService: StudentTestsService) {}

  @Get()
  findAll(@Query('folder_id') folderId: string, @Req() req: any) {
    return this.studentTestsService.findAllForFolder(folderId, req.user.id);
  }

  @Post()
  create(@Body() dto: CreateStudentTestDto, @Req() req: any) {
    return this.studentTestsService.create(req.user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.studentTestsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStudentTestDto, @Req() req: any) {
    return this.studentTestsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.studentTestsService.remove(id, req.user.id);
  }
}
