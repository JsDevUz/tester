import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { StudentFoldersService } from './student-folders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsOptional, IsString, MinLength } from 'class-validator';

class CreateStudentFolderDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string;
}

class UpdateStudentFolderDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/test-folders')
export class StudentFoldersController {
  constructor(private studentFoldersService: StudentFoldersService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.studentFoldersService.findAll(req.user.id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateStudentFolderDto) {
    return this.studentFoldersService.create(req.user.id, dto.name, dto.color, dto.icon);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateStudentFolderDto) {
    return this.studentFoldersService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.studentFoldersService.remove(id, req.user.id);
  }
}
