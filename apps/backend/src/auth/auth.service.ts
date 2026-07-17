import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { db } from '../db';
import { authCodes, userTelegramLinks, users } from '../db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { TelegramService } from '../telegram/telegram.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private telegramService: TelegramService,
    private storageService: StorageService,
  ) {}

  async login(phone: string, password: string) {
    const normalizedPhone = this.telegramService.normalizePhone(phone);
    const user = await db.query.users.findFirst({ where: eq(users.phone, normalizedPhone) });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({
      sub: user.id,
      phone: user.phone,
      name: user.displayName,
      role: user.role,
    });

    const safeUser = {
      id: user.id,
      name: user.displayName,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.displayAvatarUrl,
    };

    return {
      access_token: token,
      user: safeUser,
      admin: safeUser,
    };
  }

  async requestRegistration(input: { name: string; phone: string }) {
    const phone = this.telegramService.normalizePhone(input.phone);
    const existingUser = await db.query.users.findFirst({ where: eq(users.phone, phone) });
    if (existingUser) throw new ConflictException("Bu telefon allaqachon ro'yxatdan o'tgan.");

    await this.createAuthCode({
      phone,
      name: input.name.trim(),
      purpose: 'register',
    });

    return { ok: true };
  }

  async verifyRegistration(code: string) {
    const authCode = await this.verifyRegistrationCode(code);
    const phone = authCode.phone;

    if (!authCode.name) {
      throw new BadRequestException("Ro'yxatdan o'tish so'rovi topilmadi.");
    }

    const password = this.generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    // existingUser check + insert wrapped in one transaction: the `users.phone`
    // unique constraint is the real guard against a race between
    // two concurrent verify calls, but doing the check-then-insert inside a
    // transaction keeps the read consistent with the write.
    const user = await db.transaction(async (tx) => {
      const existingUser = await tx.query.users.findFirst({
        where: eq(users.phone, phone),
      });
      if (existingUser) throw new ConflictException("Bu foydalanuvchi allaqachon mavjud.");

      const [created] = await tx
        .insert(users)
        .values({
          passwordHash,
          name: authCode.name!,
          phone,
          role: 'student',
        })
        .returning({
          id: users.id,
          name: users.displayName,
          role: users.role,
          phone: users.phone,
        });
      return created;
    });

    await this.telegramService.sendCredentialsToPhone(phone, password);
    return { ok: true, user };
  }

  async getMe(userId: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      name: user.displayName,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.displayAvatarUrl,
    };
  }

  // Updates the user's custom profile fields. These always take priority over
  // the Telegram-synced `name`/`avatarUrl` — see displayName/displayAvatarUrl
  // generated columns in schema.ts. Passing an empty string clears the custom
  // value, reverting the display back to the Telegram-sourced one.
  async updateProfile(userId: string, input: { name?: string; avatarUrl?: string }) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new UnauthorizedException('User not found');

    const patch: { customName?: string | null; customAvatarUrl?: string | null } = {};

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      patch.customName = trimmed || null;
    }

    if (input.avatarUrl !== undefined) {
      const trimmed = input.avatarUrl.trim();
      patch.customAvatarUrl = trimmed || null;
      // A new custom avatar replaces the old one — delete the old file from
      // object storage so it doesn't linger as an orphaned upload. Only ever
      // touch customAvatarUrl here, never the Telegram-synced avatarUrl.
      if (user.customAvatarUrl && user.customAvatarUrl !== trimmed) {
        void this.storageService.deleteFile(user.customAvatarUrl).catch(() => {});
      }
    }

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();

    return {
      id: updated.id,
      name: updated.displayName,
      role: updated.role,
      phone: updated.phone,
      avatarUrl: updated.displayAvatarUrl,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new UnauthorizedException('User not found');

    const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentValid) throw new BadRequestException("Joriy parol noto'g'ri");
    if (currentPassword === newPassword) {
      throw new BadRequestException('Yangi parol joriy paroldan farq qilishi kerak');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
    return { ok: true };
  }

  async verifyTelegramCode(code: string) {
    const authCode = await this.verifyCodeByPurpose(code, 'login');
    const phone = this.telegramService.normalizePhone(authCode.phone);
    let user = await db.query.users.findFirst({ where: eq(users.phone, phone) });

    if (!user) {
      const link = await db.query.userTelegramLinks.findFirst({ where: eq(userTelegramLinks.phone, phone) });
      if (!link) throw new BadRequestException("Avval botga kontakt yuboring.");
      const password = this.generateStrongPassword(10);
      const passwordHash = await bcrypt.hash(password, 10);
      const name = [link.firstName, link.lastName].filter(Boolean).join(' ').trim() || 'Telegram foydalanuvchi';
      [user] = await db
        .insert(users)
        .values({ passwordHash, name, phone, role: 'student' })
        .returning();
      await this.telegramService.sendCredentialsToPhone(link.phone, password);
    }

    return this.createAuthResponse(user);
  }

  async requestPasswordReset(phone: string) {
    const user = await this.findUserByPhone(phone);
    if (!user?.phone) return { ok: true };

    await this.createAuthCode({
      phone: user.phone,
      name: user.name,
      purpose: 'reset',
    });

    return { ok: true };
  }

  async verifyPasswordReset(phone: string, code: string) {
    const user = await this.findUserByPhone(phone);
    if (!user?.phone) throw new BadRequestException("Foydalanuvchi topilmadi.");

    await this.verifyAuthCode(user.phone, 'reset', code);

    const password = this.generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await this.telegramService.sendCredentialsToPhone(user.phone, password);

    return { ok: true };
  }

  async verifyPasswordResetCode(code: string) {
    const authCode = await this.verifyCodeByPurpose(code, 'login');
    const phone = this.telegramService.normalizePhone(authCode.phone);
    const user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
    if (!user) throw new BadRequestException("Foydalanuvchi topilmadi.");
    const resetToken = this.jwtService.sign(
      { sub: user.id, purpose: 'password_reset' },
      { expiresIn: '10m' },
    );
    return { resetToken };
  }

  async completePasswordReset(resetToken: string, newPassword: string, confirmPassword: string) {
    if (newPassword !== confirmPassword) throw new BadRequestException('Parollar mos kelmadi.');
    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwtService.verify(resetToken);
    } catch {
      throw new BadRequestException("Tiklash sessiyasi tugagan. Qaytadan kod oling.");
    }
    if (payload.purpose !== 'password_reset' || !payload.sub) {
      throw new BadRequestException('Noto‘g‘ri tiklash sessiyasi.');
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (!user) throw new BadRequestException('Foydalanuvchi topilmadi.');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    return this.createAuthResponse({
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      phone: user.phone,
      displayAvatarUrl: user.displayAvatarUrl,
    });
  }

  private async createAuthCode(input: {
    phone: string;
    name?: string;
    purpose: 'register' | 'reset';
  }) {
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const telegramChatId = await this.telegramService.sendCodeToPhone(input.phone, code, input.purpose);

    await db.insert(authCodes).values({
      phone: input.phone,
      name: input.name,
      telegramChatId,
      purpose: input.purpose,
      codeHash,
      expiresAt: new Date(Date.now() + 60 * 1000),
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

  private async verifyRegistrationCode(code: string) {
    return this.verifyCodeByPurpose(code, 'register');
  }

  private async verifyCodeByPurpose(code: string, purpose: string) {
    const candidates = await db.query.authCodes.findMany({
      where: and(eq(authCodes.purpose, purpose), isNull(authCodes.usedAt)),
      orderBy: [desc(authCodes.createdAt)],
      limit: 20,
    });

    for (const authCode of candidates) {
      if (authCode.expiresAt.getTime() < Date.now()) continue;
      const valid = await bcrypt.compare(code, authCode.codeHash);
      if (!valid) continue;

      await db.update(authCodes).set({ usedAt: new Date() }).where(eq(authCodes.id, authCode.id));
      return authCode;
    }

    throw new BadRequestException("Kod noto'g'ri yoki muddati tugagan.");
  }

  private createAuthResponse(user: {
    id: string;
    displayName: string;
    role: string;
    phone: string;
    displayAvatarUrl: string | null;
  }) {
    const token = this.jwtService.sign({
      sub: user.id,
      phone: user.phone,
      name: user.displayName,
      role: user.role,
    });

    const safeUser = {
      id: user.id,
      name: user.displayName,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.displayAvatarUrl,
    };

    return {
      access_token: token,
      user: safeUser,
      admin: safeUser,
    };
  }

  private async findUserByPhone(phone: string) {
    const normalizedPhone = this.telegramService.normalizePhone(phone);
    return db.query.users.findFirst({ where: eq(users.phone, normalizedPhone) });
  }

  private generateCode() {
    return String(randomInt(100000, 1000000));
  }

  private generatePassword() {
    return randomInt(36 ** 6, 36 ** 7 - 1).toString(36) + randomInt(36 ** 6, 36 ** 7 - 1).toString(36);
  }

  private generateStrongPassword(length: number) {
    const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%'];
    const all = groups.join('');
    const characters = groups.map((group) => group[randomInt(0, group.length)]);
    while (characters.length < length) characters.push(all[randomInt(0, all.length)]);
    for (let index = characters.length - 1; index > 0; index--) {
      const swapIndex = randomInt(0, index + 1);
      [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
    }
    return characters.join('');
  }
}
