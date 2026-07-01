import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { db } from '../db';
import { userTelegramLinks } from '../db/schema';
import { eq } from 'drizzle-orm';

interface TelegramMessage {
  chat?: { id?: number | string };
  from?: { id?: number | string; first_name?: string };
  text?: string;
  contact?: { phone_number?: string; user_id?: number | string; first_name?: string };
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  normalizePhone(phone: string) {
    const cleaned = phone.trim().replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`;
    return cleaned.replace(/\D/g, '');
  }

  async handleUpdate(update: unknown) {
    const message = (update as TelegramUpdate)?.message;
    if (!message?.chat?.id) return;

    if (message.text?.startsWith('/start')) {
      await this.sendMessage(
        String(message.chat.id),
        "Assalomu alaykum! Ro'yxatdan o'tish va parol tiklash uchun kontaktingizni yuboring.",
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

      await db
        .insert(userTelegramLinks)
        .values({ phone, telegramChatId, telegramUserId, firstName })
        .onConflictDoUpdate({
          target: userTelegramLinks.phone,
          set: { telegramChatId, telegramUserId, firstName },
        });

      await this.sendMessage(telegramChatId, "Kontakt bog'landi. Endi saytdan kod olishingiz mumkin.", {
        reply_markup: { remove_keyboard: true },
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
    await this.sendMessage(link.telegramChatId, `${title}: ${code}\nKod 5 daqiqa amal qiladi.`);
    return link.telegramChatId;
  }

  async sendCredentialsToPhone(phone: string, email: string, password: string) {
    const normalizedPhone = this.normalizePhone(phone);
    const link = await db.query.userTelegramLinks.findFirst({
      where: eq(userTelegramLinks.phone, normalizedPhone),
    });

    if (!link) {
      throw new BadRequestException("Telegram kontakt bog'lanmagan.");
    }

    await this.sendMessage(link.telegramChatId, `Login: ${email}\nParol: ${password}`);
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
}
