import { ClassroomService } from './classroom.service';
import { ClassroomBroadcaster } from './classroom.types';
import { HOST_GRACE_MS } from './classroom.logic';
import { db } from '../db';

// db ga tegmaslik uchun to'liq mock
jest.mock('../db', () => ({
  db: {
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: async () => [{ id: 'cs-row-1' }],
        onConflictDoNothing: async () => {},
      })),
    })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: async () => {} })) })),
    query: {
      groups: { findFirst: jest.fn() },
      classSessions: { findFirst: jest.fn().mockResolvedValue(undefined), findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn(), findFirst: jest.fn() },
      attendanceRecords: { findFirst: jest.fn() },
    },
  },
}));

const mockedDb = db as any;

function makeFakeBroadcaster() {
  const events: Array<{ target: string; event: string; payload: any }> = [];
  const b: ClassroomBroadcaster = {
    toRoom: (sessionId, event, payload) => events.push({ target: `room:${sessionId}`, event, payload }),
    toSocket: (sid, event, payload) => events.push({ target: `sock:${sid}`, event, payload }),
  };
  return { b, events };
}

function enrollmentRow(enrollmentId: string, userId: string, name: string) {
  return {
    id: enrollmentId,
    schoolMember: { studentId: userId, student: { id: userId, displayName: name } },
  };
}

function setupDbForCreate() {
  mockedDb.query.groups.findFirst.mockResolvedValue({
    id: 'g-1', name: 'Guruh A', course: { adminId: 'teacher-1' },
  });
  mockedDb.query.classSessions.findFirst.mockResolvedValue(undefined);
  mockedDb.query.groupEnrollments.findMany.mockResolvedValue([
    enrollmentRow('e-1', 'stu-1', 'Ali'),
    enrollmentRow('e-2', 'stu-2', 'Vali'),
  ]);
}

async function setup() {
  const service = new ClassroomService(
    { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}` } as any,
    { get: () => undefined } as any,
  );
  const { b, events } = makeFakeBroadcaster();
  service.setBroadcaster(b);
  setupDbForCreate();
  const { id } = await service.createSession('g-1', 'teacher-1', 'teacher');
  return { service, events, sessionId: id };
}

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('createSession', () => {
  it('sessiya yaratadi va enrollmentlarni absent qilib yozadi', async () => {
    const { service, sessionId } = await setup();
    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-h');
    expect(snap.participants).toEqual([
      { userId: 'stu-1', name: 'Ali', online: false, status: 'absent' },
      { userId: 'stu-2', name: 'Vali', online: false, status: 'absent' },
    ]);
    expect(snap.hostOnline).toBe(true);
  });

  it('begona ustoz uchun taqiqlanadi', async () => {
    const service = new ClassroomService({} as any, { get: () => undefined } as any);
    setupDbForCreate();
    await expect(service.createSession('g-1', 'boshqa-teacher', 'teacher')).rejects.toThrow();
  });

  it('bitta guruhda ikkinchi aktiv sessiya ochilmaydi', async () => {
    const { service } = await setup();
    setupDbForCreate();
    await expect(service.createSession('g-1', 'teacher-1', 'teacher')).rejects.toThrow();
  });
});

describe('studentJoin / davomat', () => {
  it('oz vaqtida kirgan oquvchi present boladi va presence broadcast ketadi', async () => {
    const { service, events, sessionId } = await setup();
    const snap = await service.studentJoin(sessionId, 'stu-1', 'sock-1');
    expect(snap.sessionId).toBe(sessionId);
    const presence = events.filter((e) => e.event === 'presence:update');
    expect(presence.length).toBeGreaterThan(0);
    const me = presence.at(-1)!.payload.participants.find((p: any) => p.userId === 'stu-1');
    expect(me.online).toBe(true);
    expect(me.status).toBe('present');
  });

  it('10 daqiqadan kech kirgan oquvchi late boladi', async () => {
    jest.useFakeTimers();
    const { service, sessionId } = await setup();
    jest.setSystemTime(Date.now() + 11 * 60 * 1000);
    await service.studentJoin(sessionId, 'stu-2', 'sock-2');
    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-h');
    expect(snap.participants.find((p) => p.userId === 'stu-2')!.status).toBe('late');
  });

  it('royxatda yoq va enrollmentsiz foydalanuvchi kira olmaydi', async () => {
    const { service, sessionId } = await setup();
    mockedDb.query.groupEnrollments.findMany.mockResolvedValue([]);
    await expect(service.studentJoin(sessionId, 'begona', 'sock-x')).rejects.toThrow('NOT_ENROLLED');
  });
});

describe('sahifa va chizish', () => {
  async function withPdf() {
    const ctx = await setup();
    ctx.service.setPdfForTests(ctx.sessionId, 'dars.pdf', ['u1', 'u2', 'u3']);
    return ctx;
  }

  it('host sahifa ozgartirsa page:set broadcast', async () => {
    const { service, events, sessionId } = await withPdf();
    service.setPage(sessionId, 'teacher-1', 2);
    expect(events.at(-1)).toMatchObject({ event: 'page:set', payload: { page: 2 } });
  });

  it('host bolmagan foydalanuvchi sahifa ozgartira olmaydi', async () => {
    const { service, sessionId } = await withPdf();
    expect(() => service.setPage(sessionId, 'stu-1', 2)).toThrow();
  });

  it('stroke qoshilsa stroke:add broadcast', async () => {
    const { service, events, sessionId } = await withPdf();
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };
    service.stroke(sessionId, 'teacher-1', 1, stroke);
    expect(events.at(-1)).toMatchObject({ event: 'stroke:add', payload: { page: 1, stroke } });
  });

  it('notogri stroke rad etiladi', async () => {
    const { service, sessionId } = await withPdf();
    const bad = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [5, 5] };
    expect(() => service.stroke(sessionId, 'teacher-1', 1, bad)).toThrow();
  });

  it('undo va clear broadcastlari', async () => {
    const { service, events, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1] });
    service.undo(sessionId, 'teacher-1', 1);
    expect(events.at(-1)).toMatchObject({ event: 'stroke:undo', payload: { page: 1, strokeId: 's1' } });
    service.clearPage(sessionId, 'teacher-1', 1);
    expect(events.at(-1)).toMatchObject({ event: 'page:clear', payload: { page: 1 } });
  });
});

describe('disconnect va yakunlash', () => {
  it('oquvchi uzilsa presence:update va interval yopiladi', async () => {
    const { service, events, sessionId } = await setup();
    await service.studentJoin(sessionId, 'stu-1', 'sock-1');
    await service.handleDisconnect('sock-1');
    const last = events.at(-1)!;
    expect(last.event).toBe('presence:update');
    expect(last.payload.participants.find((p: any) => p.userId === 'stu-1').online).toBe(false);
  });

  it('host uzilib grace dan keyin sessiya avtomatik tugaydi', async () => {
    jest.useFakeTimers();
    const { service, events, sessionId } = await setup();
    service.hostJoin(sessionId, 'teacher-1', 'sock-h');
    await service.handleDisconnect('sock-h');
    expect(events.some((e) => e.event === 'host:offline')).toBe(true);
    jest.advanceTimersByTime(HOST_GRACE_MS + 1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(events.some((e) => e.event === 'session:ended')).toBe(true);
  });

  it('host qaytsa grace timer bekor bolib dars davom etadi', async () => {
    jest.useFakeTimers();
    const { service, events, sessionId } = await setup();
    service.hostJoin(sessionId, 'teacher-1', 'sock-h');
    await service.handleDisconnect('sock-h');
    service.hostJoin(sessionId, 'teacher-1', 'sock-h2');
    jest.advanceTimersByTime(HOST_GRACE_MS + 1000);
    await Promise.resolve();
    expect(events.some((e) => e.event === 'session:ended')).toBe(false);
  });

  it('endSession barcha ochiq intervallarni yopadi va session:ended yuboradi', async () => {
    const { service, events, sessionId } = await setup();
    await service.studentJoin(sessionId, 'stu-1', 'sock-1');
    await service.endSession(sessionId, 'teacher-1');
    expect(events.at(-1)!.event).toBe('session:ended');
    // sessiya xotiradan ochirilgan
    expect(() => service.hostJoin(sessionId, 'teacher-1', 'sock-h')).toThrow();
  });
});

describe('voiceToken', () => {
  it('LiveKit sozlanmagan bolsa VOICE_DISABLED xatosi', async () => {
    const { service, sessionId } = await setup();
    await expect(service.voiceToken(sessionId, 'teacher-1', 'Ustoz')).rejects.toThrow('VOICE_DISABLED');
  });
});
