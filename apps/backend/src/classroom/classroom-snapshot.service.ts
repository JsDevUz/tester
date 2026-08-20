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
    // The session row and the board it is attached to hold the same snapshot, and each is a
    // complete copy. Writing them independently means a timeout on one still leaves the other
    // saved -- running them in sequence used to let a slow session write skip the board write
    // entirely, losing a lesson's drawings from the persistent board.
    const writes: Promise<unknown>[] = [
      this.withQueryTimeout(
        s.id,
        db
          .update(classSessions)
          .set({
            boardSnapshot,
            pdfName: s.pdfName,
            pdfPages: s.pdfPages,
          })
          .where(eq(classSessions.id, s.id))
          .returning({ id: classSessions.id }),
      ).then((updated) => {
        this.logger.log(`persistBoardSnapshot(${s.id}): UPDATE ${updated.length} qator qaytardi`);
      }),
    ];

    if (s.attachedBoardId) {
      writes.push(
        this.withQueryTimeout(
          s.attachedBoardId,
          db
            .update(classSessions)
            .set({
              boardSnapshot,
              pdfName: s.pdfName,
              pdfPages: s.pdfPages,
            })
            .where(eq(classSessions.id, s.attachedBoardId)),
        ),
      );
    }

    const results = await Promise.allSettled(writes);
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      for (const failure of failures) {
        this.logger.error(
          `persistBoardSnapshot(${s.id}): yozuv muvaffaqiyatsiz: ${(failure as PromiseRejectedResult).reason}`,
        );
      }
      // Still surface the failure so callers (autosave, shutdown) log and can react, but only
      // after every write has had its turn.
      throw (failures[0] as PromiseRejectedResult).reason;
    }
  }

  // Har bir sessiyaning DB yozuvini alohida cheklaydi — connect_timeout
  // faqat YANGI ulanish o'rnatishga tegishli, allaqachon ochilgan lekin
  // "yarim o'lik" (masalan tarmoq uzilishidan keyingi) ulanishdagi so'rov
  // baribir abadiy kutishi mumkin edi. Bu, ayniqsa, bir nechta aktiv
  // sessiya bo'lganda graceful shutdown'ning butun 8s byudjetini bitta
  // "yopishib qolgan" sessiya yeb qo'yishining oldini oladi.
  private async withQueryTimeout<T>(sessionId: string, query: Promise<T>): Promise<T> {
    return Promise.race([
      query,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`persist timeout for session ${sessionId}`)), 5_000).unref();
      }),
    ]);
  }

  /** True when the session holds any stroke at all, in either the per-mode or legacy map. */
  private hasStrokes(s: ClassroomSession): boolean {
    if (s.strokesByMode) {
      for (const map of s.strokesByMode.values()) {
        for (const list of map.values()) if (list.length > 0) return true;
      }
    }
    if (s.strokesByPage) {
      for (const list of s.strokesByPage.values()) if (list.length > 0) return true;
    }
    return false;
  }

  async autoSaveSnapshots(sessions: Map<string, ClassroomSession>): Promise<void> {
    // A connected host is the usual case, but a DISCONNECTED one is when unsaved work is most
    // at risk: the 1.5s persist debounce may never have fired, and the host grace period can
    // outlive the process. Skipping those sessions is how a restart used to lose the last
    // strokes drawn before the teacher's connection dropped. Sessions with nothing drawn are
    // still skipped -- there is no state worth a write.
    const active = Array.from(sessions.values()).filter(
      (s) => s.hostSocketId !== null || this.hasStrokes(s),
    );
    if (active.length === 0) return;

    // Ketma-ket (sequential) saqlash bitta sessiyaning DB so'rovi
    // osilib/sekinlashib qolsa, undan keyingi barcha sessiyalarni ham
    // saqlanmay qoldirar edi — bu graceful shutdown'da bir nechta aktiv
    // doska bo'lganda ma'lumot yo'qotishning haqiqiy sababi bo'ldi.
    // Parallel bajarish bilan har bir sessiya boshqalaridan mustaqil.
    await Promise.allSettled(
      active.map((s) =>
        this.persistBoardSnapshot(s).catch((err) => {
          this.logger.warn(
            `autoSaveSnapshots: session ${s.id} saqlashda xato: ${err}`,
          );
        }),
      ),
    );
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
