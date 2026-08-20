import { Controller, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { WebhookReceiver } from 'livekit-server-sdk';
import { eq, isNotNull } from 'drizzle-orm';
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

      // classSessions.egressId only ever holds the LATEST egress, so a webhook for an earlier
      // recording in the same session would not be found by it. Fall back to scanning the
      // recordings array, which keeps every take.
      let sessionRow = await db.query.classSessions.findFirst({ where: eq(classSessions.egressId, info.egressId) });
      if (!sessionRow) {
        const candidates = await db.query.classSessions.findMany({
          where: isNotNull(classSessions.recordings),
          columns: { id: true, recordings: true, egressId: true },
        });
        sessionRow = candidates.find((row) =>
          ((row.recordings as unknown as any[]) ?? []).some((r) => r.egressId === info.egressId),
        ) as typeof sessionRow;
      }
      if (!sessionRow) return { ok: true };

      const failed = info.error && info.error.length > 0;
      const location = info.fileResults?.[0]?.location ?? info.fileResults?.[0]?.filename ?? null;
      const recordingUrl = location ? this.storage.getPublicUrl(location) : null;
      const status = failed ? 'failed' : (location ? 'ready' : 'failed');

      const rawRecordings = (sessionRow.recordings as unknown as any[]) ?? [];
      // Match on egressId alone. The old "or any pending row" fallback silently attached a
      // finished file to the wrong take whenever a session had more than one.
      const updatedRecordings = rawRecordings.map((r) =>
        r.egressId === info.egressId
          ? { ...r, recordingStatus: status, recordingUrl: failed ? null : recordingUrl }
          : r,
      );

      await db.update(classSessions)
        .set({
          recordingStatus: status,
          recordingUrl: failed ? null : recordingUrl,
          recordings: updatedRecordings,
        })
        .where(eq(classSessions.id, sessionRow.id));
    } catch (e) {
      console.error('classroom livekit webhook: failed to process', e);
    }
    return { ok: true };
  }
}
