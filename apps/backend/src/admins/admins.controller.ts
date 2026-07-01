import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

class CreateAdminDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() @MinLength(1) name: string;
}

class UpdateRoleDto {
  @IsIn(['student', 'teacher', 'super']) role: 'student' | 'teacher' | 'super';
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super')
@Controller('admins')
export class AdminsController {
  constructor(private adminsService: AdminsService) {}

  @Get()
  findAll() {
    return this.adminsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateAdminDto) {
    return this.adminsService.create(dto.email, dto.password, dto.name);
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @Req() req: any) {
    return this.adminsService.updateRole(id, dto.role, req.user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.adminsService.remove(id, req.user.id);
  }
}
