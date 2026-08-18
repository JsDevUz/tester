import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { classSessions } from '../db/schema';
import { buildSnapshot } from './classroom.logic';
import {
  ClassroomBoardSnapshot,
  ClassroomSession,
  ClassroomStroke,
} from './classroom.types';

@Injectable()
export class ClassroomSnapshotService {
  private readonly logger = new Logger(ClassroomSnapshotService.name);

  buildBoardSnapshot(s: ClassroomSession): ClassroomBoardSnapshot {
    const full = buildSnapshot(s);
    const pdfStrokes: Record<number, ClassroomStroke[]> = {};
    const notebookStrokes: Record<number, ClassroomStroke[]> = {};

    if (s.strokesByMode) {
      const pdfMap = s.strokesByMode.get('pdf');
      if (pdfMap) {
        for (const [p, strokes] of pdfMap) {
          if (strokes.length > 0) pdfStrokes[p] = strokes;
        }
      }
      const notebookMap = s.strokesByMode.get('notebook');
      if (notebookMap) {
        for (const [p, strokes] of notebookMap) {
          if (strokes.length > 0) notebookStrokes[p] = strokes;
        }
      }
    }

    return {
      pdfName: full.pdfName,
      pages: full.pages,
      strokesByPage: full.strokesByPage,
      rightStrokesByPage: full.rightStrokesByPage,
      strokesByMode: {
        pdf: pdfStrokes,
        notebook: notebookStrokes,
      },
      boardMode: full.boardMode,
      boardLayout: full.boardLayout,
      leftBoardMode: full.leftBoardMode,
      rightBoardMode: full.rightBoardMode,
      notebookStyle: full.notebookStyle,
      notebookPageCount: full.notebookPageCount ?? 1,
      notebookPageStyles: full.notebookPageStyles,
      notebookPageOrientations: full.notebookPageOrientations,
      activeVersionId: s.activeVersionId ?? 'current',
      savedVersions:
        s.savedVersions ?? (s as any).boardSnapshot?.savedVersions ?? [],
    };
  }

  async persistBoardSnapshot(s: ClassroomSession): Promise<void> {
    const boardSnapshot = this.buildBoardSnapshot(s);
    let strokeCount = 0;
    if (boardSnapshot.strokesByMode) {
      for (const m of Object.values(boardSnapshot.strokesByMode as Record<string, Record<string, any[]>>)) {
        for (const list of Object.values(m)) strokeCount += list?.length ?? 0;
      }
    }
    this.logger.log(`persistBoardSnapshot(${s.id}): strokeCount=${strokeCount} saqlanmoqda`);
    await db
      .update(classSessions)
      .set({
        boardSnapshot,
        pdfName: s.pdfName,
        pdfPages: s.pdfPages,
      })
      .where(eq(classSessions.id, s.id));

    if (s.attachedBoardId) {
      await db
        .update(classSessions)
        .set({
          boardSnapshot,
          pdfName: s.pdfName,
          pdfPages: s.pdfPages,
        })
        .where(eq(classSessions.id, s.attachedBoardId));
    }
  }

  async autoSaveSnapshots(sessions: Map<string, ClassroomSession>): Promise<void> {
    const active = Array.from(sessions.values()).filter(
      (s) => s.hostSocketId !== null,
    );
    if (active.length === 0) return;

    for (const s of active) {
      try {
        await this.persistBoardSnapshot(s);
      } catch (err) {
        this.logger.warn(
          `autoSaveSnapshots: session ${s.id} saqlashda xato: ${err}`,
        );
      }
    }
  }

  /**
   * Snapshot JSON'dan `strokesByMode` Map qayta tiklaydi.
   * Eski formatda (strokesByMode yo'q) esa boardMode/rightBoardMode bo'yicha
   * strokesByPage / rightStrokesByPage dan tuzadi.
   */
  deserializeStrokesByMode(
    snapshot: ClassroomBoardSnapshot,
  ): Map<'pdf' | 'notebook', Map<number, ClassroomStroke[]>> {
    const strokesByMode = new Map<'pdf' | 'notebook', Map<number, ClassroomStroke[]>>([
      ['pdf', new Map()],
      ['notebook', new Map()],
    ]);
    const raw = (snapshot as any).strokesByMode as
      | Record<'pdf' | 'notebook', Record<number, ClassroomStroke[]>>
      | undefined;
    if (raw) {
      if (raw.pdf) {
        strokesByMode.set(
          'pdf',
          new Map(Object.entries(raw.pdf).map(([p, s]) => [Number(p), s])),
        );
      }
      if (raw.notebook) {
        strokesByMode.set(
          'notebook',
          new Map(Object.entries(raw.notebook).map(([p, s]) => [Number(p), s])),
        );
      }
    } else {
      strokesByMode.set(
        snapshot.boardMode,
        new Map(
          Object.entries(snapshot.strokesByPage ?? {}).map(([p, s]) => [
            Number(p),
            s,
          ]),
        ),
      );
      if (
        snapshot.rightBoardMode &&
        snapshot.rightBoardMode !== snapshot.boardMode
      ) {
        strokesByMode.set(
          snapshot.rightBoardMode,
          new Map(
            Object.entries(snapshot.rightStrokesByPage ?? {}).map(([p, s]) => [
              Number(p),
              s,
            ]),
          ),
        );
      }
    }
    return strokesByMode;
  }
}
