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
      savedVersions:
        s.savedVersions ?? (s as any).boardSnapshot?.savedVersions ?? [],
    };
  }

  async persistBoardSnapshot(s: ClassroomSession): Promise<void> {
    const boardSnapshot = this.buildBoardSnapshot(s);
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
}
