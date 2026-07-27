import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, Req, HttpCode } from '@nestjs/common';
import { TestsService } from './tests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsOptional, IsInt, IsBoolean, IsIn, Min, IsDateString, MinLength, IsArray, IsUUID } from 'class-validator';

class CreateTestDto {
  @IsString() folderId: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) timeLimit?: number;
  @IsOptional() @IsIn(['immediately', 'after_deadline', 'hidden', 'per_question']) showResults?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsBoolean() oneByOne?: boolean;
  @IsOptional() @IsBoolean() requireAuth?: boolean;
  @IsOptional() @IsBoolean() autoCompleteOnLeave?: boolean;
  @IsOptional() @IsBoolean() onceOnly?: boolean;
  @IsOptional() @IsDateString() deadline?: string;
}

class UpdateTestDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) timeLimit?: number;
  @IsOptional() @IsIn(['immediately', 'after_deadline', 'hidden', 'per_question']) showResults?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsBoolean() oneByOne?: boolean;
  @IsOptional() @IsBoolean() requireAuth?: boolean;
  @IsOptional() @IsBoolean() autoCompleteOnLeave?: boolean;
  @IsOptional() @IsBoolean() onceOnly?: boolean;
  @IsOptional() @IsDateString() deadline?: string;
}

class UpsertPinDto {
  @IsUUID() courseId: string;
  @IsArray() @IsUUID(undefined, { each: true }) groupIds: string[];
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller('tests')
export class TestsController {
  constructor(private testsService: TestsService) {}

  @Get()
  findAll(@Query('folder_id') folderId: string, @Req() req: any) {
    return this.testsService.findAll(folderId, req.admin.id);
  }

  @Post()
  create(@Body() dto: CreateTestDto, @Req() req: any) {
    return this.testsService.create(req.admin.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.testsService.findOne(id, req.admin.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTestDto, @Req() req: any) {
    return this.testsService.update(id, req.admin.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.testsService.remove(id, req.admin.id);
  }

  @Get(':id/pin')
  getPin(@Param('id') id: string, @Req() req: any) {
    return this.testsService.getPin(id, req.admin.id);
  }

  @Put(':id/pin')
  upsertPin(@Param('id') id: string, @Body() dto: UpsertPinDto, @Req() req: any) {
    return this.testsService.upsertPin(id, req.admin.id, dto);
  }

  @Delete(':id/pin')
  @HttpCode(204)
  removePin(@Param('id') id: string, @Req() req: any) {
    return this.testsService.removePin(id, req.admin.id);
  }
}
