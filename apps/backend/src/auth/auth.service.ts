import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { db } from '../db';
import { authCodes, users } from '../db/schema';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private telegramService: TelegramService,
  ) {}

  async login(email: string, password: string) {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
    };

    return {
      access_token: token,
      user: safeUser,
      admin: safeUser,
    };
  }

  async requestRegistration(input: { name: string; email: string; phone: string }) {
    const phone = this.telegramService.normalizePhone(input.phone);
    const email = input.email.trim().toLowerCase();
    const existingUser = await db.query.users.findFirst({
      where: or(eq(users.email, email), eq(users.phone, phone)),
    });
    if (existingUser) throw new ConflictException("Bu email yoki telefon allaqachon ro'yxatdan o'tgan.");

    await this.createAuthCode({
      phone,
      email,
      name: input.name.trim(),
      purpose: 'register',
    });

    return { ok: true };
  }

  async verifyRegistration(phoneInput: string, code: string) {
    const phone = this.telegramService.normalizePhone(phoneInput);
    const authCode = await this.verifyAuthCode(phone, 'register', code);

    if (!authCode.email || !authCode.name) {
      throw new BadRequestException("Ro'yxatdan o'tish so'rovi topilmadi.");
    }

    const existingUser = await db.query.users.findFirst({
      where: or(eq(users.email, authCode.email), eq(users.phone, phone)),
    });
    if (existingUser) throw new ConflictException("Bu foydalanuvchi allaqachon mavjud.");

    const password = this.generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({
        email: authCode.email,
        passwordHash,
        name: authCode.name,
        phone,
        role: 'student',
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        phone: users.phone,
      });

    await this.telegramService.sendCredentialsToPhone(phone, authCode.email, password);
    return { ok: true, user };
  }

  async requestPasswordReset(phoneOrEmail: string) {
    const user = await this.findUserByPhoneOrEmail(phoneOrEmail);
    if (!user?.phone) return { ok: true };

    await this.createAuthCode({
      phone: user.phone,
      email: user.email,
      name: user.name,
      purpose: 'reset',
    });

    return { ok: true };
  }

  async verifyPasswordReset(phoneOrEmail: string, code: string) {
    const user = await this.findUserByPhoneOrEmail(phoneOrEmail);
    if (!user?.phone) throw new BadRequestException("Foydalanuvchi yoki telefon topilmadi.");

    await this.verifyAuthCode(user.phone, 'reset', code);

    const password = this.generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await this.telegramService.sendCredentialsToPhone(user.phone, user.email, password);

    return { ok: true };
  }

  private async createAuthCode(input: {
    phone: string;
    email?: string;
    name?: string;
    purpose: 'register' | 'reset';
  }) {
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const telegramChatId = await this.telegramService.sendCodeToPhone(input.phone, code, input.purpose);

    await db.insert(authCodes).values({
      phone: input.phone,
      email: input.email,
      name: input.name,
      telegramChatId,
      purpose: input.purpose,
      codeHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
  }

  private async verifyAuthCode(phoneInput: string, purpose: 'register' | 'reset', code: string) {
    const phone = this.telegramService.normalizePhone(phoneInput);
    const authCode = await db.query.authCodes.findFirst({
      where: and(eq(authCodes.phone, phone), eq(authCodes.purpose, purpose), isNull(authCodes.usedAt)),
      orderBy: [desc(authCodes.createdAt)],
    });

    if (!authCode || authCode.usedAt || authCode.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Kod noto'g'ri yoki muddati tugagan.");
    }

    const valid = await bcrypt.compare(code, authCode.codeHash);
    if (!valid) throw new BadRequestException("Kod noto'g'ri yoki muddati tugagan.");

    await db.update(authCodes).set({ usedAt: new Date() }).where(eq(authCodes.id, authCode.id));
    return authCode;
  }

  private async findUserByPhoneOrEmail(phoneOrEmail: string) {
    const value = phoneOrEmail.trim();
    if (value.includes('@')) {
      return db.query.users.findFirst({ where: eq(users.email, value.toLowerCase()) });
    }

    return db.query.users.findFirst({
      where: eq(users.phone, this.telegramService.normalizePhone(value)),
    });
  }

  private generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private generatePassword() {
    return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
  }
}
