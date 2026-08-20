import { ClassroomSnapshotService } from './classroom-snapshot.service';
import type { ClassroomSession } from './classroom.types';

/**
 * autoSaveSnapshots decides WHICH sessions get written on the 15s tick and on shutdown.
 * Getting that filter wrong loses drawings outright, so it is pinned down here without
 * touching the database: persistBoardSnapshot is stubbed and we assert on who it was called
 * for.
 */
function session(overrides: Partial<ClassroomSession>): ClassroomSession {
  return {
    id: 'sess-1',
    hostSocketId: 'socket-1',
    strokesByPage: new Map(),
    pdfPages: [],
    ...overrides,
  } as unknown as ClassroomSession;
}

describe('autoSaveSnapshots — which sessions are written', () => {
  let service: ClassroomSnapshotService;
  let persisted: string[];

  beforeEach(() => {
    service = new ClassroomSnapshotService();
    persisted = [];
    jest
      .spyOn(service, 'persistBoardSnapshot')
      .mockImplementation(async (s: ClassroomSession) => {
        persisted.push(s.id);
      });
  });

  it('writes a session whose host is connected', async () => {
    const sessions = new Map([['a', session({ id: 'a', hostSocketId: 'sock' })]]);
    await service.autoSaveSnapshots(sessions);
    expect(persisted).toEqual(['a']);
  });

  // The host dropping is exactly when unsaved work is most at risk: the 1.5s persist debounce
  // may not have fired, and skipping these sessions means a restart loses those strokes.
  it('writes a disconnected host that still has unsaved strokes', async () => {
    const strokes = new Map([[1, [{ id: 's1' } as any]]]);
    const sessions = new Map([
      ['b', session({ id: 'b', hostSocketId: null, strokesByPage: strokes })],
    ]);
    await service.autoSaveSnapshots(sessions);
    expect(persisted).toEqual(['b']);
  });

  it('skips a disconnected host with nothing drawn', async () => {
    const sessions = new Map([['c', session({ id: 'c', hostSocketId: null })]]);
    await service.autoSaveSnapshots(sessions);
    expect(persisted).toEqual([]);
  });

  it('keeps saving the other sessions when one of them throws', async () => {
    jest.spyOn(service, 'persistBoardSnapshot').mockImplementation(async (s) => {
      if (s.id === 'bad') throw new Error('db down');
      persisted.push(s.id);
    });

    const sessions = new Map([
      ['bad', session({ id: 'bad' })],
      ['good', session({ id: 'good' })],
    ]);
    await service.autoSaveSnapshots(sessions);
    expect(persisted).toEqual(['good']);
  });
});
