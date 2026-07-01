import { Controller, Post, Body, Get, UseGuards, Req, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IsEmail, IsString, MinLength } from 'class-validator';

class LoginDto {
  @IsString() @MinLength(3) email: string;
  @IsString() @MinLength(1) password: string;
}

class RegisterRequestDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(7) phone: string;
}

class RegisterVerifyDto {
  @IsString() @MinLength(4) code: string;
}

class PasswordResetRequestDto {
  @IsString() @MinLength(3) phoneOrEmail: string;
}

class PasswordResetVerifyDto {
  @IsString() @MinLength(3) phoneOrEmail: string;
  @IsString() @MinLength(4) code: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('register/request')
  @HttpCode(200)
  requestRegistration(@Body() dto: RegisterRequestDto) {
    return this.authService.requestRegistration(dto);
  }

  @Post('register/verify')
  @HttpCode(200)
  verifyRegistration(@Body() dto: RegisterVerifyDto) {
    return this.authService.verifyRegistration(dto.code);
  }

  @Post('password/reset/request')
  @HttpCode(200)
  requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(dto.phoneOrEmail);
  }

  @Post('password/reset/verify')
  @HttpCode(200)
  verifyPasswordReset(@Body() dto: PasswordResetVerifyDto) {
    return this.authService.verifyPasswordReset(dto.phoneOrEmail, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.admin;
  }
}
