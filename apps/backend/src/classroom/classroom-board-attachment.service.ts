import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { classSessions, mediaAssets } from '../db/schema';
import { MediaLibraryService } from '../upload/media-library.service';
import {
  buildSnapshot,
  insertPdfPagesIntoSession,
  pushUndoEntry,
} from './classroom.logic';
import {
  ClassroomBoardMode,
  ClassroomBroadcaster,
  ClassroomNotebookOrientation,
  ClassroomNotebookStyle,
  ClassroomSession,
  ClassroomStroke,
} from './classroom.types';

@Injectable()
export class ClassroomBoardAttachmentService {
  constructor(private readonly mediaLibrary: MediaLibraryService) {}

  applyPdf(s: ClassroomSession, pdfName: string, pages: string[]) {
    if (!s.strokesByMode) {
      s.strokesByMode = new Map([[s.boardMode ?? 'pdf', s.strokesByPage]]);
    }
    const pdfStrokes = new Map<number, ClassroomStroke[]>();
    s.strokesByMode.set('pdf', pdfStrokes);
    s.pdfName = pdfName;
    s.pdfPages = pages;
    s.currentPage = 1;
    s.boardMode = 'pdf';
    s.boardLayout = 'single';
    s.leftBoardMode = 'pdf';
    s.rightBoardMode = 'pdf';
    s.strokesByPage = pdfStrokes;
    s.scroll = null;
    s.rightScroll = null;
  }

  async attachPdfFromLibrary(
    s: ClassroomSession,
    teacherId: string,
    teacherRole: string,
    mediaAssetId: string,
    pageNumbers: number[],
    buildBoardSnapshot: (s: ClassroomSession) => any,
    createBoardVersionCheckpoint: (sessionId: string, customLabel?: string, explicitSnapshot?: any) => Promise<void>,
    recordHistoryEvent: (s: ClassroomSession, type: string, payload: unknown) => void,
    broadcaster: ClassroomBroadcaster,
    onBoardMutation: (s: ClassroomSession) => void,
  ): Promise<{ pdfName: string; pages: string[] }> {
    if (s.hostUserId !== teacherId) {
      throw new ForbiddenException('Faqat dars ustozi PDF yuklay oladi');
    }

    const { pages: allPages, status } = await this.mediaLibrary.getPdfPages(
      mediaAssetId,
      teacherId,
      teacherRole,
    );
    if (status !== 'ready') {
      throw new ConflictException(
        'PDF hali tayyor emas — konvertatsiya tugashini kuting',
      );
    }
    if (allPages.length === 0) {
      throw new ConflictException('PDF sahifalari topilmadi');
    }

    const uniqueSorted = [...new Set(pageNumbers)].sort((a, b) => a - b);
    if (
      uniqueSorted.some(
        (n) => !Number.isInteger(n) || n < 1 || n > allPages.length,
      )
    ) {
      throw new ConflictException("Noto'g'ri sahifa raqami tanlangan");
    }
    const selectedPages = uniqueSorted.map((n) => allPages[n - 1]);

    const asset = await db.query.mediaAssets.findFirst({
      where: eq(mediaAssets.id, mediaAssetId),
    });
    const pdfName = asset?.originalName ?? 'dars.pdf';

    // Katta o'zgarishdan (yangi PDF yuklashdan) oldin mavjud holatni versiya qilib saqlaymiz:
    const snapshotBeforePdf = buildBoardSnapshot(s);
    let prevStrokes = 0;
    if (s.strokesByMode) {
      for (const map of s.strokesByMode.values()) {
        for (const list of map.values()) prevStrokes += list?.length ?? 0;
      }
    }
    if (prevStrokes === 0 && s.strokesByPage) {
      for (const list of s.strokesByPage.values()) prevStrokes += list?.length ?? 0;
    }
    if (prevStrokes > 0 || (s.pdfPages && s.pdfPages.length > 0)) {
      const label = s.pdfName ? `PDF almashtirishdan oldin (${s.pdfName})` : 'Yangi PDF yuklashdan oldin';
      void createBoardVersionCheckpoint(s.id, label, snapshotBeforePdf).catch(() => {});
      if (s.attachedBoardId) {
        void createBoardVersionCheckpoint(s.attachedBoardId, label, snapshotBeforePdf).catch(() => {});
      }
    }

    await db
      .update(classSessions)
      .set({ pdfName, pdfPages: selectedPages })
      .where(eq(classSessions.id, s.id));

    this.applyPdf(s, pdfName, selectedPages);
    const payload = { pdfName: s.pdfName, pages: selectedPages, currentPage: 1 };
    recordHistoryEvent(s, 'pdf:set', payload);
    broadcaster.toRoom(s.id, 'pdf:set', payload);
    onBoardMutation(s);
    return { pdfName, pages: selectedPages };
  }

  async attachBoardToSession(
    s: ClassroomSession,
    teacherId: string,
    boardId: string,
    sessions: Map<string, ClassroomSession>,
    buildBoardSnapshot: (s: ClassroomSession) => any,
    createBoardVersionCheckpoint: (sessionId: string, customLabel?: string, explicitSnapshot?: any) => Promise<void>,
    recordHistoryEvent: (s: ClassroomSession, type: string, payload: unknown) => void,
    broadcaster: ClassroomBroadcaster,
  ): Promise<{ ok: boolean; state?: any }> {
    if (s.hostUserId !== teacherId) {
      throw new ForbiddenException('Faqat dars ustozi doska biriktira oladi');
    }

    // Doska biriktirishdan oldin mavjud holatni versiya qilib saqlaymiz:
    const snapshotBeforeAttach = buildBoardSnapshot(s);
    let prevStrokes = 0;
    if (s.strokesByMode) {
      for (const map of s.strokesByMode.values()) {
        for (const list of map.values()) prevStrokes += list?.length ?? 0;
      }
    }
    if (prevStrokes === 0 && s.strokesByPage) {
      for (const list of s.strokesByPage.values()) prevStrokes += list?.length ?? 0;
    }
    if (prevStrokes > 0 || (s.pdfPages && s.pdfPages.length > 0)) {
      void createBoardVersionCheckpoint(s.id, 'Doska biriktirishdan oldin', snapshotBeforeAttach).catch(() => {});
    }

    const boardRow = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, boardId),
    });
    if (!boardRow) throw new NotFoundException('Doska topilmadi');
    if (boardRow.teacherId !== teacherId) {
      throw new ForbiddenException('Bu doska sizga tegishli emas');
    }

    const memoryBoard = sessions.get(boardId);
    let pdfName = boardRow.pdfName;
    let pages = (boardRow.pdfPages as string[]) ?? [];
    let boardMode: ClassroomBoardMode = 'pdf';
    let boardLayout: 'single' | 'split' = 'single';
    let leftBoardMode: ClassroomBoardMode = 'pdf';
    let rightBoardMode: ClassroomBoardMode = 'pdf';
    let notebookStyle: ClassroomNotebookStyle = 'grid';
    let notebookPageCount = 1;
    let notebookPageStyles: Record<number, ClassroomNotebookStyle> = {};
    let notebookPageOrientations: Record<number, ClassroomNotebookOrientation> = {};
    let strokesByMode = new Map<ClassroomBoardMode, Map<number, ClassroomStroke[]>>([
      ['pdf', new Map()],
      ['notebook', new Map()],
    ]);

    if (memoryBoard) {
      pdfName = memoryBoard.pdfName;
      pages = memoryBoard.pdfPages;
      boardMode = memoryBoard.boardMode ?? 'pdf';
      boardLayout = memoryBoard.boardLayout ?? 'single';
      leftBoardMode = memoryBoard.leftBoardMode ?? boardMode;
      rightBoardMode = memoryBoard.rightBoardMode ?? boardMode;
      notebookStyle = memoryBoard.notebookStyle ?? 'grid';
      notebookPageCount = memoryBoard.notebookPageCount ?? 1;
      notebookPageStyles = { ...(memoryBoard.notebookPageStyles ?? {}) };
      notebookPageOrientations = {
        ...(memoryBoard.notebookPageOrientations ?? {}),
      };
      if (memoryBoard.strokesByMode) {
        for (const [mode, map] of memoryBoard.strokesByMode.entries()) {
          const newMap = new Map<number, ClassroomStroke[]>();
          for (const [p, list] of map.entries()) {
            newMap.set(p, [...list]);
          }
          strokesByMode.set(mode, newMap);
        }
      } else {
        const primaryMap = new Map<number, ClassroomStroke[]>();
        for (const [p, list] of memoryBoard.strokesByPage.entries()) {
          primaryMap.set(p, [...list]);
        }
        strokesByMode.set(boardMode, primaryMap);
      }
    } else if (boardRow.boardSnapshot) {
      const snap = boardRow.boardSnapshot as any;
      pdfName = snap.pdfName ?? pdfName;
      pages = snap.pages ?? pages;
      boardMode = snap.boardMode ?? 'pdf';
      boardLayout = snap.boardLayout ?? 'single';
      leftBoardMode = snap.leftBoardMode ?? boardMode;
      rightBoardMode = snap.rightBoardMode ?? boardMode;
      notebookStyle = snap.notebookStyle ?? 'grid';
      notebookPageCount = snap.notebookPageCount ?? 1;
      notebookPageStyles = { ...(snap.notebookPageStyles ?? {}) };
      notebookPageOrientations = { ...(snap.notebookPageOrientations ?? {}) };
      if (snap.strokesByMode) {
        if (snap.strokesByMode.pdf) {
          const pdfMap = new Map<number, ClassroomStroke[]>();
          for (const [p, list] of Object.entries(snap.strokesByMode.pdf)) {
            pdfMap.set(Number(p), list as ClassroomStroke[]);
          }
          strokesByMode.set('pdf', pdfMap);
        }
        if (snap.strokesByMode.notebook) {
          const nbMap = new Map<number, ClassroomStroke[]>();
          for (const [p, list] of Object.entries(snap.strokesByMode.notebook)) {
            nbMap.set(Number(p), list as ClassroomStroke[]);
          }
          strokesByMode.set('notebook', nbMap);
        }
      } else if (snap.strokesByPage) {
        const primaryMap = new Map<number, ClassroomStroke[]>();
        for (const [p, list] of Object.entries(snap.strokesByPage)) {
          primaryMap.set(Number(p), list as ClassroomStroke[]);
        }
        strokesByMode.set(boardMode, primaryMap);
      }
    }

    s.attachedBoardId = boardId;
    s.pdfName = pdfName;
    s.pdfPages = pages;
    s.currentPage = 1;
    s.boardMode = boardMode;
    s.boardLayout = boardLayout;
    s.leftBoardMode = leftBoardMode;
    s.rightBoardMode = rightBoardMode;
    s.notebookStyle = notebookStyle;
    s.notebookPageCount = notebookPageCount;
    s.notebookPageStyles = notebookPageStyles;
    s.notebookPageOrientations = notebookPageOrientations;
    s.strokesByMode = strokesByMode;
    s.strokesByPage = strokesByMode.get(boardMode) ?? new Map();
    s.scroll = null;
    s.rightScroll = null;

    const strokesRecord: Record<number, ClassroomStroke[]> = {};
    for (const [p, list] of s.strokesByPage.entries()) {
      if (list.length > 0) strokesRecord[p] = list;
    }

    const strokesByModeRecord: Record<
      ClassroomBoardMode,
      Record<number, ClassroomStroke[]>
    > = { pdf: {}, notebook: {} };
    for (const [m, map] of strokesByMode.entries()) {
      const modeObj: Record<number, ClassroomStroke[]> = {};
      for (const [p, list] of map.entries()) {
        if (list.length > 0) modeObj[p] = list;
      }
      strokesByModeRecord[m] = modeObj;
    }

    const snapshotData = buildBoardSnapshot(s);

    await db
      .update(classSessions)
      .set({
        pdfName,
        pdfPages: pages,
        boardSnapshot: snapshotData as any,
        attachedBoardId: boardId,
      })
      .where(eq(classSessions.id, s.id));

    await db
      .update(classSessions)
      .set({
        pdfName,
        pdfPages: pages,
        boardSnapshot: snapshotData as any,
      })
      .where(eq(classSessions.id, boardId));

    const attachedPayload = {
      attachedBoardId: boardId,
      pdfName: s.pdfName,
      pages,
      boardMode,
      boardLayout,
      leftBoardMode,
      rightBoardMode,
      notebookStyle,
      notebookPageCount,
      notebookPageStyles,
      notebookPageOrientations,
      strokesByMode: strokesByModeRecord,
      strokesByPage: strokesRecord,
      currentPage: 1,
    };

    const pdfPayload = { pdfName: s.pdfName, pages, currentPage: 1 };
    recordHistoryEvent(s, 'pdf:set', pdfPayload);
    broadcaster.toRoom(s.id, 'pdf:set', pdfPayload);

    broadcaster.toRoom(s.id, 'board:set', {
      mode: boardMode,
      layout: boardLayout,
      leftMode: leftBoardMode,
      rightMode: rightBoardMode,
      currentPage: 1,
      strokesByPage: strokesRecord,
      notebookPageCount,
      notebookPageStyles,
      notebookPageOrientations,
      strokesByMode: strokesByModeRecord,
      pdfName: s.pdfName,
      pages,
    });

    broadcaster.toRoom(s.id, 'board:attached', attachedPayload);

    s.isBoardOpen = true;
    recordHistoryEvent(s, 'board:toggle', { open: true });
    broadcaster.toRoom(s.id, 'board:toggle', { open: true });

    return { ok: true, state: attachedPayload };
  }

  async insertPdfPagesFromLibrary(
    s: ClassroomSession,
    teacherId: string,
    teacherRole: string,
    mediaAssetId: string,
    pageNumbers: number[],
    afterPageIndex: number,
    recordHistoryEvent: (s: ClassroomSession, type: string, payload: unknown) => void,
    broadcaster: ClassroomBroadcaster,
    onBoardMutation: (s: ClassroomSession) => void,
  ): Promise<{ pages: string[] }> {
    if (s.hostUserId !== teacherId) {
      throw new ForbiddenException("Faqat dars ustozi sahifa qo'sha oladi");
    }

    const { pages: allPages, status } = await this.mediaLibrary.getPdfPages(
      mediaAssetId,
      teacherId,
      teacherRole,
    );
    if (status !== 'ready') {
      throw new ConflictException(
        'PDF hali tayyor emas — konvertatsiya tugashini kuting',
      );
    }
    if (allPages.length === 0) {
      throw new ConflictException('PDF sahifalari topilmadi');
    }

    const uniqueSorted = [...new Set(pageNumbers)].sort((a, b) => a - b);
    if (
      uniqueSorted.some(
        (n) => !Number.isInteger(n) || n < 1 || n > allPages.length,
      )
    ) {
      throw new ConflictException("Noto'g'ri sahifa raqami tanlangan");
    }
    const newPages = uniqueSorted.map((n) => allPages[n - 1]);

    const ok = insertPdfPagesIntoSession(s, newPages, afterPageIndex);
    if (!ok) throw new ConflictException("Noto'g'ri qo'yish joyi");
    pushUndoEntry(s, {
      type: 'page:insert',
      mode: 'pdf',
      page: afterPageIndex + 1,
      pane: 'left',
      before: null,
      after: { afterPageIndex, pages: newPages },
    });

    await db
      .update(classSessions)
      .set({ pdfPages: s.pdfPages })
      .where(eq(classSessions.id, s.id));

    const payload = { pages: newPages, afterPageIndex };
    recordHistoryEvent(s, 'pdf:insert', payload);
    broadcaster.toRoom(s.id, 'pdf:insert', payload);
    onBoardMutation(s);
    return { pages: newPages };
  }
}
