import { ClassroomService } from './classroom.service';
import { ClassroomBroadcaster } from './classroom.types';
import { HOST_GRACE_MS } from './classroom.logic';
import { db } from '../db';
import { classSessions, contentBlocks, freeSessionParticipants } from '../db/schema';

// myClassSessions ikkita zanjirni chaqiradi: guruhli so'rov
// (.from().innerJoin().innerJoin().innerJoin().where()) va erkin so'rov
// (.from().innerJoin().where()). Har bir innerJoin() qaytargan obyekt ham
// innerJoin, ham where metodiga ega — shu bilan ikkala zanjir uzunligi ham
// bitta mock shakli bilan qo'llab-quvvatlanadi (tashqi funksiya jest.mock
// factory ichida ishlatiladi, shuning uchun shu yerda e'lon qilinadi).
function makeChainableJoin(rows: any[]): any {
  return {
    innerJoin: jest.fn(() => makeChainableJoin(rows)),
    where: jest.fn(async () => rows),
  };
}

// Drizzle'ning SQL fragment obyektlari (and/eq/isNotNull natijasi) doiraviy
// (circular) struktura bo'lgani uchun JSON.stringify qila olmaydi — bu
// funksiya ularning ichidagi ustun nomlari va operator matnlarini
// (StringChunk/Column) tekis satr ro'yxatiga yig'ib chiqaradi, shunda
// testlarda haqiqiy where sharti qanday ustun/operatorlardan tuzilganini
// (mock qatlamiga tegmasdan) tekshirish mumkin.
function flattenSqlChunks(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (node.constructor?.name === 'StringChunk' && Array.isArray(node.value)) {
    out.push(node.value.join(''));
    return out;
  }
  if (typeof node.name === 'string') { out.push(node.name); return out; }
  if (Array.isArray(node.queryChunks)) {
    for (const c of node.queryChunks) flattenSqlChunks(c, out);
    return out;
  }
  if (Array.isArray(node.value)) {
    for (const v of node.value) flattenSqlChunks(v, out);
  }
  return out;
}

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
    delete: jest.fn(() => ({ where: jest.fn(async () => {}) })),
    select: jest.fn(() => ({ from: jest.fn(() => makeChainableJoin([])) })),
    query: {
      courses: { findFirst: jest.fn() },
      groups: { findFirst: jest.fn(), findMany: jest.fn() },
      classSessions: { findFirst: jest.fn().mockResolvedValue(undefined), findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn(), findFirst: jest.fn() },
      attendanceRecords: { findFirst: jest.fn() },
      freeSessionParticipants: { findFirst: jest.fn() },
      mediaAssets: { findFirst: jest.fn() },
      users: { findMany: jest.fn().mockResolvedValue([]) },
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

function makeFakeRecordingService() {
  return {
    startRecording: jest.fn().mockResolvedValue(undefined),
    stopRecording: jest.fn().mockResolvedValue(undefined),
    refreshRecording: jest.fn().mockResolvedValue(undefined),
  };
}

async function setup(mediaLibrary = makeFakeMediaLibrary(), recordingService = makeFakeRecordingService()) {
  const storage = { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}`, deleteFile: jest.fn().mockResolvedValue(true) };
  const service = new ClassroomService(
    storage as any,
    { get: () => undefined } as any,
    mediaLibrary as any,
    recordingService as any,
  );
  const { b, events } = makeFakeBroadcaster();
  service.setBroadcaster(b);
  setupDbForCreate();
  const { id } = await service.createSession('c-1', 'teacher-1', 'teacher');
  return { service, events, sessionId: id, mediaLibrary, recordingService, storage };
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

  it('host LiveKit roomga ulangandan keyin recording boshlanadi', async () => {
    const { service, sessionId, recordingService } = await setup();
    expect(recordingService.startRecording).not.toHaveBeenCalled();
    await service.startSessionRecording(sessionId, 'teacher-1', 'full');
    expect(recordingService.startRecording).toHaveBeenCalledWith(sessionId, expect.any(Number));
  });

  it("'boardSilent' rejimida LiveKit egress ishga tushmaydi", async () => {
    const { service, sessionId, recordingService } = await setup();
    await service.startSessionRecording(sessionId, 'teacher-1', 'boardSilent');
    expect(recordingService.startRecording).not.toHaveBeenCalled();
  });

  it('begona ustoz uchun taqiqlanadi', async () => {
    const service = new ClassroomService({} as any, { get: () => undefined } as any, makeFakeMediaLibrary() as any, makeFakeRecordingService() as any);
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

describe('deleteSession', () => {
  it('yakunlangan sessiyani ustoz ochiradi: recording, contentBlocks va sessiya ozi ochiriladi', async () => {
    const { service, sessionId, storage } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'ended',
      recordingStatus: 'ready',
      recordingUrl: 'https://cdn/classroom-recordings/x.ogg',
      course: { adminId: 'teacher-1' },
    });

    await service.deleteSession(sessionId, 'teacher-1');

    expect(storage.deleteFile).toHaveBeenCalledWith(`classroom-recordings/${sessionId}.ogg`);
    expect(mockedDb.delete).toHaveBeenCalledTimes(2);
    // contentBlocks avval, so'ngra classSessions ochirilishi kerak (FK tartibi muhim)
    expect(mockedDb.delete.mock.calls[0][0]).toBe(contentBlocks);
    expect(mockedDb.delete.mock.calls[1][0]).toBe(classSessions);
  });

  it("recordingStatus 'ready' bolmasa deleteFile chaqirilmaydi", async () => {
    const { service, sessionId, storage } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'ended',
      recordingStatus: 'none',
      recordingUrl: null,
      course: { adminId: 'teacher-1' },
    });

    await service.deleteSession(sessionId, 'teacher-1');

    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(mockedDb.delete).toHaveBeenCalledTimes(2);
  });

  it('deleteFile false qaytarsa (fayl topilmadi) baribir sessiya ochiriladi', async () => {
    const { service, sessionId, storage } = await setup();
    storage.deleteFile.mockResolvedValueOnce(false);
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'ended',
      recordingStatus: 'ready',
      recordingUrl: 'https://cdn/classroom-recordings/x.ogg',
      course: { adminId: 'teacher-1' },
    });

    await expect(service.deleteSession(sessionId, 'teacher-1')).resolves.toBeUndefined();
    expect(mockedDb.delete).toHaveBeenCalledTimes(2);
  });

  it('sessiya topilmasa NotFoundException otadi', async () => {
    const { service } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce(undefined);

    await expect(service.deleteSession('missing-id', 'teacher-1')).rejects.toThrow();
  });

  it('boshqa kursning ustoziga ForbiddenException otadi', async () => {
    const { service, sessionId } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'ended',
      recordingStatus: 'none',
      recordingUrl: null,
      course: { adminId: 'boshqa-teacher' },
    });

    await expect(service.deleteSession(sessionId, 'teacher-1')).rejects.toThrow();
  });

  it("super boshqa ustozning yakunlangan sessiyasini o'chira oladi", async () => {
    const { service, sessionId } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'ended',
      recordingStatus: 'none',
      recordingUrl: null,
      course: { adminId: 'boshqa-teacher' },
    });

    await expect(service.deleteSession(sessionId, 'super-1', 'super')).resolves.toBeUndefined();
    expect(mockedDb.delete).toHaveBeenCalledTimes(2);
  });

  it("faol (active) sessiyani ochirishga urinilsa xato otadi", async () => {
    const { service, sessionId } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'active',
      recordingStatus: 'none',
      recordingUrl: null,
      course: { adminId: 'teacher-1' },
    });

    await expect(service.deleteSession(sessionId, 'teacher-1')).rejects.toThrow();
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

  it('replay uchun board/theme/style/zoom/scroll eventlari tarixga yoziladi', async () => {
    const { service, sessionId } = await withPdf();
    service.setBoardMode(sessionId, 'teacher-1', 'notebook');
    service.setTheme(sessionId, 'teacher-1', 'dark');
    service.setNotebookStyle(sessionId, 'teacher-1', 'lined');
    service.setZoom(sessionId, 'teacher-1', 1.75, 'right');
    service.scroll(sessionId, 'teacher-1', 1, 0.4, 'right', 0.2);

    expect(service.getHistoryEventsForTests(sessionId).map((event) => event.type)).toEqual([
      'board:set', 'theme:set', 'notebookStyle:set', 'zoom:set', 'scroll:set',
    ]);
    const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snapshot.rightZoom).toBe(1.75);
    expect(snapshot.rightScroll).toEqual({ page: 1, yRatio: 0.4, xRatio: 0.2 });
  });

  it('single rejimda daftarga o\'tish va chizish replay tarixida ketma-ket saqlanadi', async () => {
    const { service, sessionId } = await withPdf();
    service.setBoardMode(sessionId, 'teacher-1', 'notebook');
    const stroke = { id: 'note-1', tool: 'pen' as const, color: '#111', width: 4, points: [0.1, 0.1, 0.3, 0.3] };
    service.stroke(sessionId, 'teacher-1', 1, stroke, 'notebook', 'left');

    const history = service.getHistoryEventsForTests(sessionId);
    expect(history.map((event) => event.type)).toEqual(['board:set', 'stroke:add']);
    expect(history[0].payload).toMatchObject({ mode: 'notebook', layout: 'single', leftMode: 'notebook' });
    expect(history[1].payload).toMatchObject({ mode: 'notebook', pane: 'left', stroke });
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

  it('endSession da historyEvents DB ga saqlanadi', async () => {
    const { service, sessionId } = await withPdf();
    await service.startSessionRecording(sessionId, 'teacher-1', 'full');
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] });
    mockedDb.update.mockClear();
    await service.endSession(sessionId, 'teacher-1');
    expect(mockedDb.update).toHaveBeenCalled();
    const setCalls = mockedDb.update.mock.results.map((r: any) => r.value.set.mock.calls[0][0]);
    expect(setCalls.some((c: any) => Array.isArray(c.historyEvents) && c.historyEvents.length === 1)).toBe(true);
  });

  it('endSession recordingMode null bo‘lsa boardSnapshot va bo‘sh historyEvents saqlaydi', async () => {
    const { service, sessionId } = await withPdf();
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };
    service.stroke(sessionId, 'teacher-1', 1, stroke);
    mockedDb.update.mockClear();

    await service.endSession(sessionId, 'teacher-1');

    const saved = mockedDb.update.mock.results.at(-1).value.set.mock.calls[0][0];
    expect(saved.boardSnapshot.strokesByPage[1]).toContainEqual(stroke);
    expect(saved.historyEvents).toEqual([]);
  });

  it('getReplay tarix+recording+attendance qaytaradi', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] });
    const history = service.getHistoryEventsForTests(sessionId);
    await service.endSession(sessionId, 'teacher-1');

    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      pdfName: 'dars.pdf',
      pdfPages: ['page1.png'],
      historyEvents: history,
      recordingUrl: null,
      recordingStatus: 'pending',
      course: { id: 'c-1', adminId: 'teacher-1' },
      attendance: [
        {
          status: 'present',
          enrollment: { schoolMember: { studentId: 'stu-1', student: { displayName: 'Ali' } } },
        },
      ],
    });

    const replay = await service.getReplay(sessionId, 'teacher-1');
    expect(replay.historyEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'stroke:add' })]),
    );
    expect(replay).toHaveProperty('attendance');
    expect(replay).toHaveProperty('recordingStatus');
  });

  it('getReplay recordingStartedAtMs ni qaytaradi — audio va chizma tarixini sinxronlashtirish uchun', async () => {
    const { service, sessionId } = await withPdf();
    await service.endSession(sessionId, 'teacher-1');

    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      pdfName: 'dars.pdf',
      pdfPages: ['page1.png'],
      historyEvents: [],
      recordingUrl: 'https://cdn/rec.ogg',
      recordingStatus: 'ready',
      recordingStartedAtMs: 3200,
      course: { id: 'c-1', adminId: 'teacher-1' },
      attendance: [],
    });

    const replay = await service.getReplay(sessionId, 'teacher-1');
    expect(replay.recordingStartedAtMs).toBe(3200);
  });

  it('getReplay boshqa kursning ustoziga ForbiddenException otadi', async () => {
    const { service, sessionId } = await withPdf();
    await service.endSession(sessionId, 'teacher-1');

    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      pdfName: 'dars.pdf',
      pdfPages: [],
      historyEvents: [],
      recordingUrl: null,
      recordingStatus: 'none',
      course: { id: 'c-1', adminId: 'teacher-1' },
      attendance: [],
    });

    await expect(service.getReplay(sessionId, 'some-other-teacher'))
      .rejects.toThrow();
  });

  it('getReplay attendance qatoridagi null bog\'lanishlarda 500 bermaydi', async () => {
    const { service, sessionId } = await withPdf();
    await service.endSession(sessionId, 'teacher-1');

    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      pdfName: 'dars.pdf',
      pdfPages: [],
      historyEvents: [],
      recordingUrl: null,
      recordingStatus: 'none',
      course: { id: 'c-1', adminId: 'teacher-1' },
      attendance: [
        {
          status: 'present',
          enrollment: { schoolMember: { studentId: 'stu-1', student: { displayName: 'Ali' } } },
        },
        {
          status: 'absent',
          enrollment: null,
        },
        {
          status: 'late',
          enrollment: { schoolMember: null },
        },
      ],
    });

    const replay = await service.getReplay(sessionId, 'teacher-1');
    expect(replay.attendance).toEqual([{ userId: 'stu-1', name: 'Ali', status: 'present' }]);
  });

  it("getReplay: erkin sessiya ishtirokchisi (freeSessionParticipants'da bor) ruxsat oladi", async () => {
    const { service, sessionId } = await withPdf();
    await service.endSession(sessionId, 'teacher-1');

    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      courseId: null,
      course: null,
      teacherId: 'teacher-1',
      pdfName: null,
      pdfPages: [],
      historyEvents: [],
      recordingUrl: null,
      recordingStatus: 'none',
      recordingStartedAtMs: null,
      recordingMode: null,
      boardSnapshot: { pages: [] },
      attendance: [],
    });
    mockedDb.query.freeSessionParticipants.findFirst.mockResolvedValueOnce({ id: 'fp-1' });

    await expect(service.getReplay(sessionId, 'stu-1')).resolves.toBeDefined();
  });

  it("getReplay: erkin sessiyaga aloqasi yo'q foydalanuvchi rad etiladi", async () => {
    const { service, sessionId } = await withPdf();
    await service.endSession(sessionId, 'teacher-1');

    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      courseId: null,
      course: null,
      teacherId: 'teacher-1',
      pdfName: null,
      pdfPages: [],
      historyEvents: [],
      recordingUrl: null,
      recordingStatus: 'none',
      recordingStartedAtMs: null,
      recordingMode: null,
      boardSnapshot: { pages: [] },
      attendance: [],
    });
    mockedDb.query.freeSessionParticipants.findFirst.mockResolvedValueOnce(undefined);

    await expect(service.getReplay(sessionId, 'stranger-1')).rejects.toThrow();
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
    const recordingService = makeFakeRecordingService();
    const service = new ClassroomService(
      { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}` } as any,
      { get: () => undefined } as any,
      makeFakeMediaLibrary() as any,
      recordingService as any,
    );
    const { b, events } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    return { service, events, recordingService };
  }

  it('class_sessions qatorini courseId: null bilan yaratadi', async () => {
    const { service } = makeFreeService();
    const result = await service.createFreeSession('teacher-1');
    expect(result.id).toBe('cs-row-1');
    expect(mockedDb.insert).toHaveBeenCalledWith(classSessions);
  });

  it('kurs/DB yozuvisiz sessiya yaratadi', async () => {
    const { service } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    expect(id).toBeTruthy();
    expect(mockedDb.insert).toHaveBeenCalledWith(classSessions);
    const snap = service.hostJoin(id, 'teacher-1', 'sock-h');
    expect(snap.isFree).toBe(true);
  });

  it('erkin (isFree) sessiyada historyEvents umuman yozilmaydi', async () => {
    const { service } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    service.setBoardView(id, 'teacher-1', 'single', 'notebook', 'notebook');
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };
    service.stroke(id, 'teacher-1', 1, stroke, 'notebook', 'left');
    expect(service.getHistoryEventsForTests(id)).toHaveLength(0);
  });

  it('split rejimida ikkala panelga bir xil kontent qoyishni rad etadi', async () => {
    const { service } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    expect(() => service.setBoardView(id, 'teacher-1', 'split', 'pdf', 'pdf'))
      .toThrow('DUPLICATE_SPLIT_MODE');
    expect(() => service.setBoardView(id, 'teacher-1', 'split', 'notebook', 'notebook'))
      .toThrow('DUPLICATE_SPLIT_MODE');
  });

  it('panellarni almashtirganda (swap) chizmalar mode bilan birga qoladi, pane bilan emas', async () => {
    const { service } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
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
    const { id } = await service.createFreeSession('teacher-1');
    jest.clearAllMocks(); // Clear mocks after createFreeSession to check studentJoin doesn't insert
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
    const { id } = await service.createFreeSession('teacher-1');
    const snap = await service.studentJoin(id, 'stu-1', 'sock-1', 'Boshqa ism', 'Haqiqiy Ism');
    expect(snap.participants[0]).toMatchObject({ userId: 'stu-1', name: 'Haqiqiy Ism' });
  });

  it('uzilganda ham davomat DB ga yozilmaydi', async () => {
    const { service } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    jest.clearAllMocks(); // Clear mocks after createFreeSession to check subsequent operations don't update
    await service.studentJoin(id, 'guest:abc', 'sock-1', 'Mehmon');
    await service.handleDisconnect('sock-1');
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('erkin sessiya tugaganda ham boardSnapshot DB\'ga yoziladi, davomat yozilmaydi', async () => {
    const { service, events } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    jest.clearAllMocks(); // Clear mocks after createFreeSession to check endSession's own DB calls
    await service.endSession(id, 'teacher-1');
    expect(mockedDb.update).toHaveBeenCalledWith(classSessions);
    const saved = mockedDb.update.mock.results.at(-1).value.set.mock.calls[0][0];
    expect(saved).toHaveProperty('boardSnapshot');
    expect(saved.status).toBe('ended');
    // davomat (attendance) uchun hech qanday insert chaqirilmagan
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(events.some((e) => e.event === 'session:ended')).toBe(true);
    expect(() => service.hostJoin(id, 'teacher-1', 'sock-h')).toThrow();
  });

  it('erkin sessiyada startSessionRecording endi ForbiddenException otmaydi', async () => {
    const { service, recordingService } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    await expect(service.startSessionRecording(id, 'teacher-1', 'boardAudio')).resolves.not.toThrow();
    expect(recordingService.startRecording).toHaveBeenCalledWith(id, expect.any(Number));
  });

  it("erkin bolmagan (oddiy) sessiyada guestId bilan kirish NOT_ENROLLED bilan rad etiladi", async () => {
    const { service, sessionId } = await setup();
    await expect(service.studentJoin(sessionId, 'guest:xyz', 'sock-1', 'Notanish')).rejects.toThrow('NOT_ENROLLED');
  });

  it('erkin sessiyaga login qilgan foydalanuvchi kirsa freeSessionParticipants\'ga yoziladi', async () => {
    const { service } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    jest.clearAllMocks();
    await service.studentJoin(id, 'stu-1', 'sock-1', undefined, 'Ali');
    const insertCalls = mockedDb.insert.mock.calls.filter((call: any[]) => call[0] === freeSessionParticipants);
    expect(insertCalls.length).toBe(1);
  });

  it('erkin sessiyaga mehmon (guest:) kirsa freeSessionParticipants\'ga yozilmaydi', async () => {
    const { service } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    jest.clearAllMocks();
    await service.studentJoin(id, 'guest:abc-123', 'sock-1', 'Mehmon Ismi', undefined);
    const insertCalls = mockedDb.insert.mock.calls.filter((call: any[]) => call[0] === freeSessionParticipants);
    expect(insertCalls.length).toBe(0);
  });
});

describe('myFreeSessionHistory', () => {
  function makePlainService() {
    return new ClassroomService(
      { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}` } as any,
      { get: () => undefined } as any,
      makeFakeMediaLibrary() as any,
      makeFakeRecordingService() as any,
    );
  }

  it('faqat shu ustozning courseId=null qatorlarini qaytaradi', async () => {
    mockedDb.query.classSessions.findMany.mockResolvedValueOnce([
      {
        id: 's-1', status: 'ended', pdfName: null, startedAt: new Date(), endedAt: new Date(),
        recordingMode: null, boardSnapshot: { pages: [] },
      },
    ]);
    const service = makePlainService();
    const result = await service.myFreeSessionHistory('teacher-1');
    expect(result).toHaveLength(1);
    expect(result[0].hasBoardSnapshot).toBe(true);
    expect(result[0].id).toBe('s-1');
  });

  it('boardSnapshot null bolsa hasBoardSnapshot false qaytaradi (agar qandaydir yo\'l bilan qaytsa)', async () => {
    // Eslatma: haqiqiy so'rov endi boardSnapshot IS NOT NULL va status='ended'
    // filtri bilan bunday qatorni umuman qaytarmaydi (pastdagi test buni
    // tekshiradi) — bu test faqat xaritalash (mapping) mantiqi hali ham
    // to'g'ri ishlashini ko'rsatadi, agar mock qatlami haqiqiy SQL filtrini
    // aks ettirmasa ham.
    mockedDb.query.classSessions.findMany.mockResolvedValueOnce([
      {
        id: 's-2', status: 'active', pdfName: 'dars.pdf', startedAt: new Date(), endedAt: null,
        recordingMode: 'full', boardSnapshot: null,
      },
    ]);
    const service = makePlainService();
    const result = await service.myFreeSessionHistory('teacher-1');
    expect(result[0].hasBoardSnapshot).toBe(false);
    expect(result[0].endedAt).toBeNull();
    expect(result[0].recordingMode).toBe('full');
  });

  it('faqat tugagan VA boardSnapshot mavjud sessiyalarni so\'raydi (status=ended, boardSnapshot IS NOT NULL)', async () => {
    mockedDb.query.classSessions.findMany.mockResolvedValueOnce([]);
    const service = makePlainService();
    await service.myFreeSessionHistory('teacher-1');
    const whereArg = mockedDb.query.classSessions.findMany.mock.calls[0][0].where;
    const whereText = flattenSqlChunks(whereArg).join('|');
    expect(whereText).toContain('board_snapshot');
    expect(whereText).toContain('is not null');
    expect(whereText).toContain('status');
  });
});

describe('myClassSessions', () => {
  function makePlainService() {
    return new ClassroomService(
      { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}` } as any,
      { get: () => undefined } as any,
      makeFakeMediaLibrary() as any,
      makeFakeRecordingService() as any,
    );
  }

  const groupSession = {
    id: 'gs-1',
    startedAt: new Date('2026-07-01T10:00:00Z'),
    pdfName: 'guruh.pdf',
    boardSnapshot: { pages: [] },
    teacherId: 'teacher-1',
  };
  const freeSession = {
    id: 'fs-1',
    startedAt: new Date('2026-07-10T10:00:00Z'),
    pdfName: null,
    boardSnapshot: { pages: [] },
    teacherId: 'teacher-2',
  };

  it('guruhli va erkin natijalarni birlashtirib, sana boyicha kamayish tartibida qaytaradi', async () => {
    // myClassSessions ichida db.select() ketma-ket ikki marta chaqiriladi:
    // birinchisi guruhli (.from().innerJoin().innerJoin().innerJoin().where()),
    // ikkinchisi erkin (.from().innerJoin().where()) so'rov uchun.
    mockedDb.select
      .mockReturnValueOnce({ from: jest.fn(() => makeChainableJoin([groupSession])) })
      .mockReturnValueOnce({ from: jest.fn(() => makeChainableJoin([freeSession])) });
    mockedDb.query.users.findMany.mockResolvedValueOnce([
      { id: 'teacher-1', displayName: 'Ustoz Ali' },
      { id: 'teacher-2', displayName: 'Ustoz Vali' },
    ]);

    const service = makePlainService();
    const result = await service.myClassSessions('stu-1');

    expect(result).toHaveLength(2);
    // Yangiroq boshlangan (fs-1, erkin) birinchi kelishi kerak
    expect(result[0]).toMatchObject({ id: 'fs-1', isFree: true, teacherName: 'Ustoz Vali', hasBoardSnapshot: true });
    expect(result[1]).toMatchObject({ id: 'gs-1', isFree: false, teacherName: 'Ustoz Ali', hasBoardSnapshot: true, pdfName: 'guruh.pdf' });
  });

  it('ikkala so\'rov ham boardSnapshot IS NOT NULL va status=ended shartlarini qo\'shadi', async () => {
    mockedDb.select
      .mockReturnValueOnce({ from: jest.fn(() => makeChainableJoin([])) })
      .mockReturnValueOnce({ from: jest.fn(() => makeChainableJoin([])) });

    const service = makePlainService();
    await service.myClassSessions('stu-1');

    const fromCalls = mockedDb.select.mock.results.map((r: any) => r.value.from.mock.results[0].value);
    const groupWhereArg = fromCalls[0].innerJoin.mock.results[0].value.innerJoin.mock.results[0].value.innerJoin.mock.results[0].value.where.mock.calls[0][0];
    const freeWhereArg = fromCalls[1].innerJoin.mock.results[0].value.where.mock.calls[0][0];

    const groupWhereText = flattenSqlChunks(groupWhereArg).join('|');
    const freeWhereText = flattenSqlChunks(freeWhereArg).join('|');
    for (const whereText of [groupWhereText, freeWhereText]) {
      expect(whereText).toContain('board_snapshot');
      expect(whereText).toContain('is not null');
      expect(whereText).toContain('status');
    }
  });

  it('bir xil id ikkala royxatda ham kelsa (nazariy holat) dublikat qilmaydi', async () => {
    // Xavfsizlik uchun qo'shilgan unique-by-id mantig'ini tekshiradi: bitta
    // sessiya SQL darajasida ham erkin, ham guruhli bo'lolmaydi, lekin
    // servis xato holatda ham dublikat qaytarmasligi kerak.
    const sameIdRow = { ...groupSession, id: 'dup-1' };
    mockedDb.select
      .mockReturnValueOnce({ from: jest.fn(() => makeChainableJoin([sameIdRow])) })
      .mockReturnValueOnce({ from: jest.fn(() => makeChainableJoin([{ ...sameIdRow, teacherId: 'teacher-1' }])) });
    mockedDb.query.users.findMany.mockResolvedValueOnce([{ id: 'teacher-1', displayName: 'Ustoz Ali' }]);

    const service = makePlainService();
    const result = await service.myClassSessions('stu-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('dup-1');
  });

  it('hech qanday sessiya topilmasa bosh royxat qaytaradi va users.findMany chaqirilmaydi', async () => {
    mockedDb.select
      .mockReturnValueOnce({ from: jest.fn(() => makeChainableJoin([])) })
      .mockReturnValueOnce({ from: jest.fn(() => makeChainableJoin([])) });

    const service = makePlainService();
    const result = await service.myClassSessions('stu-1');

    expect(result).toEqual([]);
    expect(mockedDb.query.users.findMany).not.toHaveBeenCalled();
  });
});
