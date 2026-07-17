import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { db } from '../db';
import { authCodes, userTelegramLinks, users } from '../db/schema';
import { and, eq, gt } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { StorageService } from '../storage/storage.service';

interface TelegramMessage {
  chat?: { id?: number | string };
  from?: { id?: number | string; first_name?: string; last_name?: string };
  text?: string;
  contact?: { phone_number?: string; user_id?: number | string; first_name?: string; last_name?: string };
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private storageService: StorageService) {}

  normalizePhone(phone: string) {
    return phone.replace(/\D/g, '');
  }

  async handleUpdate(update: unknown) {
    const message = (update as TelegramUpdate)?.message;
    if (!message?.chat?.id) return;

    if (message.text?.startsWith('/start') || message.text?.startsWith('/login')) {
      const chatId = String(message.chat.id);
      const link = await db.query.userTelegramLinks.findFirst({
        where: eq(userTelegramLinks.telegramChatId, chatId),
      });

      if (link) {
        // Check if there's an active code not yet expired
        const existing = await db.query.authCodes.findFirst({
          where: and(
            eq(authCodes.phone, link.phone),
            eq(authCodes.purpose, 'login'),
            gt(authCodes.expiresAt, new Date()),
          ),
        });

        if (existing) {
          await this.sendMessage(chatId, `⏳ Avvalgi kod hali amal qiladi.\n1 daqiqa kuting, so'ng qayta /login bosing.`);
          return;
        }

        const code = await this.createLoginCode({ phone: link.phone, telegramChatId: chatId });
        await this.sendMessage(chatId, `Kirish kodi: \`${code}\`\n\nYangi kod olish uchun /login bosing.`, { parse_mode: 'Markdown' });
        if (link.telegramUserId) {
          void this.syncProfilePhoto(link.phone, link.telegramUserId);
        }
        return;
      }

      await this.sendMessage(
        chatId,
        "Assalomu alaykum! Saytga kirish uchun kontaktingizni yuboring.",
        {
          reply_markup: {
            keyboard: [[{ text: 'Kontaktni yuborish', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        },
      );
      return;
    }

    if (message.contact?.phone_number) {
      const phone = this.normalizePhone(message.contact.phone_number);
      const telegramChatId = String(message.chat.id);
      const telegramUserId = String(message.contact.user_id ?? message.from?.id ?? '');
      const firstName = message.contact.first_name ?? message.from?.first_name ?? null;
      const lastName = message.contact.last_name ?? message.from?.last_name ?? null;

      await db
        .insert(userTelegramLinks)
        .values({ phone, telegramChatId, telegramUserId, firstName, lastName })
        .onConflictDoUpdate({
          target: userTelegramLinks.phone,
          set: { telegramChatId, telegramUserId, firstName, lastName },
        });

      if (telegramUserId) {
        void this.syncProfilePhoto(phone, telegramUserId);
      }

      const code = await this.createLoginCode({
        phone,
        telegramChatId,
      });

      await this.sendMessage(telegramChatId, `Kirish kodi: \`${code}\`\n\nYangi kod olish uchun /login bosing.`, {
        reply_markup: { remove_keyboard: true },
        parse_mode: 'Markdown',
      });
    }
  }

  async sendCodeToPhone(phone: string, code: string, purpose: 'register' | 'reset') {
    const normalizedPhone = this.normalizePhone(phone);
    const link = await db.query.userTelegramLinks.findFirst({
      where: eq(userTelegramLinks.phone, normalizedPhone),
    });

    if (!link) {
      throw new BadRequestException("Telegram botga /start bosib, kontaktni yuboring.");
    }

    const title = purpose === 'register' ? "Ro'yxatdan o'tish kodi" : 'Parolni tiklash kodi';
    await this.sendMessage(link.telegramChatId, `${title}: ${code}\nKod 1 daqiqa amal qiladi.`);
    return link.telegramChatId;
  }

  async sendCredentialsToPhone(phone: string, password: string) {
    const normalizedPhone = this.normalizePhone(phone);
    const link = await db.query.userTelegramLinks.findFirst({
      where: eq(userTelegramLinks.phone, normalizedPhone),
    });

    if (!link) {
      throw new BadRequestException("Telegram kontakt bog'lanmagan.");
    }

    await this.sendMessage(
      link.telegramChatId,
      `Bu sizning login va parolingiz:\nLogin: +${normalizedPhone}\nParol: ${password}`,
    );
  }

  private async syncProfilePhoto(phone: string, telegramUserId: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    try {
      const photosResponse = await fetch(
        `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${telegramUserId}&limit=1`,
      );
      if (!photosResponse.ok) return;
      const photosData = await photosResponse.json();
      const fileId = photosData?.result?.photos?.[0]?.[0]?.file_id;
      if (!fileId) return;

      const fileResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      if (!fileResponse.ok) return;
      const fileData = await fileResponse.json();
      const filePath = fileData?.result?.file_path;
      if (!filePath) return;

      const downloadResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
      if (!downloadResponse.ok) return;
      const buffer = Buffer.from(await downloadResponse.arrayBuffer());

      const ext = filePath.split('.').pop() || 'jpg';
      const key = `avatars/${randomUUID()}.${ext}`;
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const uploadedKey = await this.storageService.uploadBuffer(key, buffer, contentType, 'public, max-age=86400');
      const publicUrl = this.storageService.getPublicUrl(uploadedKey);

      await db.update(users).set({ avatarUrl: publicUrl }).where(eq(users.phone, phone));
    } catch (error) {
      this.logger.warn(`Failed to sync Telegram profile photo: ${error}`);
    }
  }

  private async sendMessage(chatId: string, text: string, extra: Record<string, unknown> = {}) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not configured');
      throw new BadRequestException('Telegram bot sozlanmagan.');
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });

    if (!response.ok) {
      this.logger.error(`Telegram sendMessage failed with ${response.status}`);
      throw new BadRequestException('Telegram xabar yuborilmadi.');
    }
  }

  private async createLoginCode(input: { phone: string; telegramChatId: string }) {
    const code = String(randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);

    await db.insert(authCodes).values({
      phone: input.phone,
      telegramChatId: input.telegramChatId,
      purpose: 'login',
      codeHash,
      expiresAt: new Date(Date.now() + 60 * 1000),
    });

    return code;
  }
}
