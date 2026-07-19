import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClassroomRecordingController } from './classroom-recording.controller';
import { db } from '../db';

jest.mock('../db', () => ({
  db: { update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })) },
}));

describe('ClassroomRecordingController', () => {
  async function makeController(env: Record<string, string> = {}) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClassroomRecordingController],
      providers: [{ provide: ConfigService, useValue: { get: (key: string) => env[key] } }],
    }).compile();
    return moduleRef.get(ClassroomRecordingController);
  }

  it('LiveKit sozlanmagan bolsa webhook 200 qaytaradi lekin hech narsa yozmaydi', async () => {
    const controller = await makeController({});
    const res = await controller.handleWebhook(Buffer.from('{}'), '');
    expect(res).toEqual({ ok: true });
    expect(db.update).not.toHaveBeenCalled();
  });
});
