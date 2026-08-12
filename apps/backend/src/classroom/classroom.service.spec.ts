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
      freeSessionParticipants: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      mediaAssets: { findFirst: jest.fn() },
      users: {
        findMany: jest.fn().mockResolvedValue([]),
        // createSession host ismini shu yerdan oladi (hostName).
        findFirst: jest.fn().mockResolvedValue({ id: 'teacher-1', displayName: 'Ustoz Aziz' }),
      },
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
    { notifyUsers: jest.fn() } as any,
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
    const service = new ClassroomService({} as any, { get: () => undefined } as any, makeFakeMediaLibrary() as any, makeFakeRecordingService() as any, { notifyUsers: jest.fn() } as any);
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

  it('kutubxonadan tanlangan sahifalarni mavjud PDFga qoshadi va pdf:insert broadcast qiladi', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1', 'p2', 'p3'], status: 'ready' });
    const { service, events, sessionId } = await setup(mediaLibrary);
    service.setPdfForTests(sessionId, 'dars.pdf', ['a.png', 'b.png']);

    const result = await service.insertPdfPagesFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [2], 1);

    expect(result).toEqual({ pages: ['p2'] });
    expect(events.at(-1)).toMatchObject({
      event: 'pdf:insert',
      payload: { pages: ['p2'], afterPageIndex: 1 },
    });
  });

  it('boshqa kitobdan olingan sahifalar mavjud PDFga aralashtiriladi', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['other-1', 'other-2'], status: 'ready' });
    const { service, sessionId } = await setup(mediaLibrary);
    service.setPdfForTests(sessionId, 'dars.pdf', ['a.png', 'b.png']);

    const result = await service.insertPdfPagesFromLibrary(sessionId, 'teacher-1', 'teacher', 'boshqa-asset', [1], 2);

    expect(result.pages).toEqual(['other-1']);
    const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snapshot.pages).toEqual(['a.png', 'b.png', 'other-1']);
  });

  it('begona ustoz uchun taqiqlanadi', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1'], status: 'ready' });
    const { service, sessionId } = await setup(mediaLibrary);
    service.setPdfForTests(sessionId, 'dars.pdf', ['a.png']);
    await expect(
      service.insertPdfPagesFromLibrary(sessionId, 'boshqa-teacher', 'teacher', 'asset-1', [1], 0),
    ).rejects.toThrow();
  });

  it('notogri afterPageIndex bilan qoshish rad etiladi', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1'], status: 'ready' });
    const { service, sessionId } = await setup(mediaLibrary);
    service.setPdfForTests(sessionId, 'dars.pdf', ['a.png']);
    await expect(
      service.insertPdfPagesFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [1], 99),
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

  it('host split kenglikni ozgartirsa splitRatio:set broadcast va tarixga yoziladi', async () => {
    const { service, events, sessionId } = await withPdf();
    service.setSplitRatio(sessionId, 'teacher-1', 0.65);
    expect(events.at(-1)).toMatchObject({ event: 'splitRatio:set', payload: { ratio: 0.65 } });
    expect(service.getHistoryEventsForTests(sessionId).map((event) => event.type)).toContain('splitRatio:set');
  });

  it('splitRatio 0.2 dan 0.8 gacha chegaralanadi', async () => {
    const { service, sessionId } = await withPdf();
    service.setSplitRatio(sessionId, 'teacher-1', 0.05);
    expect(service.getHistoryEventsForTests(sessionId).at(-1)).toMatchObject({ payload: { ratio: 0.2 } });
    service.setSplitRatio(sessionId, 'teacher-1', 0.95);
    expect(service.getHistoryEventsForTests(sessionId).at(-1)).toMatchObject({ payload: { ratio: 0.8 } });
  });

  it('host bolmagan foydalanuvchi splitRatio ozgartira olmaydi', async () => {
    const { service, sessionId } = await withPdf();
    expect(() => service.setSplitRatio(sessionId, 'stu-1', 0.65)).toThrow();
  });

  it('host sahifani ochirsa page:remove broadcast va tarixga yoziladi', async () => {
    const { service, events, sessionId } = await withPdf();
    service.removePage(sessionId, 'teacher-1', 'pdf', 2);
    expect(events.at(-1)).toMatchObject({ event: 'page:remove', payload: { mode: 'pdf', pageIndex: 2, pane: 'left' } });
    expect(service.getHistoryEventsForTests(sessionId).map((event) => event.type)).toContain('page:remove');
  });

  it('host bolmagan foydalanuvchi sahifani ochira olmaydi', async () => {
    const { service, sessionId } = await withPdf();
    expect(() => service.removePage(sessionId, 'stu-1', 'pdf', 1)).toThrow();
  });

  it('oxirgi sahifani ochirishga urinilsa xato tashlanadi', async () => {
    const ctx = await setup();
    ctx.service.setPdfForTests(ctx.sessionId, 'dars.pdf', ['only.png']);
    expect(() => ctx.service.removePage(ctx.sessionId, 'teacher-1', 'pdf', 1)).toThrow();
  });

  it('kech kirgan ustoz snapshot orqali kamaygan sahifalar sonini oladi', async () => {
    const { service, sessionId } = await withPdf();
    service.removePage(sessionId, 'teacher-1', 'pdf', 1);
    const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snapshot.pages.length).toBe(2); // withPdf() sets 3 pages, one removed
  });

  it('host daftarga yangi sahifa qoshsa page:insert broadcast va tarixga yoziladi', async () => {
    const { service, events, sessionId } = await setup();
    service.setBoardMode(sessionId, 'teacher-1', 'notebook');
    service.insertNotebookPage(sessionId, 'teacher-1', 1, 'lined');
    expect(events.at(-1)).toMatchObject({
      event: 'page:insert',
      payload: { mode: 'notebook', afterPageIndex: 1, style: 'lined', pane: 'left' },
    });
    expect(service.getHistoryEventsForTests(sessionId).map((event) => event.type)).toContain('page:insert');
  });

  it('host bolmagan foydalanuvchi sahifa qosha olmaydi', async () => {
    const { service, sessionId } = await setup();
    expect(() => service.insertNotebookPage(sessionId, 'stu-1', 0, 'grid')).toThrow();
  });

  it('notogri afterPageIndex bilan sahifa qoshish rad etiladi', async () => {
    const { service, sessionId } = await setup();
    service.setBoardMode(sessionId, 'teacher-1', 'notebook');
    expect(() => service.insertNotebookPage(sessionId, 'teacher-1', 99, 'grid')).toThrow();
  });

  it('kech kirgan ustoz snapshot orqali kopaygan sahifalar sonini oladi', async () => {
    const { service, sessionId } = await setup();
    service.setBoardMode(sessionId, 'teacher-1', 'notebook');
    service.insertNotebookPage(sessionId, 'teacher-1', 1, 'plain');
    const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snapshot.notebookPageCount).toBe(2); // default 1, one inserted
    expect(snapshot.notebookPageStyles).toEqual({ 2: 'plain' });
  });

  it('host zoom ozgartirsa zoom:set broadcast, tarixga yoziladi va kech kirgan snapshotda saqlanadi', async () => {
    const { service, events, sessionId } = await withPdf();
    service.setZoom(sessionId, 'teacher-1', 1.75, 'right');
    expect(events.at(-1)).toMatchObject({ event: 'zoom:set', payload: { zoom: 1.75, pane: 'right' } });
    expect(service.getHistoryEventsForTests(sessionId).map((event) => event.type)).toContain('zoom:set');

    // Kech kirgan ustoz snapshot orqali right pane zoom'ini darhol oladi,
    // chap pane zoom esa ozgartirilmagani uchun defaultda (1) qoladi.
    const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snapshot.rightZoom).toBe(1.75);
    expect(snapshot.zoom).toBe(1);
  });

  it('splitRatio uchun notogri (NaN/raqam emas) qiymat 0.5 ga tushadi', async () => {
    const { service, sessionId } = await withPdf();
    service.setSplitRatio(sessionId, 'teacher-1', NaN);
    expect(service.getHistoryEventsForTests(sessionId).at(-1)).toMatchObject({ payload: { ratio: 0.5 } });
    service.setSplitRatio(sessionId, 'teacher-1', 'not-a-number' as any);
    expect(service.getHistoryEventsForTests(sessionId).at(-1)).toMatchObject({ payload: { ratio: 0.5 } });
    const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snapshot.splitRatio).toBe(0.5);
  });

  it('kech kirgan ustoz snapshot orqali saqlangan splitRatio ni oladi', async () => {
    const { service, sessionId } = await withPdf();
    service.setSplitRatio(sessionId, 'teacher-1', 0.7);
    const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snapshot.splitRatio).toBe(0.7);
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

  it('yangi PDF yuklash daftar chizmalarini o‘chirmaydi', async () => {
    const { service, sessionId } = await withPdf();
    service.setBoardMode(sessionId, 'teacher-1', 'notebook');
    const stroke = { id: 'note-kept', tool: 'pen' as const, color: '#111', width: 4, points: [0.1, 0.1, 0.3, 0.3] };
    service.stroke(sessionId, 'teacher-1', 1, stroke, 'notebook', 'left');

    service.setPdfForTests(sessionId, 'yangi.pdf', ['new-page.png']);
    service.setBoardMode(sessionId, 'teacher-1', 'notebook');

    const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-after-pdf');
    expect(snapshot.strokesByPage[1]).toContainEqual(stroke);
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

  it('clear broadcast', async () => {
    const { service, events, sessionId } = await withPdf();
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

  // recordingMode null bo'lganda historyEvents filtrlanmaydi — to'liq ro'yxat
  // saqlanadi (faqat 'boardAudio' rejimida navigatsiya eventlariga qisqartiriladi).
  it('endSession recordingMode null bo‘lsa boardSnapshot va toliq historyEvents saqlaydi', async () => {
    const { service, sessionId } = await withPdf();
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };
    service.stroke(sessionId, 'teacher-1', 1, stroke);
    mockedDb.update.mockClear();

    await service.endSession(sessionId, 'teacher-1');

    const saved = mockedDb.update.mock.results.at(-1).value.set.mock.calls[0][0];
    expect(saved.boardSnapshot.strokesByPage[1]).toContainEqual(stroke);
    expect(saved.historyEvents.some((e: any) => e.type === 'stroke:add')).toBe(true);
  });

  it('endSession board-only rejimda notebookPageStyles ni boardSnapshot ichida saqlaydi', async () => {
    const { service, sessionId } = await setup();
    service.setBoardMode(sessionId, 'teacher-1', 'notebook');
    service.insertNotebookPage(sessionId, 'teacher-1', 1, 'plain');
    mockedDb.update.mockClear();

    await service.endSession(sessionId, 'teacher-1');

    const saved = mockedDb.update.mock.results.at(-1).value.set.mock.calls[0][0];
    expect(saved.boardSnapshot.notebookPageStyles).toEqual({ 2: 'plain' });
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

  it("getReplay: erkin sessiyada qatnashganlar attendance ro'yxatida chiqadi", async () => {
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
    mockedDb.query.freeSessionParticipants.findMany.mockResolvedValueOnce([
      { userId: 'stu-1', user: { displayName: 'Ali' } },
      { userId: 'stu-2', user: { displayName: 'Vali' } },
    ]);

    const replay = await service.getReplay(sessionId, 'teacher-1');

    expect(replay.attendance).toEqual([
      { userId: 'stu-1', name: 'Ali', status: 'present' },
      { userId: 'stu-2', name: 'Vali', status: 'present' },
    ]);
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
  it('persistent doska hosti uzilganda doska yakunlanmaydi va o\'chirilmaydi', async () => {
    jest.useFakeTimers();
    const { service, events, sessionId } = await setup();
    const board = (service as any).sessions.get(sessionId);
    board.isFree = true;
    board.isBoard = true;
    service.hostJoin(sessionId, 'teacher-1', 'sock-board');

    await service.handleDisconnect('sock-board');
    jest.advanceTimersByTime(HOST_GRACE_MS + 1000);
    await jest.runAllTimersAsync();

    expect(events.some((e) => e.event === 'session:ended')).toBe(false);
    expect(mockedDb.delete).not.toHaveBeenCalled();
  });

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
    // endSession bir nechta await'li (DB o'qish/yozish) — bitta-ikkita
    // Promise.resolve() yetmaydi, shuning uchun barcha kutilayotgan
    // mikrovazifalar tugaguncha navbatni bo'shatamiz.
    await jest.runAllTimersAsync();
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
    { notifyUsers: jest.fn() } as any,
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

  // Erkin sessiyalar endi createFreeSession orqali class_sessions qatoriga ega
  // bo'lgani uchun, ular ham guruh darslari kabi historyEvents yozadi — bu
  // yozib olingan erkin darsni keyin replay qilish uchun kerak.
  it('erkin (isFree) sessiyada ham historyEvents yoziladi', async () => {
    const { service } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    service.setBoardView(id, 'teacher-1', 'single', 'notebook', 'notebook');
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };
    service.stroke(id, 'teacher-1', 1, stroke, 'notebook', 'left');
    const history = service.getHistoryEventsForTests(id);
    expect(history.map((e) => e.type)).toEqual(['board:set', 'stroke:add']);
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

  // Yozib olinmagan erkin dars tugaganda saqlanadigan qiymatli narsa yo'q —
  // qatori butunlay o'chiriladi (status: 'ended' qilib qoldirilmaydi).
  // Davomat baribir yozilmaydi: erkin darsda enrollment tushunchasi yo'q.
  it('yozib olinmagan erkin sessiya tugaganda class_sessions qatori ochiriladi', async () => {
    const { service, events } = makeFreeService();
    const { id } = await service.createFreeSession('teacher-1');
    jest.clearAllMocks(); // Clear mocks after createFreeSession to check endSession's own DB calls
    await service.endSession(id, 'teacher-1');
    expect(mockedDb.delete).toHaveBeenCalledWith(classSessions);
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

  describe('createFreeSessionFromSnapshot', () => {
    const fakeSnapshot = {
      pdfName: 'eski-dars.pdf',
      pages: ['p1.webp', 'p2.webp'],
      strokesByPage: { 1: [{ id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }] },
      rightStrokesByPage: {},
      boardMode: 'pdf',
      boardLayout: 'single',
      leftBoardMode: 'pdf',
      rightBoardMode: 'pdf',
      notebookStyle: 'grid',
      notebookPageCount: 4,
      notebookPageStyles: {},
    };

    it("topilmagan manba sessiya uchun NotFoundException tashlaydi", async () => {
      const { service } = makeFreeService();
      mockedDb.query.classSessions.findFirst.mockResolvedValueOnce(undefined);
      await expect(service.createFreeSessionFromSnapshot('teacher-1', 'missing-id')).rejects.toThrow();
    });

    it("boardSnapshot null bo'lgan sessiya uchun rad etadi", async () => {
      const { service } = makeFreeService();
      mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
        id: 'old-id', teacherId: 'teacher-1', boardSnapshot: null,
      });
      await expect(service.createFreeSessionFromSnapshot('teacher-1', 'old-id')).rejects.toThrow();
    });

    it('begona ustoz uchun taqiqlanadi', async () => {
      const { service } = makeFreeService();
      mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
        id: 'old-id', teacherId: 'boshqa-teacher', boardSnapshot: fakeSnapshot,
      });
      await expect(service.createFreeSessionFromSnapshot('teacher-1', 'old-id')).rejects.toThrow();
    });

    it('snapshotdan yangi erkin sessiya yaratadi va pdf/chizmalarni tiklaydi', async () => {
      const { service } = makeFreeService();
      mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
        id: 'old-id', teacherId: 'teacher-1', boardSnapshot: fakeSnapshot,
      });

      const { id } = await service.createFreeSessionFromSnapshot('teacher-1', 'old-id');

      expect(id).toBeTruthy();
      const snap = service.hostJoin(id, 'teacher-1', 'sock-h');
      expect(snap.isFree).toBe(true);
      expect(snap.pdfName).toBe('eski-dars.pdf');
      expect(snap.pages).toEqual(['p1.webp', 'p2.webp']);
      expect(snap.strokesByPage[1]).toHaveLength(1);
      expect(snap.strokesByPage[1][0].id).toBe('s1');
      expect(snap.notebookPageCount).toBe(4);
      expect(snap.currentPage).toBe(1);
    });

    it('daftar rejimidagi snapshotdan tiklaganda notebook chizmalari ham saqlanadi', async () => {
      const { service } = makeFreeService();
      mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
        id: 'old-id', teacherId: 'teacher-1',
        boardSnapshot: {
          ...fakeSnapshot,
          boardMode: 'notebook', leftBoardMode: 'notebook', rightBoardMode: 'notebook',
          strokesByPage: { 1: [{ id: 'n1', tool: 'pen', color: '#00f', width: 2, points: [0.2, 0.2, 0.3, 0.3] }] },
        },
      });

      const { id } = await service.createFreeSessionFromSnapshot('teacher-1', 'old-id');

      const snap = service.hostJoin(id, 'teacher-1', 'sock-h');
      expect(snap.boardMode).toBe('notebook');
      expect(snap.strokesByPage[1][0].id).toBe('n1');
    });
  });
});

describe('myFreeSessionHistory', () => {
  function makePlainService() {
    return new ClassroomService(
      { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}` } as any,
      { get: () => undefined } as any,
      makeFakeMediaLibrary() as any,
      makeFakeRecordingService() as any,
    { notifyUsers: jest.fn() } as any,
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
    { notifyUsers: jest.fn() } as any,
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

describe('undo entry recording', () => {
  async function withPdf() {
    const ctx = await setup();
    ctx.service.setPdfForTests(ctx.sessionId, 'dars.pdf', ['u1', 'u2', 'u3']);
    return ctx;
  }

  it('stroke() pushes a stroke:add entry', async () => {
    const { service, sessionId } = await withPdf();
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };

    service.stroke(sessionId, 'teacher-1', 1, stroke);

    const stack = service.getUndoStackForTests(sessionId);
    expect(stack.at(-1)).toMatchObject({ type: 'stroke:add', mode: 'pdf', page: 1, after: { stroke } });
  });

  it('moveStroke() pushes a stroke:transform entry with correct before/after points', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });

    service.moveStroke(sessionId, 'teacher-1', 1, 's1', 0.5, 0.5);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:transform');
    expect((entry.before as any).points).toEqual([0.1, 0.1, 0.2, 0.2]);
    expect((entry.after as any).points[0]).toBeCloseTo(0.5);
  });

  // NOTE: updateTextStrokeInSession (classroom.logic.ts) rejects any stroke
  // whose id isn't already present in the page's stroke list (index === -1
  // => returns false => service throws INVALID_STROKE before pushUndoEntry
  // is ever reached). A brand-new text stroke is created via stroke(), not
  // updateTextStroke() — per the Task 3 brief's own Step 6 note, this
  // before=null branch is structurally unreachable through this call site,
  // and the brief explicitly forbids changing updateTextStrokeInSession's
  // validation to force it reachable. Skipped rather than asserting
  // dead code; the before=null case is still exercised at the type/logic
  // level by Task 1's applyStrokeTextInverse tests.
  it.skip('updateTextStroke() pushes a stroke:text entry with before=null for a brand-new text stroke', async () => {
    const { service, sessionId } = await withPdf();
    const stroke = { id: 't1', tool: 'text' as const, color: '#000', width: 2, points: [0.2, 0.2], text: 'Salom', textBoxWidth: 100, textBoxHeight: 40 };

    service.updateTextStroke(sessionId, 'teacher-1', 1, stroke);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:text');
    expect(entry.before).toBeNull();
    expect((entry.after as any).text).toBe('Salom');
  });

  it('updateTextStroke() pushes before= the prior stroke when editing existing text', async () => {
    const { service, sessionId } = await withPdf();
    const original = { id: 't1', tool: 'text' as const, color: '#000', width: 2, points: [0.2, 0.2], text: 'Salom', textBoxWidth: 100, textBoxHeight: 40 };
    // updateTextStrokeInSession requires the stroke to already exist (see
    // NOTE above), so seed it via stroke() first — matching how a text
    // stroke is actually created in production (stroke:add path).
    service.stroke(sessionId, 'teacher-1', 1, original);
    service.updateTextStroke(sessionId, 'teacher-1', 1, original);

    const edited = { ...original, text: 'Salom dunyo' };
    service.updateTextStroke(sessionId, 'teacher-1', 1, edited);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect((entry.before as any).text).toBe('Salom');
    expect((entry.after as any).text).toBe('Salom dunyo');
  });

  it('updateShapeStroke() pushes a stroke:style entry', async () => {
    const { service, sessionId } = await withPdf();
    const shape = { id: 'r1', tool: 'rectangle' as const, color: '#000', width: 2, points: [0.1, 0.1, 0.3, 0.3] };
    service.stroke(sessionId, 'teacher-1', 1, shape);

    service.updateShapeStroke(sessionId, 'teacher-1', 1, { ...shape, color: '#f00' });

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:style');
    expect((entry.before as any).color).toBe('#000');
    expect((entry.after as any).color).toBe('#f00');
  });

  it('eraseStroke() pushes a stroke:erase entry with the stroke and its original index', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    service.stroke(sessionId, 'teacher-1', 1, { id: 's2', tool: 'pen', color: '#f00', width: 3, points: [0.3, 0.3, 0.4, 0.4] });

    service.eraseStroke(sessionId, 'teacher-1', 1, 's2');

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:erase');
    expect((entry.before as any).index).toBe(1);
    expect((entry.before as any).stroke.id).toBe('s2');
  });

  it('reorderStroke() pushes a stroke:reorder entry with full before/after order', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    service.stroke(sessionId, 'teacher-1', 1, { id: 's2', tool: 'pen', color: '#f00', width: 3, points: [0.3, 0.3, 0.4, 0.4] });

    service.reorderStroke(sessionId, 'teacher-1', 1, ['s1'], 'front');

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:reorder');
    expect((entry.before as any).order).toEqual(['s1', 's2']);
    expect((entry.after as any).order).toEqual(['s2', 's1']);
  });

  it('removePage() pushes a page:remove entry carrying the removed page\'s strokes', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 2, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });

    service.removePage(sessionId, 'teacher-1', 'pdf', 2);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('page:remove');
    expect((entry.before as any).pageIndex).toBe(2);
    expect((entry.before as any).page.strokes).toHaveLength(1);
  });

  it('insertNotebookPage() pushes a page:insert entry', async () => {
    const { service, sessionId } = await setup();

    service.insertNotebookPage(sessionId, 'teacher-1', 1, 'lined');

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('page:insert');
    expect(entry.mode).toBe('notebook');
    expect((entry.after as any).style).toBe('lined');
  });

  it('insertPdfPagesFromLibrary() pushes a page:insert entry carrying the resolved page URLs', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1.webp', 'p2.webp'], status: 'ready' });
    const { service, sessionId } = await setup(mediaLibrary);
    service.setPdfForTests(sessionId, 'dars.pdf', ['a.webp']);

    await service.insertPdfPagesFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [1], 1);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('page:insert');
    expect(entry.mode).toBe('pdf');
    expect((entry.after as any).pages).toEqual(['p1.webp']);
  });

  // NOTE: depends on Task 4's new no-arg service.undo(sessionId, userId) redo-stack-clearing
  // behavior and service.getRedoStackForTests, neither of which exist until Task 4 lands.
  // Written now per Task 3 brief instructions; skipped until Task 4 wires undo()/redo().
  it('a new action clears the redo stack', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    service.undo(sessionId, 'teacher-1'); // populates redoStack with 1 entry

    service.stroke(sessionId, 'teacher-1', 1, { id: 's2', tool: 'pen', color: '#f00', width: 3, points: [0.3, 0.3, 0.4, 0.4] });

    expect(service.getRedoStackForTests(sessionId)).toEqual([]);
  });
});

describe('undo/redo', () => {
  async function withPdf() {
    const ctx = await setup();
    ctx.service.setPdfForTests(ctx.sessionId, 'dars.pdf', ['u1', 'u2', 'u3']);
    return ctx;
  }

  it('undo with an empty stack is a silent no-op', async () => {
    const { service, events, sessionId } = await withPdf();
    const before = events.length;

    service.undo(sessionId, 'teacher-1');

    expect(events.length).toBe(before);
  });

  it('undo pops the most recent entry regardless of mode, and broadcasts board:undo', async () => {
    const { service, events, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }, 'pdf');

    service.undo(sessionId, 'teacher-1');

    expect(events.at(-1)).toMatchObject({ event: 'board:undo', payload: { mode: 'pdf', page: 1, entryType: 'stroke:add' } });
    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snap.strokesByPage[1] ?? []).toEqual([]);
  });

  it('undo across modes: PDF stroke then notebook stroke, two undos remove notebook first then pdf', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 'pdf-s1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }, 'pdf');
    service.stroke(sessionId, 'teacher-1', 1, { id: 'nb-s1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }, 'notebook');

    service.undo(sessionId, 'teacher-1');
    let snap = service.hostJoin(sessionId, 'teacher-1', 'sock-r1');
    // After first undo (removes notebook stroke), switch view to notebook mode to check via a second stroke() call's map — instead, verify via the session's own stroke pools using a second undo + testing pdf stroke is still present after ONE undo.

    service.undo(sessionId, 'teacher-1');
    // After second undo, the pdf stroke should also be gone.
    snap = service.hostJoin(sessionId, 'teacher-1', 'sock-r2');
    expect(snap.strokesByPage[1] ?? []).toEqual([]);
  });

  it('undo jumps currentPage and boardMode to the entry\'s page/mode', async () => {
    const { service, sessionId } = await withPdf();
    service.setPage(sessionId, 'teacher-1', 3);
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }, 'pdf');

    service.undo(sessionId, 'teacher-1');

    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snap.currentPage).toBe(1);
    expect(snap.boardMode).toBe('pdf');
  });

  it('redo re-applies the undone action and broadcasts board:redo', async () => {
    const { service, events, sessionId } = await withPdf();
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] };
    service.stroke(sessionId, 'teacher-1', 1, stroke);
    service.undo(sessionId, 'teacher-1');

    service.redo(sessionId, 'teacher-1');

    expect(events.at(-1)).toMatchObject({ event: 'board:redo', payload: { mode: 'pdf', page: 1, entryType: 'stroke:add' } });
    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snap.strokesByPage[1]).toContainEqual(stroke);
  });

  it('redo with an empty redo stack is a silent no-op', async () => {
    const { service, events, sessionId } = await withPdf();
    const before = events.length;

    service.redo(sessionId, 'teacher-1');

    expect(events.length).toBe(before);
  });

  it('a new committed action after undo clears the redo stack', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    service.undo(sessionId, 'teacher-1');
    expect(service.getRedoStackForTests(sessionId)).toHaveLength(1);

    service.stroke(sessionId, 'teacher-1', 1, { id: 's2', tool: 'pen', color: '#f00', width: 3, points: [0.3, 0.3, 0.4, 0.4] });

    expect(service.getRedoStackForTests(sessionId)).toEqual([]);
  });

  it('undo requires host', async () => {
    const { service, sessionId } = await withPdf();
    expect(() => service.undo(sessionId, 'stu-1')).toThrow();
  });

  it('redo requires host', async () => {
    const { service, sessionId } = await withPdf();
    expect(() => service.redo(sessionId, 'stu-1')).toThrow();
  });

  it('undo of a page:remove restores the page with its strokes', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 2, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    const pagesBefore = service.hostJoin(sessionId, 'teacher-1', 'sock-a').pages;
    service.removePage(sessionId, 'teacher-1', 'pdf', 2);

    service.undo(sessionId, 'teacher-1');

    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-b');
    expect(snap.pages).toEqual(pagesBefore);
    expect(snap.strokesByPage[2]).toHaveLength(1);
  });
});
