import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      users: { findFirst: jest.fn() },
      authCodes: { findFirst: jest.fn(), findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    // Test doubles don't run real transactions — just invoke the callback
    // with the same mock db as the `tx` handle, like a no-op passthrough.
    transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(mockDb)),
  };
  return { db: mockDb };
});

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService telegram auth', () => {
  const jwtService = { sign: jest.fn(() => 'signed-token') };
  const telegramService = {
    normalizePhone: jest.fn((phone: string) => phone.replace(/\s+/g, '')),
    sendCodeToPhone: jest.fn(),
    sendCredentialsToPhone: jest.fn(),
  };
  const storageService = { deleteFile: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-value');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  function mockInsertReturning(value: unknown) {
    const returning = jest.fn().mockResolvedValue([value]);
    const values = jest.fn(() => ({ returning }));
    (db.insert as jest.Mock).mockReturnValue({ values });
    return { values, returning };
  }

  function mockUpdate() {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where }));
    (db.update as jest.Mock).mockReturnValue({ set });
    return { set, where };
  }

  it('creates a student account after verifying a Telegram registration code', async () => {
    const authCode = {
      id: 'code-1',
      phone: '+998901112233',
      name: 'Student One',
      codeHash: 'hashed-code',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    };
    (db.query.authCodes.findMany as jest.Mock).mockResolvedValue([authCode]);
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);
    mockInsertReturning({
      id: 'user-1',
      name: 'Student One',
      displayName: 'Student One',
      role: 'student',
      phone: '+998901112233',
    });
    mockUpdate();

    const service = new AuthService(jwtService as any, telegramService as any, storageService as any);

    const result = await (service as any).verifyRegistration('123456');

    expect(result.user.role).toBe('student');
    expect(db.insert).toHaveBeenCalled();
    expect(telegramService.sendCredentialsToPhone).toHaveBeenCalledWith('+998901112233', expect.any(String));
  });

  it('rejects a reset code after it has been used once', async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1',
      phone: '+998901112233',
    });
    (db.query.authCodes.findFirst as jest.Mock).mockResolvedValue({
      id: 'code-1',
      phone: '+998901112233',
      purpose: 'reset',
      codeHash: 'hashed-code',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    });

    const service = new AuthService(jwtService as any, telegramService as any, storageService as any);

    await expect((service as any).verifyPasswordReset('+998901112233', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('logs in a Telegram user with a one-time code', async () => {
    (db.query.authCodes.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'code-1',
        phone: '+998901112233',
        purpose: 'login',
        codeHash: 'hashed-code',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      },
    ]);
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1',
      name: 'Student One',
      displayName: 'Student One',
      avatarUrl: null,
      displayAvatarUrl: null,
      role: 'student',
      phone: '+998901112233',
    });
    mockUpdate();

    const service = new AuthService(jwtService as any, telegramService as any, storageService as any);

    const result = await service.verifyTelegramCode('123456');

    expect(result.access_token).toBe('signed-token');
    expect(result.user.phone).toBe('+998901112233');
  });
});
