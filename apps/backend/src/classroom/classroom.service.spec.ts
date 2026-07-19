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
      courses: { findFirst: jest.fn() },
      groups: { findFirst: jest.fn(), findMany: jest.fn() },
      classSessions: { findFirst: jest.fn().mockResolvedValue(undefined), findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn(), findFirst: jest.fn() },
      attendanceRecords: { findFirst: jest.fn() },
      mediaAssets: { findFirst: jest.fn() },
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
  mockedDb.query.courses.findFirst.mockResolvedValue({
    id: 'c-1', title: 'Kurs A', adminId: 'teacher-1',
  });
  mockedDb.query.groups.findMany.mockResolvedValue([{ id: 'g-1', courseId: 'c-1' }]);
  mockedDb.query.classSessions.findFirst.mockResolvedValue(undefined);
  mockedDb.query.groupEnrollments.findMany.mockResolvedValue([
    enrollmentRow('e-1', 'stu-1', 'Ali'),
    enrollmentRow('e-2', 'stu-2', 'Vali'),
  ]);
}

function makeFakeMediaLibrary(overrides: Partial<{ pages: string[]; status: string }> = {}) {
  return {
    getPdfPages: jest.fn().mockResolvedValue({ pages: overrides.pages ?? [], status: overrides.status ?? 'ready' }),
  };
}

async function setup(mediaLibrary = makeFakeMediaLibrary()) {
  const service = new ClassroomService(
    { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}` } as any,
    { get: () => undefined } as any,
    mediaLibrary as any,
  );
  const { b, events } = makeFakeBroadcaster();
  service.setBroadcaster(b);
  setupDbForCreate();
  const { id } = await service.createSession('c-1', 'teacher-1', 'teacher');
  return { service, events, sessionId: id, mediaLibrary };
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
    const service = new ClassroomService({} as any, { get: () => undefined } as any, makeFakeMediaLibrary() as any);
    setupDbForCreate();
    await expect(service.createSession('c-1', 'boshqa-teacher', 'teacher')).rejects.toThrow();
  });

  it('bitta kursda ikkinchi aktiv sessiya ochilmaydi', async () => {
    const { service } = await setup();
    setupDbForCreate();
    await expect(service.createSession('c-1', 'teacher-1', 'teacher')).rejects.toThrow();
  });

  it('ustoz classroom mavzusini barcha oquvchilarga yuboradi va snapshotda saqlaydi', async () => {
    const { service, events, sessionId } = await setup();
    service.setTheme(sessionId, 'teacher-1', 'dark');

    expect(events.at(-1)).toEqual({
      target: `room:${sessionId}`,
      event: 'theme:set',
      payload: { theme: 'dark' },
    });
    expect(service.hostJoin(sessionId, 'teacher-1', 'sock-h').classroomTheme).toBe('dark');
    expect(() => service.setTheme(sessionId, 'stu-1', 'light')).toThrow('FORBIDDEN');
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

describe('attachPdfFromLibrary', () => {
  it('tanlangan sahifalarni jonli darsga qoshadi va pdf:set broadcast qiladi', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1', 'p2', 'p3', 'p4'], status: 'ready' });
    const { service, events, sessionId } = await setup(mediaLibrary);
    mockedDb.query.mediaAssets.findFirst.mockResolvedValue({ id: 'asset-1', originalName: 'dars.pdf' });

    const result = await service.attachPdfFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [1, 3]);

    expect(result).toEqual({ pdfName: 'dars.pdf', pages: ['p1', 'p3'] });
    expect(mediaLibrary.getPdfPages).toHaveBeenCalledWith('asset-1', 'teacher-1', 'teacher');
    expect(events.at(-1)).toMatchObject({
      event: 'pdf:set',
      payload: { pdfName: 'dars.pdf', pages: ['p1', 'p3'], currentPage: 1 },
    });
  });

  it('takrorlangan va tartibsiz sahifa raqamlarini normallashtiradi', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1', 'p2', 'p3'], status: 'ready' });
    const { service, sessionId } = await setup(mediaLibrary);
    mockedDb.query.mediaAssets.findFirst.mockResolvedValue({ id: 'asset-1', originalName: 'dars.pdf' });

    const result = await service.attachPdfFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [3, 1, 3, 1]);

    expect(result.pages).toEqual(['p1', 'p3']);
  });

  it('begona ustoz uchun taqiqlanadi', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1'], status: 'ready' });
    const { service, sessionId } = await setup(mediaLibrary);
    await expect(
      service.attachPdfFromLibrary(sessionId, 'boshqa-teacher', 'teacher', 'asset-1', [1]),
    ).rejects.toThrow();
  });

  it('PDF hali tayyor bolmasa rad etadi', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: [], status: 'processing' });
    const { service, sessionId } = await setup(mediaLibrary);
    await expect(
      service.attachPdfFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [1]),
    ).rejects.toThrow('hali tayyor emas');
  });

  it("mavjud bolmagan sahifa raqamini rad etadi", async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1', 'p2'], status: 'ready' });
    const { service, sessionId } = await setup(mediaLibrary);
    await expect(
      service.attachPdfFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [5]),
    ).rejects.toThrow();
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

  it('stroke qoshilganda historyEvents ga type/payload/atMs bilan yoziladi (isFree=false)', async () => {
    const { service, sessionId } = await withPdf();
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };
    service.stroke(sessionId, 'teacher-1', 1, stroke);
    const history = service.getHistoryEventsForTests(sessionId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      type: 'stroke:add',
      payload: { page: 1, stroke },
    });
    expect(typeof history[0].atMs).toBe('number');
    expect(history[0].atMs).toBeGreaterThanOrEqual(0);
  });

  it('qisqa text stroke broadcast qilinadi va keyingi snapshotda saqlanadi', async () => {
    const { service, events, sessionId } = await withPdf();
    const stroke = {
      id: 'text-1', tool: 'text' as const, color: '#ef4444', width: 4,
      points: [0.25, 0.2], text: 'Salom', fontFamily: 'Inter' as const,
      fontSize: 24, fontWeight: 600 as const, textAlign: 'left' as const,
      textBoxWidth: 80, textBoxHeight: 40,
    };

    service.stroke(sessionId, 'teacher-1', 1, stroke);

    expect(events.at(-1)).toMatchObject({ event: 'stroke:add', payload: { page: 1, stroke } });
    const refreshed = service.hostJoin(sessionId, 'teacher-1', 'sock-refreshed');
    expect(refreshed.strokesByPage[1]).toContainEqual(stroke);
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

describe('scroll (sahifa-nisbiy scroll sinxronizatsiyasi)', () => {
  async function withPdf() {
    const ctx = await setup();
    ctx.service.setPdfForTests(ctx.sessionId, 'dars.pdf', ['u1', 'u2', 'u3']);
    return ctx;
  }

  it('host scroll qilsa scroll:set broadcast va session holatiga saqlanadi', async () => {
    const { service, events, sessionId } = await withPdf();
    service.scroll(sessionId, 'teacher-1', 2, 0.42);
    expect(events.at(-1)).toMatchObject({ event: 'scroll:set', payload: { page: 2, yRatio: 0.42 } });

    // Kech kirgan o'quvchi snapshot orqali shu pozitsiyani darhol oladi
    const snap = await service.studentJoin(sessionId, 'stu-1', 'sock-1');
    expect(snap.scroll).toEqual({ page: 2, yRatio: 0.42, xRatio: 0 });
  });

  it('yRatio 0..1 oralig\'iga clamp qilinadi', async () => {
    const { service, events, sessionId } = await withPdf();
    service.scroll(sessionId, 'teacher-1', 1, 1.5);
    expect(events.at(-1)).toMatchObject({ payload: { page: 1, yRatio: 1 } });
    service.scroll(sessionId, 'teacher-1', 1, -0.5);
    expect(events.at(-1)).toMatchObject({ payload: { page: 1, yRatio: 0 } });
  });

  it("mavjud bo'lmagan sahifaga scroll rad etiladi", async () => {
    const { service, sessionId } = await withPdf();
    expect(() => service.scroll(sessionId, 'teacher-1', 99, 0.5)).toThrow('INVALID_PAGE');
  });

  it('host bolmagan foydalanuvchi scroll yubora olmaydi', async () => {
    const { service, sessionId } = await withPdf();
    expect(() => service.scroll(sessionId, 'stu-1', 1, 0.5)).toThrow();
  });

  it('yangi PDF biriktirilganda eski scroll pozitsiyasi tozalanadi', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1', 'p2'], status: 'ready' });
    const { service, sessionId } = await setup(mediaLibrary);
    service.setPdfForTests(sessionId, 'dars.pdf', ['u1', 'u2']);
    service.scroll(sessionId, 'teacher-1', 1, 0.7);

    mockedDb.query.mediaAssets.findFirst.mockResolvedValue({ id: 'asset-1', originalName: 'dars2.pdf' });
    await service.attachPdfFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [1]);

    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-h');
    expect(snap.scroll).toBeNull();
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

describe('erkin (guruhsiz) dars', () => {
  function makeFreeService() {
    const service = new ClassroomService(
      { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}` } as any,
      { get: () => undefined } as any,
      makeFakeMediaLibrary() as any,
    );
    const { b, events } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    return { service, events };
  }

  it('kurs/DB yozuvisiz sessiya yaratadi', () => {
    const { service } = makeFreeService();
    const { id } = service.createFreeSession('teacher-1');
    expect(id).toBeTruthy();
    expect(mockedDb.insert).not.toHaveBeenCalled();
    const snap = service.hostJoin(id, 'teacher-1', 'sock-h');
    expect(snap.isFree).toBe(true);
  });

  it('erkin (isFree) sessiyada historyEvents umuman yozilmaydi', () => {
    const { service } = makeFreeService();
    const { id } = service.createFreeSession('teacher-1');
    service.setBoardView(id, 'teacher-1', 'single', 'notebook', 'notebook');
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };
    service.stroke(id, 'teacher-1', 1, stroke, 'notebook', 'left');
    expect(service.getHistoryEventsForTests(id)).toHaveLength(0);
  });

  it('split rejimida ikkala panelga bir xil kontent qoyishni rad etadi', () => {
    const { service } = makeFreeService();
    const { id } = service.createFreeSession('teacher-1');
    expect(() => service.setBoardView(id, 'teacher-1', 'split', 'pdf', 'pdf'))
      .toThrow('DUPLICATE_SPLIT_MODE');
    expect(() => service.setBoardView(id, 'teacher-1', 'split', 'notebook', 'notebook'))
      .toThrow('DUPLICATE_SPLIT_MODE');
  });

  it('panellarni almashtirganda (swap) chizmalar mode bilan birga qoladi, pane bilan emas', () => {
    const { service } = makeFreeService();
    const { id } = service.createFreeSession('teacher-1');
    service.setBoardView(id, 'teacher-1', 'split', 'notebook', 'pdf');
    const noteStroke = { id: 'n1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };
    // Daftar hozir CHAPDA (leftMode='notebook') — shu tarafga chiziladi.
    service.stroke(id, 'teacher-1', 1, noteStroke, 'notebook', 'left');

    // Panellarni almashtiramiz: daftar endi O'NGGA o'tadi.
    service.setBoardView(id, 'teacher-1', 'split', 'pdf', 'notebook');
    const afterSwap = service.hostJoin(id, 'teacher-1', 'sock-swap');
    // Chizma endi rightStrokesByPage'da ko'rinishi kerak (chunki notebook
    // endi o'ng panelda), avvalgi (endi bo'sh) chap emas.
    expect(afterSwap.rightStrokesByPage[1]).toContainEqual(noteStroke);
    expect(afterSwap.strokesByPage[1] ?? []).not.toContainEqual(noteStroke);
  });

  it('anonim mehmon enrollmentsiz, guestName bilan kira oladi va DB ga yozilmaydi', async () => {
    const { service, events } = makeFreeService();
    const { id } = service.createFreeSession('teacher-1');
    const snap = await service.studentJoin(id, 'guest:abc123', 'sock-1', 'Anvar');
    expect(snap.participants).toEqual([
      { userId: 'guest:abc123', name: 'Anvar', online: true, status: expect.any(String) },
    ]);
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedDb.update).not.toHaveBeenCalled();
    expect(events.some((e) => e.event === 'presence:update')).toBe(true);
  });

  it('login qilgan foydalanuvchi ozining haqiqiy ismi bilan koradi, guestName etiborsiz qoldiriladi', async () => {
    const { service } = makeFreeService();
    const { id } = service.createFreeSession('teacher-1');
    const snap = await service.studentJoin(id, 'stu-1', 'sock-1', 'Boshqa ism', 'Haqiqiy Ism');
    expect(snap.participants[0]).toMatchObject({ userId: 'stu-1', name: 'Haqiqiy Ism' });
  });

  it('uzilganda ham davomat DB ga yozilmaydi', async () => {
    const { service } = makeFreeService();
    const { id } = service.createFreeSession('teacher-1');
    await service.studentJoin(id, 'guest:abc', 'sock-1', 'Mehmon');
    await service.handleDisconnect('sock-1');
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('endSession chaqirilganda ham classSessions jadvaliga yozilmaydi va xotiradan ochiriladi', async () => {
    const { service, events } = makeFreeService();
    const { id } = service.createFreeSession('teacher-1');
    await service.endSession(id, 'teacher-1');
    expect(mockedDb.update).not.toHaveBeenCalled();
    expect(events.some((e) => e.event === 'session:ended')).toBe(true);
    expect(() => service.hostJoin(id, 'teacher-1', 'sock-h')).toThrow();
  });

  it("erkin bolmagan (oddiy) sessiyada guestId bilan kirish NOT_ENROLLED bilan rad etiladi", async () => {
    const { service, sessionId } = await setup();
    await expect(service.studentJoin(sessionId, 'guest:xyz', 'sock-1', 'Notanish')).rejects.toThrow('NOT_ENROLLED');
  });
});
