import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressClient, EncodedFileOutput, S3Upload, EncodedFileType } from 'livekit-server-sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { classSessions } from '../db/schema';

interface LiveKitConfig { url: string; apiKey: string; apiSecret: string }
interface StorageConfig {
  bucket: string; region: string; endpoint: string;
  accessKeyId: string; secretAccessKey: string; publicBaseUrl: string;
}

// LiveKit Egress orqali dars ovozini yozib olish — MUHIM: bu xizmatning
// hech qanday chaqiruvi jonli darsni to'xtatishi yoki sekinlashtirishi
// mumkin emas. Har bir metod o'z ichida xatolarni ushlaydi, hech narsa
// yuqoriga otilmaydi — faqat console.error orqali log yoziladi.
@Injectable()
export class ClassroomRecordingService {
  constructor(private readonly config: ConfigService) {}

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
    };
  }

  async startRecording(sessionId: string): Promise<void> {
    try {
      const lk = this.livekitConfig();
      const storage = this.storageConfig();
      if (!lk || !storage) return;

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
          }),
        },
      });
      const info = await egress.startRoomCompositeEgress(`cs-${sessionId}`, { file: output }, { audioOnly: true });
      await db.update(classSessions)
        .set({ egressId: info.egressId, recordingStatus: 'pending' })
        .where(eq(classSessions.id, sessionId));
    } catch (e) {
      console.error(`startRecording: failed for session ${sessionId}`, e);
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
      await egress.stopEgress(row.egressId);
    } catch (e) {
      console.error(`stopRecording: failed for session ${sessionId}`, e);
    }
  }
}
