import { Controller, Post, Patch, Body, Get, UseGuards, Req, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Auth kod/login endpointlari brute-force'ga qarshi qat'iyroq limitga ega:
// har bir client IP uchun bir daqiqada 5 tagacha urinish.
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

class LoginDto {
  @IsString() @MinLength(7) phone: string;
  @IsString() @MinLength(1) password: string;
}

class RegisterRequestDto {
  @IsString() @MinLength(2) name: string;
  @IsString() @MinLength(7) phone: string;
}

class RegisterVerifyDto {
  @IsString() @MinLength(4) code: string;
}

class TelegramCodeDto {
  @IsString() @MinLength(4) code: string;
}

class PasswordResetRequestDto {
  @IsString() @MinLength(7) phone: string;
}

class PasswordResetVerifyDto {
  @IsString() @MinLength(7) phone: string;
  @IsString() @MinLength(4) code: string;
}

class PasswordResetCodeDto {
  @IsString() @MinLength(6) code: string;
}

class PasswordResetCompleteDto {
  @IsString() @MinLength(10) resetToken: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
  @IsString() @MinLength(8) @MaxLength(128) confirmPassword: string;
}

class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  // Empty string clears the custom avatar back to the Telegram-synced one —
  // only validate as a URL when non-empty.
  @IsOptional() @IsString() @MaxLength(2048) avatarUrl?: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.phone, dto.password);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('register/request')
  @HttpCode(200)
  requestRegistration(@Body() dto: RegisterRequestDto) {
    return this.authService.requestRegistration(dto);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('register/verify')
  @HttpCode(200)
  verifyRegistration(@Body() dto: RegisterVerifyDto) {
    return this.authService.verifyRegistration(dto.code);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('telegram/verify')
  @HttpCode(200)
  verifyTelegramCode(@Body() dto: TelegramCodeDto) {
    return this.authService.verifyTelegramCode(dto.code);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('password/reset/request')
  @HttpCode(200)
  requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(dto.phone);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('password/reset/verify')
  @HttpCode(200)
  verifyPasswordReset(@Body() dto: PasswordResetVerifyDto) {
    return this.authService.verifyPasswordReset(dto.phone, dto.code);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('password/reset/verify-code')
  @HttpCode(200)
  verifyPasswordResetCode(@Body() dto: PasswordResetCodeDto) {
    return this.authService.verifyPasswordResetCode(dto.code);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('password/reset/complete')
  @HttpCode(200)
  completePasswordReset(@Body() dto: PasswordResetCompleteDto) {
    return this.authService.completePasswordReset(dto.resetToken, dto.newPassword, dto.confirmPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.authService.getMe(req.admin.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.admin.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  @Patch('me/password')
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.admin.id, dto.currentPassword, dto.newPassword);
  }
}
