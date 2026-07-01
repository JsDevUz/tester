import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { FoldersService } from './folders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsOptional, IsString, MinLength } from 'class-validator';

class CreateFolderDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string;
}

class UpdateFolderDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller('folders')
export class FoldersController {
  constructor(private foldersService: FoldersService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.foldersService.findAll(req.admin.id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateFolderDto) {
    return this.foldersService.create(req.admin.id, dto.name, dto.color, dto.icon);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateFolderDto) {
    return this.foldersService.update(id, req.admin.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.foldersService.remove(id, req.admin.id);
  }
}
