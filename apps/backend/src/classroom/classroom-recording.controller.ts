import { Controller, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { WebhookReceiver } from 'livekit-server-sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { classSessions } from '../db/schema';
import { StorageService } from '../storage/storage.service';

// LiveKit signs webhook payloads itself — this route has NO JwtAuthGuard,
// signature verification via WebhookReceiver is the auth mechanism.
// MUHIM: bu yerdagi hech qanday xatolik dars oqimiga ta'sir qilmaydi —
// bu shunchaki keyinroq recordingUrl'ni to'ldiradigan fon jarayoni.
@Controller('webhooks/livekit')
export class ClassroomRecordingController {
  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authHeader = '',
  ): Promise<{ ok: true }> {
    try {
      const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
      const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
      if (!apiKey || !apiSecret) return { ok: true };

      const receiver = new WebhookReceiver(apiKey, apiSecret);
      if (!req.rawBody) return { ok: true };
      const event = await receiver.receive(req.rawBody.toString('utf8'), authHeader);
      if (event.event !== 'egress_ended') return { ok: true };

      const info = event.egressInfo;
      if (!info?.egressId) return { ok: true };

      const sessionRow = await db.query.classSessions.findFirst({ where: eq(classSessions.egressId, info.egressId) });
      if (!sessionRow) return { ok: true };

      const failed = info.error && info.error.length > 0;
      const location = info.fileResults?.[0]?.location ?? info.fileResults?.[0]?.filename ?? null;
      const recordingUrl = location ? this.storage.getPublicUrl(location) : null;
      await db.update(classSessions)
        .set({
          recordingStatus: failed ? 'failed' : (location ? 'ready' : 'failed'),
          recordingUrl: failed ? null : recordingUrl,
        })
        .where(eq(classSessions.id, sessionRow.id));
    } catch (e) {
      console.error('classroom livekit webhook: failed to process', e);
    }
    return { ok: true };
  }
}
