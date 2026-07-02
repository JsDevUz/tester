import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, HttpCode } from '@nestjs/common';
import { TestsService } from './tests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsOptional, IsInt, IsBoolean, IsIn, Min, IsDateString, MinLength } from 'class-validator';

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
  @IsOptional() @IsDateString() deadline?: string;
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
}
