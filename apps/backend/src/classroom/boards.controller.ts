import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClassroomService } from './classroom.service';

class CreateBoardDto {
  @IsOptional() @IsString() title?: string;
}

class UpdateBoardTitleDto {
  @IsString() title!: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly classroomService: ClassroomService) {}

  @Get()
  @Roles('teacher', 'super')
  listBoards(@Req() req: any) {
    return this.classroomService.listMyBoards(req.admin.id);
  }

  @Post()
  @Roles('teacher', 'super')
  createBoard(@Body() dto: CreateBoardDto, @Req() req: any) {
    return this.classroomService.createBoard(req.admin.id, dto?.title);
  }

  @Delete(':id')
  @Roles('teacher', 'super')
  async deleteBoard(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    await this.classroomService.deleteBoard(id, req.admin.id);
    return { ok: true };
  }

  @Patch(':id/title')
  @Roles('teacher', 'super')
  async updateBoardTitle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoardTitleDto,
    @Req() req: any,
  ) {
    await this.classroomService.updateBoardTitle(id, req.admin.id, dto.title);
    return { ok: true };
  }

  @Get(':id/activity')
  @Roles('teacher', 'super')
  getBoardActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    return this.classroomService.getBoardActivity(id, req.admin.id, p, l);
  }

  @Get(':id/versions')
  @Roles('teacher', 'super')
  getBoardVersions(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.classroomService.getBoardVersions(id, req.admin.id);
  }

  @Post(':id/versions/:versionId/restore')
  @Roles('teacher', 'super')
  async restoreBoardVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId') versionId: string,
    @Req() req: any,
  ) {
    await this.classroomService.restoreBoardVersion(id, req.admin.id, versionId);
    return { ok: true };
  }

  @Post(':id/versions/checkpoint')
  @Roles('teacher', 'super')
  async createBoardVersionCheckpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('label') label?: string,
  ) {
    await this.classroomService.createBoardVersionCheckpoint(id, label);
    return { ok: true };
  }
}
