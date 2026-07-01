import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { db } from '../db';

jest.mock('../db', () => ({
  db: {
    query: {
      users: { findFirst: jest.fn() },
      authCodes: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

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
      email: 'student@example.com',
      name: 'Student One',
      codeHash: 'hashed-code',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    };
    (db.query.authCodes.findFirst as jest.Mock).mockResolvedValue(authCode);
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);
    mockInsertReturning({
      id: 'user-1',
      email: 'student@example.com',
      name: 'Student One',
      role: 'student',
      phone: '+998901112233',
    });
    mockUpdate();

    const service = new AuthService(jwtService as any, telegramService as any);

    const result = await (service as any).verifyRegistration('+998 90 111 22 33', '123456');

    expect(result.user.role).toBe('student');
    expect(db.insert).toHaveBeenCalled();
    expect(telegramService.sendCredentialsToPhone).toHaveBeenCalledWith(
      '+998901112233',
      'student@example.com',
      expect.any(String),
    );
  });

  it('rejects a reset code after it has been used once', async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
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

    const service = new AuthService(jwtService as any, telegramService as any);

    await expect((service as any).verifyPasswordReset('student@example.com', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
