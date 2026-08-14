import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { type JwtRequest } from '../auth/types/jwt-request.interface';
import { BoardsService } from './boards.service';
import { CreateBoardDto, UpdateBoardTitleDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  @Roles('teacher', 'super')
  listBoards(@Req() req: JwtRequest) {
    return this.boardsService.listMyBoards(req.admin.id);
  }

  @Post()
  @Roles('teacher', 'super')
  createBoard(@Body() dto: CreateBoardDto, @Req() req: JwtRequest) {
    return this.boardsService.createBoard(req.admin.id, dto?.title);
  }

  @Delete(':id')
  @Roles('teacher', 'super')
  async deleteBoard(@Param('id', ParseUUIDPipe) id: string, @Req() req: JwtRequest) {
    await this.boardsService.deleteBoard(id, req.admin.id);
    return { ok: true };
  }

  @Patch(':id/title')
  @Roles('teacher', 'super')
  async updateBoardTitle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoardTitleDto,
    @Req() req: JwtRequest,
  ) {
    await this.boardsService.updateBoardTitle(id, req.admin.id, dto.title);
    return { ok: true };
  }

  @Get(':id/activity')
  @Roles('teacher', 'super')
  getBoardActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: JwtRequest,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    const adminId = req?.admin?.id ?? '';
    return this.boardsService.getBoardActivity(id, adminId, p, l);
  }

  @Get(':id/versions')
  @Roles('teacher', 'super')
  getBoardVersions(@Param('id', ParseUUIDPipe) id: string, @Req() req: JwtRequest) {
    return this.boardsService.getBoardVersions(id, req.admin.id);
  }

  @Post(':id/versions/:versionId/restore')
  @Roles('teacher', 'super')
  async restoreBoardVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId') versionId: string,
    @Req() req: JwtRequest,
  ) {
    await this.boardsService.restoreBoardVersion(id, req.admin.id, versionId);
    return { ok: true };
  }

  @Post(':id/versions/checkpoint')
  @Roles('teacher', 'super')
  async createBoardVersionCheckpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('label') label?: string,
  ) {
    await this.boardsService.createBoardVersionCheckpoint(id, label);
    return { ok: true };
  }
}
