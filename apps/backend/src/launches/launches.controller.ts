import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { LaunchesService } from './launches.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

class CreateLaunchDto {
  @IsString() @MinLength(1) name: string;
}

class UpdateLaunchDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class CreatePlanDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) price: number;
  @IsOptional() @IsInt() @Min(0) originalPrice?: number | null;
  @IsOptional() @IsUUID() groupId?: string | null;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() endDate?: string | null;
}

class UpdatePlanDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(0) originalPrice?: number | null;
  @IsOptional() @IsUUID() groupId?: string | null;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() endDate?: string | null;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class LaunchesController {
  constructor(private launchesService: LaunchesService) {}

  @Get('courses/:courseId/launches')
  findAll(@Param('courseId') courseId: string, @Req() req: any) {
    return this.launchesService.findAll(courseId, req.admin.id);
  }

  @Post('courses/:courseId/launches')
  create(@Param('courseId') courseId: string, @Req() req: any, @Body() dto: CreateLaunchDto) {
    return this.launchesService.create(courseId, req.admin.id, dto.name);
  }

  @Patch('launches/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateLaunchDto) {
    return this.launchesService.update(id, req.admin.id, dto);
  }

  @Delete('launches/:id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.launchesService.remove(id, req.admin.id);
  }

  @Post('launches/:launchId/plans')
  createPlan(@Param('launchId') launchId: string, @Req() req: any, @Body() dto: CreatePlanDto) {
    return this.launchesService.createPlan(launchId, req.admin.id, dto);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Req() req: any, @Body() dto: UpdatePlanDto) {
    return this.launchesService.updatePlan(id, req.admin.id, dto);
  }

  @Delete('plans/:id')
  removePlan(@Param('id') id: string, @Req() req: any) {
    return this.launchesService.removePlan(id, req.admin.id);
  }
}
