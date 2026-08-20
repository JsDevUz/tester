import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClassroomRecordingService } from './classroom-recording.service';
import { db } from '../db';

jest.mock('../db', () => ({
  db: {
    update: jest.fn(() => ({
      set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
    })),
    query: {
      classSessions: {
        findFirst: jest.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

const startRoomCompositeEgressMock = jest.fn();
jest.mock('livekit-server-sdk', () => ({
  ...jest.requireActual('livekit-server-sdk'),
  EgressClient: jest.fn().mockImplementation(() => ({
    startRoomCompositeEgress: startRoomCompositeEgressMock,
  })),
}));

describe('ClassroomRecordingService', () => {
  async function makeService(env: Record<string, string> = {}) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClassroomRecordingService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    }).compile();
    return moduleRef.get(ClassroomRecordingService);
  }

  // Misconfiguration must not throw, but it must not pass silently either: the teacher
  // pressed Record, and without a status the UI has nothing to report and a later stop finds
  // no recording to finish.
  it('LiveKit sozlanmagan bolsa startRecording yozuvni failed deb belgilaydi', async () => {
    const service = await makeService({});
    const setMock = jest.fn((_arg: Record<string, unknown>) => ({
      where: jest.fn().mockResolvedValue(undefined),
    }));
    (db.update as jest.Mock).mockReturnValue({ set: setMock });

    await expect(service.startRecording('session-1')).resolves.toBeUndefined();

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ recordingStatus: 'failed' }),
    );
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

  it('startRecording muvaffaqiyatli bolganda recordingStartedAtMs sessiya boshlanishidan hisoblab yoziladi', async () => {
    startRoomCompositeEgressMock.mockClear();
    (db.update as jest.Mock).mockClear();
    (db.query.classSessions.findFirst as jest.Mock).mockResolvedValue({
      id: 'session-1',
      egressId: null,
      recordingStatus: 'none',
    });
    startRoomCompositeEgressMock.mockResolvedValue({ egressId: 'EG_test123' });
    const service = await makeService({
      LIVEKIT_URL: 'wss://example.livekit.cloud',
      LIVEKIT_API_KEY: 'key',
      LIVEKIT_API_SECRET: 'secret',
      OBJECT_STORAGE_BUCKET_NAME: 'bucket',
      OBJECT_STORAGE_ACCESS_KEY_ID: 'access',
      OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-key',
      OBJECT_STORAGE_ENDPOINT: 's3.example.com',
    });

    const startedAtMs = Date.now() - 3000; // sessiya 3 soniya oldin boshlangan
    const setMock = jest.fn((_arg: Record<string, unknown>) => ({
      where: jest.fn().mockResolvedValue(undefined),
    }));
    (db.update as jest.Mock).mockReturnValue({ set: setMock });

    await service.startRecording('session-1', startedAtMs);

    expect(setMock).toHaveBeenCalledTimes(1);
    const setArg = setMock.mock.calls[0]?.[0];
    expect(setArg?.egressId).toBe('EG_test123');
    expect(setArg?.recordingStatus).toBe('pending');
    expect(typeof setArg?.recordingStartedAtMs).toBe('number');
    // Egress chaqiruvi startedAtMs'dan keyin sodir bo'lgani uchun >= 3000
    // bo'lishi kerak (haqiqiy testda oraliq millisekundlar ham qo'shiladi).
    expect(setArg?.recordingStartedAtMs).toBeGreaterThanOrEqual(3000);
  });

  // A session can hold several recordings (a retry, or a second take). Attaching a finished
  // file to the wrong one loses that audio, so the match has to go through egressId.
  describe('persistEgressResult ni to\'g\'ri yozuvga bog\'lash', () => {
    async function runPersist(
      recordings: Array<Record<string, unknown>>,
      info: Record<string, unknown>,
      expectedEgressId?: string,
    ) {
      const service = await makeService({
        LIVEKIT_URL: 'wss://livekit.example.com',
        LIVEKIT_API_KEY: 'key',
        LIVEKIT_API_SECRET: 'secret',
        OBJECT_STORAGE_BUCKET: 'bucket',
        OBJECT_STORAGE_ACCESS_KEY_ID: 'id',
        OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret',
        OBJECT_STORAGE_REGION: 'auto',
        OBJECT_STORAGE_ENDPOINT: 's3.example.com',
      });
      (db.query.classSessions.findFirst as jest.Mock).mockResolvedValue({
        id: 'session-1',
        recordings,
      });
      const setMock = jest.fn((_arg: Record<string, unknown>) => ({
        where: jest.fn().mockResolvedValue(undefined),
      }));
      (db.update as jest.Mock).mockReturnValue({ set: setMock });

      await (service as any).persistEgressResult('session-1', info, expectedEgressId);
      return setMock.mock.calls[0]?.[0] as Record<string, any> | undefined;
    }

    it('faqat egressId mos kelgan yozuvni yangilaydi', async () => {
      const arg = await runPersist(
        [
          { egressId: 'EG_first', recordingStatus: 'pending' },
          { egressId: 'EG_second', recordingStatus: 'pending' },
        ],
        {
          status: 3,
          egressId: 'EG_second',
          fileResults: [{ location: 'classroom-recordings/a.mp4' }],
        },
      );

      const updated = arg?.recordings as Array<Record<string, unknown>>;
      expect(updated[0].recordingStatus).toBe('pending');
      expect(updated[1].recordingStatus).toBe('ready');
    });

    it('id nomalum bolsa va bir nechta pending bolsa hech birini tegmaydi', async () => {
      const arg = await runPersist(
        [
          { egressId: 'EG_first', recordingStatus: 'pending' },
          { egressId: 'EG_second', recordingStatus: 'pending' },
        ],
        { status: 3, fileResults: [{ location: 'classroom-recordings/a.mp4' }] },
      );

      const updated = arg?.recordings as Array<Record<string, unknown>>;
      expect(updated.every((r) => r.recordingStatus === 'pending')).toBe(true);
    });

    it('id nomalum bolsa lekin bitta pending bolsa oshani yangilaydi', async () => {
      const arg = await runPersist(
        [
          { egressId: 'EG_first', recordingStatus: 'ready', recordingUrl: 'x' },
          { egressId: 'EG_second', recordingStatus: 'pending' },
        ],
        { status: 3, fileResults: [{ location: 'classroom-recordings/a.mp4' }] },
      );

      const updated = arg?.recordings as Array<Record<string, unknown>>;
      expect(updated[1].recordingStatus).toBe('ready');
    });
  });
});
