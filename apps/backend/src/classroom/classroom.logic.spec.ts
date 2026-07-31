import {
  addStroke, undoStroke, clearPage, setPage, updateStrokePosition,
  attendanceStatusOnJoin, closeInterval, buildSnapshot, reorderStrokes,
  LATE_AFTER_MS, MAX_STROKE_POINTS, updateShapeStroke, isValidPage,
  removePageFromSession, strokeMapFor, resolveNotebookPageStyle,
  insertNotebookPageIntoSession, insertPdfPagesIntoSession,
  pushUndoEntry, applyStrokeAddInverse, applyStrokeEraseInverse,
  applyStrokeTransformInverse, applyStrokeStyleInverse, applyStrokeTextInverse,
  applyStrokeReorderInverse, applyPageRemoveInverse, applyPageInsertInverse,
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

  it('snapshot defaults notebookPageCount to 1 when not set on the session', () => {
    const session = makeSession();
    const snap = buildSnapshot(session);
    expect(snap.notebookPageCount).toBe(1);
  });

  it('snapshot reflects a custom notebookPageCount set on the session', () => {
    const session = makeSession();
    session.notebookPageCount = 6;
    const snap = buildSnapshot(session);
    expect(snap.notebookPageCount).toBe(6);
  });

  it('snapshot defaults notebookPageStyles to an empty object when not set', () => {
    const session = makeSession();
    const snap = buildSnapshot(session);
    expect(snap.notebookPageStyles).toEqual({});
  });

  it('snapshot reflects custom notebookPageStyles set on the session', () => {
    const session = makeSession();
    session.notebookPageStyles = { 2: 'lined' };
    const snap = buildSnapshot(session);
    expect(snap.notebookPageStyles).toEqual({ 2: 'lined' });
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

describe('resolveNotebookPageStyle', () => {
  it('resolveNotebookPageStyle falls back to session.notebookStyle when the page has no entry', () => {
    const session = makeSession();
    session.notebookStyle = 'plain';
    expect(resolveNotebookPageStyle(session, 3)).toBe('plain');
  });

  it('resolveNotebookPageStyle falls back to grid when neither is set', () => {
    const session = makeSession();
    expect(resolveNotebookPageStyle(session, 1)).toBe('grid');
  });

  it('resolveNotebookPageStyle prefers the per-page entry over the session-wide fallback', () => {
    const session = makeSession();
    session.notebookStyle = 'plain';
    session.notebookPageStyles = { 1: 'lined' };
    expect(resolveNotebookPageStyle(session, 1)).toBe('lined');
    expect(resolveNotebookPageStyle(session, 2)).toBe('plain');
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
    session.notebookPageStyles = { 1: 'grid', 2: 'lined', 3: 'plain', 4: 'grid' };
    session.currentPage = 1;

    const ok = removePageFromSession(session, 'notebook', 2);

    expect(ok).toBe(true);
    expect(session.notebookPageCount).toBe(3);
    expect(session.notebookPageStyles).toEqual({ 1: 'grid', 2: 'plain', 3: 'grid' });
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

describe('insertPdfPagesIntoSession', () => {
  it('insertPdfPagesIntoSession splices new pages after the given index', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png', 'c.png'];

    const ok = insertPdfPagesIntoSession(session, ['x.png', 'y.png'], 1);

    expect(ok).toBe(true);
    expect(session.pdfPages).toEqual(['a.png', 'x.png', 'y.png', 'b.png', 'c.png']);
  });

  it('insertPdfPagesIntoSession shifts strokes at and after the insertion point up by the inserted count', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png'];
    session.boardMode = 'pdf';
    const map = strokeMapFor(session, 'pdf');
    map.set(1, [{ id: 's1', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
    map.set(2, [{ id: 's2', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);

    insertPdfPagesIntoSession(session, ['new.png'], 1);

    const reindexed = strokeMapFor(session, 'pdf');
    expect(reindexed.get(1)?.[0]?.id).toBe('s1');
    expect(reindexed.has(2)).toBe(false);
    expect(reindexed.get(3)?.[0]?.id).toBe('s2');
  });

  it('insertPdfPagesIntoSession increments currentPage when inserting before or at it', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png'];
    session.currentPage = 2;

    insertPdfPagesIntoSession(session, ['x.png'], 1);

    expect(session.currentPage).toBe(3);
  });

  it('insertPdfPagesIntoSession leaves currentPage unchanged when inserting after it', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png'];
    session.currentPage = 1;

    insertPdfPagesIntoSession(session, ['x.png'], 2);

    expect(session.currentPage).toBe(1);
  });

  it('insertPdfPagesIntoSession refuses an out-of-range afterPageIndex', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png'];

    expect(insertPdfPagesIntoSession(session, ['x.png'], -1)).toBe(false);
    expect(insertPdfPagesIntoSession(session, ['x.png'], 3)).toBe(false);
  });

  it('insertPdfPagesIntoSession refuses an empty newPages array', () => {
    const session = makeSession();
    session.pdfPages = ['a.png'];

    expect(insertPdfPagesIntoSession(session, [], 0)).toBe(false);
  });
});

describe('insertNotebookPageIntoSession', () => {
  it('insertNotebookPageIntoSession increments notebookPageCount and sets the new page style', () => {
    const session = makeSession();
    session.boardMode = 'notebook';
    session.notebookPageCount = 3;

    const ok = insertNotebookPageIntoSession(session, 1, 'lined');

    expect(ok).toBe(true);
    expect(session.notebookPageCount).toBe(4);
    expect(session.notebookPageStyles?.[2]).toBe('lined');
  });

  it('insertNotebookPageIntoSession shifts later page styles up by one', () => {
    const session = makeSession();
    session.boardMode = 'notebook';
    session.notebookPageCount = 3;
    session.notebookPageStyles = { 2: 'plain', 3: 'lined' };

    insertNotebookPageIntoSession(session, 1, 'grid');

    expect(session.notebookPageStyles).toEqual({ 2: 'grid', 3: 'plain', 4: 'lined' });
  });

  it('insertNotebookPageIntoSession shifts strokes at and after the insertion point up by one', () => {
    const session = makeSession();
    session.boardMode = 'notebook';
    session.notebookPageCount = 3;
    const map = strokeMapFor(session, 'notebook');
    map.set(1, [{ id: 's1', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
    map.set(2, [{ id: 's2', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);

    insertNotebookPageIntoSession(session, 1, 'grid');

    const reindexed = strokeMapFor(session, 'notebook');
    expect(reindexed.get(1)?.[0]?.id).toBe('s1'); // unaffected, before insertion point
    expect(reindexed.has(2)).toBe(false); // new page's slot starts empty
    expect(reindexed.get(3)?.[0]?.id).toBe('s2'); // was page 2, now page 3
  });

  it('insertNotebookPageIntoSession increments currentPage when inserting before or at it', () => {
    const session = makeSession();
    session.boardMode = 'notebook';
    session.notebookPageCount = 3;
    session.currentPage = 2;

    insertNotebookPageIntoSession(session, 1, 'grid');

    expect(session.currentPage).toBe(3);
  });

  it('insertNotebookPageIntoSession leaves currentPage unchanged when inserting after it', () => {
    const session = makeSession();
    session.boardMode = 'notebook';
    session.notebookPageCount = 3;
    session.currentPage = 1;

    insertNotebookPageIntoSession(session, 2, 'grid');

    expect(session.currentPage).toBe(1);
  });

  it('insertNotebookPageIntoSession refuses an out-of-range afterPageIndex', () => {
    const session = makeSession();
    session.boardMode = 'notebook';
    session.notebookPageCount = 3;

    expect(insertNotebookPageIntoSession(session, -1, 'grid')).toBe(false);
    expect(insertNotebookPageIntoSession(session, 4, 'grid')).toBe(false);
  });

  it('insertNotebookPageIntoSession refuses an invalid style', () => {
    const session = makeSession();
    session.notebookPageCount = 3;

    expect(insertNotebookPageIntoSession(session, 1, 'bogus' as any)).toBe(false);
  });
});

describe('pushUndoEntry', () => {
  it('pushes an entry onto session.undoStack and clears redoStack', () => {
    const session = makeSession();
    session.redoStack = [{ type: 'stroke:add', mode: 'pdf', page: 1, pane: 'left', before: null, after: { stroke: makeStroke() } }];

    pushUndoEntry(session, { type: 'stroke:add', mode: 'pdf', page: 1, pane: 'left', before: null, after: { stroke: makeStroke() } });

    expect(session.undoStack).toHaveLength(1);
    expect(session.redoStack).toEqual([]);
  });

  it('drops the oldest entry once the stack exceeds 100 entries', () => {
    const session = makeSession();
    session.undoStack = Array.from({ length: 100 }, (_, i) => ({
      type: 'stroke:add' as const, mode: 'pdf' as const, page: 1, pane: 'left' as const,
      before: null, after: { stroke: makeStroke({ id: `s-${i}` }) },
    }));

    pushUndoEntry(session, { type: 'stroke:add', mode: 'pdf', page: 1, pane: 'left', before: null, after: { stroke: makeStroke({ id: 's-new' }) } });

    expect(session.undoStack).toHaveLength(100);
    expect(session.undoStack[0].after).toMatchObject({ stroke: { id: 's-1' } }); // s-0 dropped
    expect(session.undoStack[99].after).toMatchObject({ stroke: { id: 's-new' } });
  });
});

describe('applyStrokeAddInverse', () => {
  it('undo removes the added stroke by id', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 's1' });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeAddInverse(session, 'pdf', 1, { stroke }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([]);
  });

  it('redo re-adds the stroke', () => {
    const session = makeSession();
    strokeMapFor(session, 'pdf').set(1, []);
    const stroke = makeStroke({ id: 's1' });

    applyStrokeAddInverse(session, 'pdf', 1, { stroke }, 'redo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([stroke]);
  });
});

describe('applyStrokeEraseInverse', () => {
  it('undo re-inserts the erased stroke at its original index', () => {
    const session = makeSession();
    const s1 = makeStroke({ id: 's1' });
    const s2 = makeStroke({ id: 's2' });
    strokeMapFor(session, 'pdf').set(1, [s1]); // s2 already erased, was at index 1

    applyStrokeEraseInverse(session, 'pdf', 1, { stroke: s2, index: 1 }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([s1, s2]);
  });

  it('redo erases the stroke again by id', () => {
    const session = makeSession();
    const s1 = makeStroke({ id: 's1' });
    const s2 = makeStroke({ id: 's2' });
    strokeMapFor(session, 'pdf').set(1, [s1, s2]);

    applyStrokeEraseInverse(session, 'pdf', 1, { stroke: s2, index: 1 }, 'redo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([s1]);
  });
});

describe('applyStrokeTransformInverse', () => {
  it('undo restores the stroke\'s prior points/rotation', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 's1', points: [0.5, 0.5, 0.6, 0.6], rotation: 45 });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeTransformInverse(session, 'pdf', 1, {
      strokeId: 's1',
      before: { points: [0.1, 0.1, 0.2, 0.2], rotation: 0 },
      after: { points: [0.5, 0.5, 0.6, 0.6], rotation: 45 },
    }, 'undo');

    const result = strokeMapFor(session, 'pdf').get(1)!.find((x) => x.id === 's1')!;
    expect(result.points).toEqual([0.1, 0.1, 0.2, 0.2]);
    expect(result.rotation).toBe(0);
  });

  it('redo re-applies the post-gesture points/rotation', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 's1', points: [0.1, 0.1, 0.2, 0.2], rotation: 0 });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeTransformInverse(session, 'pdf', 1, {
      strokeId: 's1',
      before: { points: [0.1, 0.1, 0.2, 0.2], rotation: 0 },
      after: { points: [0.5, 0.5, 0.6, 0.6], rotation: 45 },
    }, 'redo');

    const result = strokeMapFor(session, 'pdf').get(1)!.find((x) => x.id === 's1')!;
    expect(result.points).toEqual([0.5, 0.5, 0.6, 0.6]);
    expect(result.rotation).toBe(45);
  });
});

describe('applyStrokeStyleInverse', () => {
  it('undo restores the stroke\'s prior style fields, leaving unrelated fields untouched', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 's1', color: '#ff0000', width: 4 });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeStyleInverse(session, 'pdf', 1, {
      strokeId: 's1',
      before: { color: '#0000ff' },
      after: { color: '#ff0000' },
    }, 'undo');

    const result = strokeMapFor(session, 'pdf').get(1)!.find((x) => x.id === 's1')!;
    expect(result.color).toBe('#0000ff');
    expect(result.width).toBe(4); // untouched
  });
});

describe('applyStrokeTextInverse', () => {
  it('undo removes a newly-created text stroke when before is null', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 't1', tool: 'text', text: 'Salom' });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeTextInverse(session, 'pdf', 1, { strokeId: 't1', before: null, after: stroke }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([]);
  });

  it('undo restores the full prior stroke when editing existing text', () => {
    const session = makeSession();
    const before = makeStroke({ id: 't1', tool: 'text', text: 'Salom' });
    const after = makeStroke({ id: 't1', tool: 'text', text: 'Salom dunyo' });
    strokeMapFor(session, 'pdf').set(1, [after]);

    applyStrokeTextInverse(session, 'pdf', 1, { strokeId: 't1', before, after }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)![0].text).toBe('Salom');
  });

  it('redo re-applies the committed text stroke', () => {
    const session = makeSession();
    const before = makeStroke({ id: 't1', tool: 'text', text: 'Salom' });
    const after = makeStroke({ id: 't1', tool: 'text', text: 'Salom dunyo' });
    strokeMapFor(session, 'pdf').set(1, [before]);

    applyStrokeTextInverse(session, 'pdf', 1, { strokeId: 't1', before, after }, 'redo');

    expect(strokeMapFor(session, 'pdf').get(1)![0].text).toBe('Salom dunyo');
  });
});

describe('applyStrokeReorderInverse', () => {
  it('undo restores the prior stroke order', () => {
    const session = makeSession();
    const s1 = makeStroke({ id: 's1' });
    const s2 = makeStroke({ id: 's2' });
    strokeMapFor(session, 'pdf').set(1, [s2, s1]); // reordered state

    applyStrokeReorderInverse(session, 'pdf', 1, { before: { order: ['s1', 's2'] }, after: { order: ['s2', 's1'] } }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)!.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('applyPageRemoveInverse', () => {
  it('undo re-inserts a removed pdf page with its strokes at the original index', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'c.png']; // b.png was removed from index 1 (0-indexed)
    const map = strokeMapFor(session, 'pdf');
    map.set(2, [makeStroke({ id: 's-on-c' })]); // was page 2 (c.png) after removal

    applyPageRemoveInverse(session, 'pdf', {
      pageIndex: 2, // 1-indexed pageIndex that was removed
      page: { url: 'b.png', strokes: [makeStroke({ id: 's-on-b' })] },
    }, 'undo');

    expect(session.pdfPages).toEqual(['a.png', 'b.png', 'c.png']);
    const reindexed = strokeMapFor(session, 'pdf');
    expect(reindexed.get(2)).toEqual([makeStroke({ id: 's-on-b' })]);
    expect(reindexed.get(3)).toEqual([makeStroke({ id: 's-on-c' })]);
  });

  it('redo removes the page again via removePageFromSession', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png', 'c.png'];

    applyPageRemoveInverse(session, 'pdf', {
      pageIndex: 2,
      page: { url: 'b.png', strokes: [] },
    }, 'redo');

    expect(session.pdfPages).toEqual(['a.png', 'c.png']);
  });

  it('undo re-inserts a removed notebook page with its style', () => {
    const session = makeSession();
    session.notebookPageCount = 3;
    session.notebookPageStyles = { 1: 'grid', 2: 'plain' }; // page 2 (lined) was removed

    applyPageRemoveInverse(session, 'notebook', {
      pageIndex: 2,
      page: { strokes: [], notebookStyle: 'lined' },
    }, 'undo');

    expect(session.notebookPageCount).toBe(4);
    expect(session.notebookPageStyles).toEqual({ 1: 'grid', 2: 'lined', 3: 'plain' });
  });
});

describe('applyPageInsertInverse', () => {
  it('undo removes an inserted pdf page via removePageFromSession', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'x.png', 'b.png']; // x.png inserted after index 1 (0-indexed)

    applyPageInsertInverse(session, 'pdf', { afterPageIndex: 1, pages: ['x.png'] }, 'undo');

    expect(session.pdfPages).toEqual(['a.png', 'b.png']);
  });

  it('redo re-inserts the same pdf page(s) at the same position', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png'];

    applyPageInsertInverse(session, 'pdf', { afterPageIndex: 1, pages: ['x.png'] }, 'redo');

    expect(session.pdfPages).toEqual(['a.png', 'x.png', 'b.png']);
  });

  it('undo removes an inserted notebook page', () => {
    const session = makeSession();
    session.notebookPageCount = 4;

    applyPageInsertInverse(session, 'notebook', { afterPageIndex: 2, style: 'lined' }, 'undo');

    expect(session.notebookPageCount).toBe(3);
  });

  it('redo re-inserts the same notebook page with the same style', () => {
    const session = makeSession();
    session.notebookPageCount = 3;

    applyPageInsertInverse(session, 'notebook', { afterPageIndex: 2, style: 'lined' }, 'redo');

    expect(session.notebookPageCount).toBe(4);
    expect(session.notebookPageStyles?.[3]).toBe('lined');
  });
});
