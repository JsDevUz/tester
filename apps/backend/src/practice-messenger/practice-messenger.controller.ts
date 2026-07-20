import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PracticeMessengerService } from './practice-messenger.service';

class SendPracticeMessageDto {
  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;
}

class UpdatePracticeMessageDto {
  @IsString()
  @MaxLength(2000)
  content!: string;
}

@Controller('practice-messenger')
@UseGuards(JwtAuthGuard)
export class PracticeMessengerController {
  constructor(private readonly practiceMessengerService: PracticeMessengerService) {}

  @Get()
  list(@Req() req: any) {
    return this.practiceMessengerService.listForUser(req.user.id, req.user.role);
  }

  @Get('unread')
  unread(@Req() req: any) {
    return this.practiceMessengerService.getUnreadChatIds(req.user.id, req.user.role);
  }

  @Post('courses/:courseId/chat')
  getOrCreateChatForCourse(@Param('courseId') courseId: string, @Req() req: any) {
    return this.practiceMessengerService.getOrCreateChatForCourse(courseId, req.user.id);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @Req() req: any,
    @Query('before') before?: string,
    @Query('timezoneOffsetMinutes') timezoneOffset?: string,
  ) {
    return this.practiceMessengerService.getChat(
      id,
      req.user.id,
      req.user.role,
      before,
      Number(timezoneOffset ?? 0),
    );
  }

  @Post(':id/messages')
  sendMessage(@Param('id') id: string, @Req() req: any, @Body() dto: SendPracticeMessageDto) {
    return this.practiceMessengerService.sendText(id, req.user.id, req.user.role, dto.content, dto.replyToMessageId);
  }

  @Patch(':chatId/messages/:messageId')
  updateMessage(@Param('chatId') chatId: string, @Param('messageId') messageId: string, @Req() req: any, @Body() dto: UpdatePracticeMessageDto) {
    return this.practiceMessengerService.updateText(chatId, messageId, req.user.id, req.user.role, dto.content);
  }

  @Delete(':chatId/messages/:messageId')
  deleteMessage(@Param('chatId') chatId: string, @Param('messageId') messageId: string, @Req() req: any) {
    return this.practiceMessengerService.deleteText(chatId, messageId, req.user.id, req.user.role);
  }
}
