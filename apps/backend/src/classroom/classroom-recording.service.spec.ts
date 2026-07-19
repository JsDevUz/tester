import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClassroomRecordingService } from './classroom-recording.service';
import { db } from '../db';

jest.mock('../db', () => ({
  db: { update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })) },
}));

describe('ClassroomRecordingService', () => {
  async function makeService(env: Record<string, string> = {}) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClassroomRecordingService,
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      ],
    }).compile();
    return moduleRef.get(ClassroomRecordingService);
  }

  it('LiveKit sozlanmagan bolsa startRecording xato otmasdan tinch qaytadi', async () => {
    const service = await makeService({});
    await expect(service.startRecording('session-1')).resolves.toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('LiveKit sozlanmagan bolsa stopRecording xato otmasdan tinch qaytadi', async () => {
    const service = await makeService({});
    await expect(service.stopRecording('session-1')).resolves.toBeUndefined();
  });

  it('object storage sozlanmagan bolsa ham startRecording xato otmaydi', async () => {
    const service = await makeService({
      LIVEKIT_URL: 'wss://example.livekit.cloud',
      LIVEKIT_API_KEY: 'key',
      LIVEKIT_API_SECRET: 'secret',
      // OBJECT_STORAGE_* atayin berilmagan
    });
    await expect(service.startRecording('session-1')).resolves.toBeUndefined();
  });
});
