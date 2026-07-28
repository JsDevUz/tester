import {
  addStroke, undoStroke, clearPage, setPage, updateStrokePosition,
  attendanceStatusOnJoin, closeInterval, buildSnapshot, reorderStrokes,
  LATE_AFTER_MS, MAX_STROKE_POINTS, updateShapeStroke, isValidPage,
  removePageFromSession, strokeMapFor,
} from './classroom.logic';
import { ClassroomSession, ClassroomStroke, ClassroomParticipant } from './classroom.types';

function makeSession(overrides: Partial<ClassroomSession> = {}): ClassroomSession {
  return {
    id: 'cs-1',
    courseId: 'c-1',
    courseName: 'Kurs A',
    isFree: false,
    hostUserId: 'host-1',
    hostSocketId: 'sock-host',
    pdfName: 'dars.pdf',
    pdfPages: ['p1.webp', 'p2.webp', 'p3.webp'],
    currentPage: 1,
    strokesByPage: new Map(),
    participants: new Map(),
    startedAtMs: 1_000_000,
    hostDisconnectTimer: null,
    zoom: 1,
    scroll: null,
    ...overrides,
  };
}

function makeStroke(overrides: Partial<ClassroomStroke> = {}): ClassroomStroke {
  return { id: 's-1', tool: 'pen', color: '#ef4444', width: 3, points: [0.1, 0.1, 0.2, 0.2], ...overrides };
}

function makeParticipant(overrides: Partial<ClassroomParticipant> = {}): ClassroomParticipant {
  return {
    userId: 'u-1', name: 'Ali', enrollmentId: 'e-1',
    socketId: 'sock-1', joinedAtMs: 1_000_000, totalSeconds: 0, status: 'present',
    ...overrides,
  };
}

describe('addStroke', () => {
  it('togri stroke sahifa royxatiga qoshiladi', () => {
    const s = makeSession();
    expect(addStroke(s, 2, makeStroke())).toBe(true);
    expect(s.strokesByPage.get(2)!.length).toBe(1);
  });

  it('points toq sonda bolsa rad etiladi', () => {
    const s = makeSession();
    expect(addStroke(s, 1, makeStroke({ points: [0.1, 0.2, 0.3] }))).toBe(false);
  });

  it('points bosh bolsa rad etiladi', () => {
    const s = makeSession();
    expect(addStroke(s, 1, makeStroke({ points: [] }))).toBe(false);
  });

  it('0..1 dan tashqari koordinata rad etiladi', () => {
    const s = makeSession();
    expect(addStroke(s, 1, makeStroke({ points: [0.5, 1.5] }))).toBe(false);
    expect(addStroke(s, 1, makeStroke({ points: [-0.1, 0.5] }))).toBe(false);
  });

  it('juda kop nuqta rad etiladi', () => {
    const s = makeSession();
    const points = Array.from({ length: MAX_STROKE_POINTS * 2 + 2 }, () => 0.5);
    expect(addStroke(s, 1, makeStroke({ points }))).toBe(false);
  });

  it('mavjud bolmagan sahifaga rad etiladi', () => {
    const s = makeSession();
    expect(addStroke(s, 0, makeStroke())).toBe(false);
    expect(addStroke(s, 4, makeStroke())).toBe(false);
  });
});

describe('updateShapeStroke (to\'liq geometriya update)', () => {
  it('lasso resize qilgan pen stroke barcha nuqtalari va width bilan yangilanadi', () => {
    const s = makeSession();
    const original = makeStroke();
    expect(addStroke(s, 1, original)).toBe(true);
    const resized = { ...original, width: 2, points: [0.2, 0.2, 0.25, 0.25] };

    expect(updateShapeStroke(s, 1, resized)).toBe(true);
    expect(s.strokesByPage.get(1)?.[0]).toEqual(resized);
  });
});

describe('undoStroke', () => {
  it('oxirgi stroke id sini qaytaradi va ochiradi', () => {
    const s = makeSession();
    addStroke(s, 1, makeStroke({ id: 'a' }));
    addStroke(s, 1, makeStroke({ id: 'b' }));
    expect(undoStroke(s, 1)).toBe('b');
    expect(s.strokesByPage.get(1)!.map((x) => x.id)).toEqual(['a']);
  });

  it('bosh sahifada null', () => {
    const s = makeSession();
    expect(undoStroke(s, 1)).toBeNull();
  });
});

describe('reorderStrokes', () => {
  function makeFour(s: ClassroomSession) {
    addStroke(s, 1, makeStroke({ id: 'a' }));
    addStroke(s, 1, makeStroke({ id: 'b' }));
    addStroke(s, 1, makeStroke({ id: 'c' }));
    addStroke(s, 1, makeStroke({ id: 'd' }));
  }
  function ids(s: ClassroomSession) {
    return s.strokesByPage.get(1)!.map((x) => x.id);
  }

  it('front: tanlangan elementlarni royxat oxiriga (eng tepaga) kochiradi, ozaro tartib saqlanadi', () => {
    const s = makeSession();
    makeFour(s);
    expect(reorderStrokes(s, 1, ['b', 'a'], 'front')).toBe(true);
    expect(ids(s)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('back: tanlangan elementlarni royxat boshiga (eng pastga) kochiradi, ozaro tartib saqlanadi', () => {
    const s = makeSession();
    makeFour(s);
    expect(reorderStrokes(s, 1, ['c', 'd'], 'back')).toBe(true);
    expect(ids(s)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('forward: har bir elementni bittaga oldinga (keyingi qoshniga) siljitadi', () => {
    const s = makeSession();
    makeFour(s);
    expect(reorderStrokes(s, 1, ['b'], 'forward')).toBe(true);
    expect(ids(s)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('forward: eng oxirgi element allaqachon tepada bolsa ozgarmaydi', () => {
    const s = makeSession();
    makeFour(s);
    expect(reorderStrokes(s, 1, ['d'], 'forward')).toBe(true);
    expect(ids(s)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('backward: har bir elementni bittaga orqaga (oldingi qoshniga) siljitadi', () => {
    const s = makeSession();
    makeFour(s);
    expect(reorderStrokes(s, 1, ['c'], 'backward')).toBe(true);
    expect(ids(s)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('backward: eng birinchi element allaqachon pastda bolsa ozgarmaydi', () => {
    const s = makeSession();
    makeFour(s);
    expect(reorderStrokes(s, 1, ['a'], 'backward')).toBe(true);
    expect(ids(s)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('forward guruh holatida qoshni tanlangan elementlar orasidan otkazib yuboriladi', () => {
    const s = makeSession();
    makeFour(s);
    // b va c qoshni tanlangan — forward'da ular bir-birini "to'sib" turmasligi kerak,
    // d bilan almashadi (c, keyin b navbat bilan)
    expect(reorderStrokes(s, 1, ['b', 'c'], 'forward')).toBe(true);
    expect(ids(s)).toEqual(['a', 'd', 'b', 'c']);
  });

  it("mavjud bo'lmagan strokeId uchun rad etiladi", () => {
    const s = makeSession();
    makeFour(s);
    expect(reorderStrokes(s, 1, ['zzz'], 'front')).toBe(false);
    expect(ids(s)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('bosh strokeIds royxati rad etiladi', () => {
    const s = makeSession();
    makeFour(s);
    expect(reorderStrokes(s, 1, [], 'front')).toBe(false);
  });

  it("mavjud bo'lmagan sahifa uchun rad etiladi", () => {
    const s = makeSession();
    makeFour(s);
    expect(reorderStrokes(s, 5, ['a'], 'front')).toBe(false);
  });
});

describe('updateStrokePosition', () => {
  it('freehand stroke kochirilganda barcha nuqtalar birga siljiydi', () => {
    const s = makeSession();
    addStroke(s, 1, makeStroke({ id: 'pen-1', points: [0.2, 0.2, 0.3, 0.4, 0.4, 0.5] }));
    expect(updateStrokePosition(s, 1, 'pen-1', 0.4, 0.3)).toBe(true);
    expect(s.strokesByPage.get(1)?.[0].points).toEqual([
      expect.closeTo(0.4), expect.closeTo(0.3), expect.closeTo(0.5),
      expect.closeTo(0.5), expect.closeTo(0.6), expect.closeTo(0.6),
    ]);
  });
});

describe('clearPage', () => {
  it('sahifadagi barcha strokelarni ochiradi', () => {
    const s = makeSession();
    addStroke(s, 1, makeStroke({ id: 'a' }));
    addStroke(s, 1, makeStroke({ id: 'b' }));
    clearPage(s, 1);
    expect(s.strokesByPage.get(1) ?? []).toEqual([]);
  });
});

describe('setPage', () => {
  it('chegara ichida sahifani ozgartiradi', () => {
    const s = makeSession();
    expect(setPage(s, 3)).toBe(true);
    expect(s.currentPage).toBe(3);
  });

  it('chegaradan tashqarida rad etiladi', () => {
    const s = makeSession();
    expect(setPage(s, 0)).toBe(false);
    expect(setPage(s, 4)).toBe(false);
    expect(s.currentPage).toBe(1);
  });

  it('pdf yoq bolsa rad etiladi', () => {
    const s = makeSession({ pdfPages: [] });
    expect(setPage(s, 1)).toBe(false);
  });
});

describe('attendanceStatusOnJoin', () => {
  it('10 daqiqagacha present', () => {
    expect(attendanceStatusOnJoin(0, LATE_AFTER_MS)).toBe('present');
    expect(attendanceStatusOnJoin(0, 0)).toBe('present');
  });

  it('10 daqiqadan kech late', () => {
    expect(attendanceStatusOnJoin(0, LATE_AFTER_MS + 1)).toBe('late');
  });
});

describe('closeInterval', () => {
  it('interval soniyalarini qoshadi va joinedAtMs ni tozalaydi', () => {
    const p = makeParticipant({ joinedAtMs: 1_000_000, totalSeconds: 10 });
    const added = closeInterval(p, 1_000_000 + 65_000);
    expect(added).toBe(65);
    expect(p.totalSeconds).toBe(75);
    expect(p.joinedAtMs).toBeNull();
  });

  it('ochiq interval bolmasa 0', () => {
    const p = makeParticipant({ joinedAtMs: null, totalSeconds: 10 });
    expect(closeInterval(p, 2_000_000)).toBe(0);
    expect(p.totalSeconds).toBe(10);
  });
});

describe('buildSnapshot', () => {
  it('sessiya holatini toliq qaytaradi', () => {
    const s = makeSession();
    addStroke(s, 2, makeStroke({ id: 'a' }));
    s.participants.set('u-1', makeParticipant());
    s.participants.set('u-2', makeParticipant({ userId: 'u-2', name: 'Vali', socketId: null, status: 'absent' }));
    const snap = buildSnapshot(s);
    expect(snap.sessionId).toBe('cs-1');
    expect(snap.pages).toEqual(['p1.webp', 'p2.webp', 'p3.webp']);
    expect(snap.currentPage).toBe(1);
    expect(snap.strokesByPage[2].length).toBe(1);
    expect(snap.participants).toEqual([
      { userId: 'u-1', name: 'Ali', online: true, status: 'present' },
      { userId: 'u-2', name: 'Vali', online: false, status: 'absent' },
    ]);
    expect(snap.hostOnline).toBe(true);
    expect(snap.classroomTheme).toBe('light');
  });

  it('host socketi yoq bolsa hostOnline false', () => {
    const s = makeSession({ hostSocketId: null });
    expect(buildSnapshot(s).hostOnline).toBe(false);
  });

  it('snapshot defaults splitRatio to 0.5 when not set on the session', () => {
    const s = makeSession();
    const snap = buildSnapshot(s);
    expect(snap.splitRatio).toBe(0.5);
  });

  it('snapshot reflects a custom splitRatio set on the session', () => {
    const s = makeSession();
    s.splitRatio = 0.65;
    const snap = buildSnapshot(s);
    expect(snap.splitRatio).toBe(0.65);
  });

  it('snapshot defaults notebookPageCount to 4 when not set on the session', () => {
    const session = makeSession();
    const snap = buildSnapshot(session);
    expect(snap.notebookPageCount).toBe(4);
  });

  it('snapshot reflects a custom notebookPageCount set on the session', () => {
    const session = makeSession();
    session.notebookPageCount = 6;
    const snap = buildSnapshot(session);
    expect(snap.notebookPageCount).toBe(6);
  });
});

describe('isValidPage', () => {
  it('isValidPage uses session.notebookPageCount for notebook mode', () => {
    const session = makeSession();
    session.boardMode = 'notebook';
    session.notebookPageCount = 2;
    expect(isValidPage(session, 2)).toBe(true);
    expect(isValidPage(session, 3)).toBe(false);
  });
});

describe('removePageFromSession', () => {
  it('removePageFromSession removes a pdf page and reindexes strokes', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png', 'c.png'];
    session.boardMode = 'pdf';
    session.currentPage = 3;
    const map = strokeMapFor(session, 'pdf');
    map.set(1, [{ id: 's1', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
    map.set(2, [{ id: 's2', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
    map.set(3, [{ id: 's3', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);

    const ok = removePageFromSession(session, 'pdf', 2);

    expect(ok).toBe(true);
    expect(session.pdfPages).toEqual(['a.png', 'c.png']);
    const reindexed = strokeMapFor(session, 'pdf');
    expect(reindexed.get(1)?.[0]?.id).toBe('s1');
    expect(reindexed.get(2)?.[0]?.id).toBe('s3'); // was page 3, now page 2
    expect(reindexed.has(3)).toBe(false);
    expect(session.currentPage).toBe(2); // was 3 (last page), clamped to new last page
  });

  it('removePageFromSession removes a notebook page and decrements notebookPageCount', () => {
    const session = makeSession();
    session.boardMode = 'notebook';
    session.notebookPageCount = 4;
    session.currentPage = 1;

    const ok = removePageFromSession(session, 'notebook', 2);

    expect(ok).toBe(true);
    expect(session.notebookPageCount).toBe(3);
  });

  it('removePageFromSession refuses to remove the last remaining page', () => {
    const session = makeSession();
    session.pdfPages = ['only.png'];

    const ok = removePageFromSession(session, 'pdf', 1);

    expect(ok).toBe(false);
    expect(session.pdfPages).toEqual(['only.png']);
  });

  it('removePageFromSession refuses an out-of-range pageIndex', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png'];

    expect(removePageFromSession(session, 'pdf', 5)).toBe(false);
    expect(removePageFromSession(session, 'pdf', 0)).toBe(false);
  });

  it('removePageFromSession decrements currentPage when a page before it is removed', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png', 'c.png'];
    session.currentPage = 3;

    removePageFromSession(session, 'pdf', 1);

    expect(session.currentPage).toBe(2);
  });

  it('removePageFromSession leaves currentPage unchanged when a later page is removed', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png', 'c.png'];
    session.currentPage = 1;

    removePageFromSession(session, 'pdf', 3);

    expect(session.currentPage).toBe(1);
  });

  it('removePageFromSession clamps currentPage when the active last page is removed', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png', 'c.png'];
    session.boardMode = 'pdf';
    session.currentPage = 3;

    const ok = removePageFromSession(session, 'pdf', 3);

    expect(ok).toBe(true);
    expect(session.pdfPages).toEqual(['a.png', 'b.png']);
    expect(session.currentPage).toBe(2); // was on the removed (last) page, clamps to new last page
  });

  it('removePageFromSession only touches the specified mode, leaving the other mode untouched', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png', 'c.png'];
    session.notebookPageCount = 4;
    session.boardMode = 'pdf';

    const pdfMap = strokeMapFor(session, 'pdf');
    pdfMap.set(1, [{ id: 'pdf-s1', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
    const notebookMap = strokeMapFor(session, 'notebook');
    notebookMap.set(1, [{ id: 'nb-s1', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
    notebookMap.set(2, [{ id: 'nb-s2', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
    session.boardMode = 'pdf';

    const ok = removePageFromSession(session, 'pdf', 1);

    expect(ok).toBe(true);
    expect(session.pdfPages).toEqual(['b.png', 'c.png']);
    expect(session.notebookPageCount).toBe(4); // untouched
    const notebookMapAfter = strokeMapFor(session, 'notebook');
    expect(notebookMapAfter.get(1)?.[0]?.id).toBe('nb-s1'); // untouched, not reindexed
    expect(notebookMapAfter.get(2)?.[0]?.id).toBe('nb-s2'); // untouched, not reindexed
  });
});
