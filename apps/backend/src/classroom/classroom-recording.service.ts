import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressClient, EncodedFileOutput, S3Upload, EncodedFileType } from 'livekit-server-sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { classSessions } from '../db/schema';

interface LiveKitConfig { url: string; apiKey: string; apiSecret: string }
interface StorageConfig {
  bucket: string; region: string; endpoint: string;
  accessKeyId: string; secretAccessKey: string; publicBaseUrl: string; forcePathStyle: boolean;
}

// LiveKit Egress orqali dars ovozini yozib olish — MUHIM: bu xizmatning
// hech qanday chaqiruvi jonli darsni to'xtatishi yoki sekinlashtirishi
// mumkin emas. Har bir metod o'z ichida xatolarni ushlaydi, hech narsa
// yuqoriga otilmaydi — faqat console.error orqali log yoziladi.
@Injectable()
export class ClassroomRecordingService {
  private readonly starting = new Set<string>();

  constructor(private readonly config: ConfigService) {}

  private publicRecordingUrl(location: string, storage: StorageConfig): string {
    if (/^https?:\/\//i.test(location)) return location;
    let key = location.replace(/^\/+/, '');
    if (/^s3:\/\//i.test(key)) {
      const withoutScheme = key.replace(/^s3:\/\//i, '');
      const slashIndex = withoutScheme.indexOf('/');
      key = slashIndex >= 0 ? withoutScheme.slice(slashIndex + 1) : '';
    }
    return storage.publicBaseUrl ? `${storage.publicBaseUrl}/${key}` : key;
  }

  private async persistEgressResult(sessionId: string, info: {
    status: number;
    error?: string;
    fileResults?: Array<{ location?: string; filename?: string }>;
  }): Promise<boolean> {
    const result = info.fileResults?.[0];
    const location = result?.location || result?.filename || null;
    const terminal = info.status >= 3 || !!info.error;
    if (!terminal) return false;
    const failed = info.status >= 4 || !!info.error || !location;

    const storage = this.storageConfig();
    await db.update(classSessions)
      .set({
        recordingStatus: failed ? 'failed' : 'ready',
        recordingUrl: failed || !storage ? null : this.publicRecordingUrl(location, storage),
      })
      .where(eq(classSessions.id, sessionId));
    return true;
  }

  private livekitConfig(): LiveKitConfig | null {
    const url = this.config.get<string>('LIVEKIT_URL');
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) return null;
    return { url, apiKey, apiSecret };
  }

  private storageConfig(): StorageConfig | null {
    const bucket = this.config.get<string>('OBJECT_STORAGE_BUCKET_NAME');
    const accessKeyId = this.config.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY');
    const endpointRaw = this.config.get<string>('OBJECT_STORAGE_ENDPOINT') || '';
    const publicBaseUrl = (this.config.get<string>('OBJECT_STORAGE_PUBLIC_BASE_URL') || '').replace(/\/+$/, '');
    if (!bucket || !accessKeyId || !secretAccessKey) return null;
    const endpoint = /^https?:\/\//i.test(endpointRaw) ? endpointRaw.replace(/\/+$/, '') : `https://${endpointRaw.replace(/\/+$/, '')}`;
    return {
      bucket, accessKeyId, secretAccessKey, endpoint, publicBaseUrl,
      region: this.config.get<string>('OBJECT_STORAGE_REGION') || 'auto',
      forcePathStyle: this.config.get<string>('OBJECT_STORAGE_FORCE_PATH_STYLE') === 'true',
    };
  }

  async startRecording(sessionId: string): Promise<void> {
    if (this.starting.has(sessionId)) return;
    this.starting.add(sessionId);
    try {
      const lk = this.livekitConfig();
      const storage = this.storageConfig();
      if (!lk || !storage) {
        console.error(`startRecording: LiveKit yoki object storage sozlanmagan (${sessionId})`);
        return;
      }

      const row = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sessionId) });
      if (!row || row.egressId || row.recordingStatus === 'pending' || row.recordingStatus === 'ready') return;

      const httpUrl = lk.url.replace(/^ws/, 'http');
      const egress = new EgressClient(httpUrl, lk.apiKey, lk.apiSecret);
      const filepath = `classroom-recordings/${sessionId}.ogg`;
      const output = new EncodedFileOutput({
        fileType: EncodedFileType.OGG,
        filepath,
        output: {
          case: 's3',
          value: new S3Upload({
            accessKey: storage.accessKeyId,
            secret: storage.secretAccessKey,
            region: storage.region,
            endpoint: storage.endpoint,
            bucket: storage.bucket,
            forcePathStyle: storage.forcePathStyle,
          }),
        },
      });
      const info = await egress.startRoomCompositeEgress(`cs-${sessionId}`, { file: output }, { audioOnly: true });
      await db.update(classSessions)
        .set({ egressId: info.egressId, recordingStatus: 'pending' })
        .where(eq(classSessions.id, sessionId));
    } catch (e) {
      console.error(`startRecording: failed for session ${sessionId}`, e);
      await db.update(classSessions)
        .set({ recordingStatus: 'failed' })
        .where(eq(classSessions.id, sessionId));
    } finally {
      this.starting.delete(sessionId);
    }
  }

  async stopRecording(sessionId: string): Promise<void> {
    try {
      const lk = this.livekitConfig();
      if (!lk) return;
      const row = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sessionId) });
      if (!row?.egressId) return;
      const httpUrl = lk.url.replace(/^ws/, 'http');
      const egress = new EgressClient(httpUrl, lk.apiKey, lk.apiSecret);
      // Room yopilganda Egress o'zi yakunlanishi mumkin. Complete bo'lgan
      // jobga StopEgress yuborish failed_precondition qaytaradi; avval
      // holatni o'qib, mavjud yakuniy natijani saqlaymiz.
      const existing = await egress.listEgress({ egressId: row.egressId });
      if (existing[0] && await this.persistEgressResult(sessionId, existing[0])) return;

      let info = await egress.stopEgress(row.egressId);
      if (await this.persistEgressResult(sessionId, info)) return;

      // StopEgress ko'pincha EGRESS_ENDING holatini qaytaradi. Webhook
      // kechiksa yoki noto'g'ri sozlangan bo'lsa ham replay pending bo'lib
      // qolmasligi uchun yakuniy natijani qisqa muddat poll qilamiz.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const items = await egress.listEgress({ egressId: row.egressId });
        if (!items[0]) continue;
        info = items[0];
        if (await this.persistEgressResult(sessionId, info)) return;
      }
      console.error(`stopRecording: egress yakuniy natija bermadi (${sessionId}, ${row.egressId})`);
    } catch (e) {
      console.error(`stopRecording: failed for session ${sessionId}`, e);
      await db.update(classSessions)
        .set({ recordingStatus: 'failed' })
        .where(eq(classSessions.id, sessionId));
    }
  }

  async refreshRecording(sessionId: string): Promise<void> {
    try {
      const lk = this.livekitConfig();
      if (!lk) return;
      const row = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sessionId) });
      if (!row?.egressId || (row.recordingStatus !== 'pending' && row.recordingStatus !== 'failed')) return;

      const egress = new EgressClient(lk.url.replace(/^ws/, 'http'), lk.apiKey, lk.apiSecret);
      const items = await egress.listEgress({ egressId: row.egressId });
      if (items[0]) await this.persistEgressResult(sessionId, items[0]);
    } catch (e) {
      console.error(`refreshRecording: failed for session ${sessionId}`, e);
    }
  }
}
