import { randomUUID } from 'crypto';
import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { classSessions, users } from '../db/schema';
import {
  ClassroomBoardMode,
  ClassroomBoardSnapshot,
  ClassroomStroke,
} from './classroom.types';
import { ClassroomService } from './classroom.service';

@Injectable()
export class BoardsService {
  constructor(
    @Inject(forwardRef(() => ClassroomService))
    private readonly classroomService: ClassroomService,
  ) {}

  async createBoard(teacherId: string, title?: string): Promise<{ id: string }> {
    const cleanTitle = title?.trim() ? title.trim() : null;
    const initialSnapshot = {
      pdfName: null,
      pages: [],
      strokesByPage: {},
      strokesByMode: { pdf: {}, notebook: {} },
      boardMode: 'notebook',
      boardLayout: 'single',
      notebookStyle: 'grid',
      notebookPageCount: 1,
      notebookPageStyles: {},
      notebookPageOrientations: {},
    };

    const [row] = await db
      .insert(classSessions)
      .values({
        courseId: null,
        teacherId,
        title: cleanTitle,
        isBoard: true,
        boardSnapshot: initialSnapshot,
      })
      .returning();

    const hostUser = await db.query.users.findFirst({ where: eq(users.id, teacherId) });
    const hostName = hostUser?.displayName ?? 'Ustoz';

    this.classroomService.initBoardSession(row.id, teacherId, hostName, cleanTitle);
    return { id: row.id };
  }

  async listMyBoards(teacherId: string) {
    const rows = await db.query.classSessions.findMany({
      where: and(
        isNull(classSessions.courseId),
        eq(classSessions.teacherId, teacherId),
        eq(classSessions.isBoard, true),
      ),
      orderBy: desc(classSessions.startedAt),
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title ?? null,
      pdfName: row.pdfName,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      status: row.status as 'active' | 'ended',
      hasBoardSnapshot: row.boardSnapshot !== null,
    }));
  }

  async deleteBoard(boardId: string, teacherId: string): Promise<void> {
    const row = await db.query.classSessions.findFirst({ where: eq(classSessions.id, boardId) });
    if (!row) throw new NotFoundException('Doska topilmadi');
    if (row.teacherId !== teacherId) throw new ForbiddenException('Bu doska sizga tegishli emas');
    if (!row.isBoard) {
      throw new ForbiddenException("Bu erkin dars — /boards orqali o'chirish mumkin emas");
    }
    await db.delete(classSessions).where(eq(classSessions.id, boardId));
  }

  async updateBoardTitle(boardId: string, teacherId: string, title: string): Promise<void> {
    const row = await db.query.classSessions.findFirst({ where: eq(classSessions.id, boardId) });
    if (!row) throw new NotFoundException('Doska topilmadi');
    if (row.teacherId !== teacherId) throw new ForbiddenException('Bu doska sizga tegishli emas');
    const cleanTitle = title.trim() || null;
    await db.update(classSessions).set({ title: cleanTitle }).where(eq(classSessions.id, boardId));
    const s = this.classroomService.getSession(boardId);
    if (s) s.title = cleanTitle;
  }

  async getBoardActivity(boardId: string, userId: string, page = 1, limit = 20) {
    const row = await db.query.classSessions.findFirst({ where: eq(classSessions.id, boardId) });
    if (!row) throw new NotFoundException('Doska topilmadi');

    const s = this.classroomService.getSession(boardId);
    const targetBoardId = s?.attachedBoardId ?? row.attachedBoardId ?? boardId;

    const targetRow =
      targetBoardId !== boardId
        ? ((await db.query.classSessions.findFirst({ where: eq(classSessions.id, targetBoardId) })) ?? row)
        : row;
    const targetSession = this.classroomService.getSession(targetBoardId) ?? s;

    const events: any[] = targetSession?.historyEvents ?? (targetRow.historyEvents as any[]) ?? [];

    const hostUser = await db.query.users.findFirst({
      where: eq(users.id, targetRow.teacherId ?? userId),
    });
    const userName = hostUser?.displayName ?? 'Ustoz';

    const activityLogs: Array<{
      id: string;
      type: string;
      description: string;
      timestampMs: number;
      userName: string;
      strokeId?: string | null;
      page?: number | null;
      stroke?: any;
    }> = [];

    // Base initial creation event
    activityLogs.push({
      id: `${boardId}-init`,
      type: 'board',
      description: `Doska yaratildi: "${row.title ?? 'Nomsiz doska'}"`,
      timestampMs: row.startedAt ? new Date(row.startedAt).getTime() : Date.now(),
      userName,
    });

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      let desc = '';
      let type = 'stroke';
      if (ev.type === 'stroke:add') {
        const modeLabel = ev.payload?.mode === 'notebook' ? 'daftarga' : 'taxtaga';
        const tool = ev.payload?.stroke?.tool;
        let toolName = 'chizma';
        if (tool === 'pen') toolName = 'qalam (pen)';
        else if (tool === 'text') toolName = 'matn (text)';
        else if (tool === 'highlighter') toolName = 'marker (highlighter)';
        else if (tool === 'eraser') toolName = "o'chirgich (eraser)";
        else if (
          tool === 'shape' ||
          tool === 'rectangle' ||
          tool === 'circle' ||
          tool === 'line' ||
          tool === 'arrow'
        ) {
          toolName = 'shakl (shape)';
        }
        desc = `Yangi ${toolName} chizildi (${modeLabel})`;
        type = 'stroke';
      } else if (ev.type === 'stroke:update') {
        desc = "Chizma joylashuvi ko'chirildi";
        type = 'stroke';
      } else if (ev.type === 'stroke:textUpdate') {
        desc = 'Matn tahrirlandi';
        type = 'stroke';
      } else if (ev.type === 'stroke:shapeUpdate') {
        desc = 'Shakl tahrirlandi';
        type = 'stroke';
      } else if (ev.type === 'stroke:undo' || ev.type === 'board:undo') {
        desc = 'Oxirgi chizma bekor qilindi (Undo)';
        type = 'stroke';
      } else if (ev.type === 'board:redo') {
        desc = 'Chizma qayta tiklandi (Redo)';
        type = 'stroke';
      } else if (ev.type === 'pdf:set') {
        desc = `PDF biriktirildi: "${ev.payload?.pdfName ?? 'hujjat'}"`;
        type = 'pdf';
      } else if (ev.type === 'pdf:insert') {
        desc = `PDF sahifalari qo'shildi (${ev.payload?.pages?.length ?? 1} ta)`;
        type = 'pdf';
      } else if (ev.type === 'page:insert') {
        desc = "Yangi sahifa qo'shildi";
        type = 'page';
      } else if (ev.type === 'page:remove') {
        desc = "Sahifa o'chirildi";
        type = 'page';
      } else if (ev.type === 'page:clear') {
        desc = 'Sahifa chizmalari tozalandi';
        type = 'stroke';
      } else if (ev.type === 'board:toggle') {
        desc = ev.payload?.open ? 'Doska ochildi' : 'Doska yopildi';
        type = 'board';
      } else if (ev.type === 'board:set') {
        desc = `Rejim o'zgartirildi: ${ev.payload?.mode === 'notebook' ? 'Daftar' : 'PDF'}`;
        type = 'board';
      } else {
        continue;
      }

      const eventTime = ev.atMs
        ? row.startedAt
          ? new Date(row.startedAt).getTime() + ev.atMs
          : Date.now()
        : (ev.t ?? Date.now());

      activityLogs.push({
        id: `${boardId}-ev-${i}`,
        type,
        description: desc,
        timestampMs: eventTime,
        userName,
        strokeId: ev.payload?.stroke?.id ?? ev.payload?.strokeId ?? null,
        page: ev.payload?.page ?? ev.payload?.stroke?.page ?? 1,
        stroke: ev.payload?.stroke ?? null,
      });
    }

    const allReversed = activityLogs.reverse();
    const total = allReversed.length;
    const startIndex = (page - 1) * limit;
    const items = allReversed.slice(startIndex, startIndex + limit);

    return {
      items,
      total,
      hasMore: startIndex + limit < total,
      page,
      limit,
    };
  }

  async createBoardVersionCheckpoint(sessionId: string, customLabel?: string, explicitSnapshot?: any): Promise<void> {
    const s = this.classroomService.getSession(sessionId);
    const dbRow = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sessionId) });
    if (!dbRow && !s) return;

    const currentSnapshot = explicitSnapshot ?? (s
      ? this.classroomService.buildBoardSnapshot(s)
      : (dbRow?.boardSnapshot as any));
    if (!currentSnapshot) return;

    let totalStrokes = 0;
    if (currentSnapshot?.strokesByMode) {
      for (const map of Object.values(
        currentSnapshot.strokesByMode as Record<string, Record<number, any[]>>,
      )) {
        for (const list of Object.values(map)) {
          totalStrokes += list?.length ?? 0;
        }
      }
    } else if (currentSnapshot?.strokesByPage) {
      for (const list of Object.values(currentSnapshot.strokesByPage as Record<number, any[]>)) {
        totalStrokes += list?.length ?? 0;
      }
    }

    const pageCount =
      currentSnapshot?.boardMode === 'notebook'
        ? (currentSnapshot?.notebookPageCount ?? 1)
        : (currentSnapshot?.pages?.length ?? 1);

    const savedVersions: any[] = currentSnapshot.savedVersions
      ? [...currentSnapshot.savedVersions]
      : [];

    const lastVer = savedVersions[0];
    if (!customLabel && lastVer && lastVer.strokeCount === totalStrokes && Date.now() - lastVer.timestampMs < 5000) {
      return;
    }

    const nextVerNum = savedVersions.length + 2;
    const now = Date.now();
    const dateStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const cleanSnap = JSON.parse(JSON.stringify(currentSnapshot));
    delete cleanSnap.savedVersions;

    const newVersion = {
      id: randomUUID(),
      versionNumber: nextVerNum,
      label: customLabel ?? `Seans versiyasi (${dateStr})`,
      timestampMs: now,
      boardMode: currentSnapshot.boardMode ?? 'pdf',
      pdfName: currentSnapshot.pdfName ?? null,
      pageCount,
      strokeCount: totalStrokes,
      snapshot: cleanSnap,
    };

    savedVersions.unshift(newVersion);
    currentSnapshot.savedVersions = savedVersions;

    if (s) {
      s.savedVersions = savedVersions;
    }

    await db
      .update(classSessions)
      .set({ boardSnapshot: currentSnapshot })
      .where(eq(classSessions.id, sessionId));

    const targetBoardId = s?.attachedBoardId ?? dbRow?.attachedBoardId;
    if (targetBoardId && targetBoardId !== sessionId) {
      const attachedS = this.classroomService.getSession(targetBoardId);
      if (attachedS) attachedS.savedVersions = savedVersions;
      await db
        .update(classSessions)
        .set({ boardSnapshot: currentSnapshot })
        .where(eq(classSessions.id, targetBoardId));
    }
  }

  async getBoardVersions(
    boardId: string,
    userId: string,
  ): Promise<
    Array<{
      id: string;
      versionNumber: number;
      label: string;
      timestampMs: number;
      boardMode: string;
      pdfName: string | null;
      pageCount: number;
      strokeCount: number;
      snapshot?: any;
      isCurrent?: boolean;
    }>
  > {
    const row = await db.query.classSessions.findFirst({ where: eq(classSessions.id, boardId) });
    if (!row) throw new NotFoundException('Doska topilmadi');

    const s = this.classroomService.getSession(boardId);
    const targetBoardId = s?.attachedBoardId ?? row.attachedBoardId ?? boardId;

    const targetRow =
      targetBoardId !== boardId
        ? ((await db.query.classSessions.findFirst({ where: eq(classSessions.id, targetBoardId) })) ?? row)
        : row;
    const targetSession = this.classroomService.getSession(targetBoardId) ?? s;

    const currentSnapshot = targetSession
      ? this.classroomService.buildBoardSnapshot(targetSession)
      : (targetRow.boardSnapshot as any);

    const versions: Array<{
      id: string;
      versionNumber: number;
      label: string;
      timestampMs: number;
      boardMode: string;
      pdfName: string | null;
      pageCount: number;
      strokeCount: number;
      snapshot?: any;
      isCurrent?: boolean;
    }> = [];

    const startTime = row.startedAt ? new Date(row.startedAt).getTime() : Date.now();
    let totalStrokes = 0;
    if (currentSnapshot?.strokesByMode) {
      for (const map of Object.values(
        currentSnapshot.strokesByMode as Record<string, Record<number, any[]>>,
      )) {
        for (const list of Object.values(map)) {
          totalStrokes += list?.length ?? 0;
        }
      }
    } else if (currentSnapshot?.strokesByPage) {
      for (const list of Object.values(currentSnapshot.strokesByPage as Record<number, any[]>)) {
        totalStrokes += list?.length ?? 0;
      }
    }

    const pageCount =
      currentSnapshot?.boardMode === 'notebook'
        ? (currentSnapshot?.notebookPageCount ?? 1)
        : (currentSnapshot?.pages?.length ?? 1);

    const savedVersionsList: any[] =
      s?.savedVersions ??
      currentSnapshot?.savedVersions ??
      (row.boardSnapshot as any)?.savedVersions ??
      [];

    const activeVerId = s?.activeVersionId ?? (currentSnapshot as any)?.activeVersionId ?? 'current';

    // 1. Live Current Checkpoint — faqat foydalanuvchi joriy tahrirda bo'lsa
    if (activeVerId === 'current' || !activeVerId) {
      versions.push({
        id: 'current',
        versionNumber: savedVersionsList.length + 2,
        label: 'Hozirgi holat (Oxirgi saqlangan)',
        timestampMs: Date.now(),
        boardMode: currentSnapshot?.boardMode ?? 'pdf',
        pdfName: currentSnapshot?.pdfName ?? null,
        pageCount,
        strokeCount: totalStrokes,
        isCurrent: true,
      });
    }

    // 2. Saved session versions
    if (Array.isArray(savedVersionsList)) {
      for (const ver of savedVersionsList) {
        versions.push({
          id: ver.id,
          versionNumber: ver.versionNumber,
          label: ver.label,
          timestampMs: ver.timestampMs,
          boardMode: ver.boardMode ?? 'pdf',
          pdfName: ver.pdfName ?? null,
          pageCount: ver.pageCount ?? 1,
          strokeCount: ver.strokeCount ?? 0,
          isCurrent: activeVerId === ver.id,
        });
      }
    }

    // 3. Initial version checkpoint
    versions.push({
      id: 'initial',
      versionNumber: 1,
      label: "Boshlang'ich holat (Yaratilgan vaqti)",
      timestampMs: startTime,
      boardMode: 'notebook',
      pdfName: null,
      pageCount: 1,
      strokeCount: 0,
      isCurrent: activeVerId === 'initial',
    });

    return versions;
  }

  async restoreBoardVersion(boardId: string, userId: string, versionId: string): Promise<void> {
    const row = await db.query.classSessions.findFirst({ where: eq(classSessions.id, boardId) });
    if (!row) throw new NotFoundException('Doska topilmadi');
    if (row.teacherId !== userId) throw new ForbiddenException('Bu doska sizga tegishli emas');

    const s = this.classroomService.getSession(boardId);

    // 1. Agar tiklashdan oldin doskada chizmalar bo'lsa (0 chizmasiz bo'lmasa)
    // va foydalanuvchi joriy tahrirda ('current') turgan bo'lsa,
    // o'sha chizmalarni yo'qotmaslik uchun avval checkpoint yaratamiz:
    const currentSnapshotBeforeRestore = s
      ? this.classroomService.buildBoardSnapshot(s)
      : (row.boardSnapshot as any);

    let currentStrokes = 0;
    if (currentSnapshotBeforeRestore?.strokesByMode) {
      for (const map of Object.values(
        currentSnapshotBeforeRestore.strokesByMode as Record<string, Record<number, any[]>>,
      )) {
        for (const list of Object.values(map)) currentStrokes += list?.length ?? 0;
      }
    } else if (currentSnapshotBeforeRestore?.strokesByPage) {
      for (const list of Object.values(
        currentSnapshotBeforeRestore.strokesByPage as Record<number, any[]>,
      )) {
        currentStrokes += list?.length ?? 0;
      }
    }

    const currentActiveVerId = s?.activeVersionId ?? (row.boardSnapshot as any)?.activeVersionId ?? 'current';
    if (currentStrokes > 0 && currentActiveVerId === 'current') {
      const now = Date.now();
      const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      await this.createBoardVersionCheckpoint(
        boardId,
        `Tiklashdan oldingi holat (${timeStr})`,
        currentSnapshotBeforeRestore,
      );
    }

    // Snapshot'ni to'g'ridan-to'g'ri olish (getBoardVersions endi snapshot qaytarmaydi)
    const updatedRow = await db.query.classSessions.findFirst({ where: eq(classSessions.id, boardId) });
    const currentSavedVersions: any[] =
      s?.savedVersions ??
      (updatedRow?.boardSnapshot as any)?.savedVersions ??
      [];

    let snap: any;

    if (versionId === 'current') {
      // Joriy holatga qaytish — hozirgi snapshot'dan foydalanish
      snap = JSON.parse(JSON.stringify(
        s ? this.classroomService.buildBoardSnapshot(s) : (updatedRow?.boardSnapshot as any),
      ));
    } else if (versionId === 'initial') {
      // Boshlang'ich holat — bo'sh snapshot
      snap = {
        pdfName: null,
        pages: [],
        strokesByPage: {},
        strokesByMode: { pdf: {}, notebook: {} },
        boardMode: 'notebook',
        boardLayout: 'single',
        notebookStyle: 'grid',
        notebookPageCount: 1,
        notebookPageStyles: {},
        notebookPageOrientations: {},
      };
    } else {
      // Saqlangan versiyalardan qidirish
      const savedVer = currentSavedVersions.find((v: any) => v.id === versionId);
      if (!savedVer?.snapshot) {
        throw new NotFoundException('Versiya topilmadi');
      }
      snap = JSON.parse(JSON.stringify(savedVer.snapshot));
    }

    const currentSaved = currentSavedVersions;
    snap.savedVersions = currentSaved;
    snap.activeVersionId = versionId;

    await db
      .update(classSessions)
      .set({
        boardSnapshot: snap,
        pdfName: snap.pdfName ?? null,
        pdfPages: snap.pages ?? [],
      })
      .where(eq(classSessions.id, boardId));

    const targetBoardId = s?.attachedBoardId ?? row.attachedBoardId ?? boardId;
    if (targetBoardId !== boardId) {
      await db
        .update(classSessions)
        .set({
          boardSnapshot: snap,
          pdfName: snap.pdfName ?? null,
          pdfPages: snap.pages ?? [],
        })
        .where(eq(classSessions.id, targetBoardId));
    }

    if (s) {
      s.activeVersionId = versionId;
      s.pdfName = snap.pdfName ?? null;
      s.pdfPages = snap.pages ?? [];
      s.boardMode = snap.boardMode ?? 'pdf';
      s.boardLayout = snap.boardLayout ?? 'single';
      s.leftBoardMode = snap.leftBoardMode ?? s.boardMode;
      s.rightBoardMode = snap.rightBoardMode ?? s.boardMode;
      s.notebookStyle = snap.notebookStyle ?? 'grid';
      s.notebookPageCount = snap.notebookPageCount ?? 1;
      s.notebookPageStyles = snap.notebookPageStyles ?? {};
      s.notebookPageOrientations = snap.notebookPageOrientations ?? {};

      const strokesByMode = new Map<ClassroomBoardMode, Map<number, ClassroomStroke[]>>([
        ['pdf', new Map()],
        ['notebook', new Map()],
      ]);

      if (snap.strokesByMode) {
        if (snap.strokesByMode.pdf) {
          strokesByMode.set(
            'pdf',
            new Map(
              Object.entries(snap.strokesByMode.pdf).map(([p, st]) => [
                Number(p),
                st as ClassroomStroke[],
              ]),
            ),
          );
        }
        if (snap.strokesByMode.notebook) {
          strokesByMode.set(
            'notebook',
            new Map(
              Object.entries(snap.strokesByMode.notebook).map(([p, st]) => [
                Number(p),
                st as ClassroomStroke[],
              ]),
            ),
          );
        }
      }
      s.strokesByMode = strokesByMode;
      s.strokesByPage = strokesByMode.get(s.boardMode ?? 'pdf') ?? new Map();
      s.undoStack = [];
      s.redoStack = [];

      const strokesRecord: Record<number, ClassroomStroke[]> = {};
      for (const [p, list] of s.strokesByPage.entries()) {
        strokesRecord[p] = [...list];
      }

      const strokesByModeRecord: Record<string, Record<number, ClassroomStroke[]>> = {
        pdf: {},
        notebook: {},
      };
      if (s.strokesByMode?.get('pdf')) {
        for (const [p, list] of s.strokesByMode.get('pdf')!.entries()) {
          strokesByModeRecord.pdf[p] = [...list];
        }
      }
      if (s.strokesByMode?.get('notebook')) {
        for (const [p, list] of s.strokesByMode.get('notebook')!.entries()) {
          strokesByModeRecord.notebook[p] = [...list];
        }
      }

      this.classroomService.broadcastToRoom(boardId, 'board:set', {
        mode: s.boardMode,
        currentPage: 1,
        strokesByPage: strokesRecord,
        strokesByMode: strokesByModeRecord,
        pages: s.pdfPages ?? [],
        pdfName: s.pdfName ?? null,
        notebookPageCount: s.notebookPageCount ?? 1,
        notebookPageStyles: s.notebookPageStyles ?? {},
        notebookPageOrientations: s.notebookPageOrientations ?? {},
      });
    }
  }
}
