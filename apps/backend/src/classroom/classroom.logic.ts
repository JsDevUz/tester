import {
  ClassroomParticipant, ClassroomSession, ClassroomSnapshot, ClassroomStroke,
} from './classroom.types';

export const LATE_AFTER_MS = 10 * 60 * 1000;
export const HOST_GRACE_MS = 90_000;
export const MAX_STROKE_POINTS = 2000;
export const MAX_PDF_PAGES = 60;
export const PDF_RENDER_WIDTH = 1600;

function isValidPage(session: ClassroomSession, page: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= session.pdfPages.length;
}

export function addStroke(session: ClassroomSession, page: number, stroke: ClassroomStroke): boolean {
  if (!isValidPage(session, page)) return false;
  const { points } = stroke;
  if (!Array.isArray(points) || points.length === 0 || points.length % 2 !== 0) return false;
  if (points.length > MAX_STROKE_POINTS * 2) return false;
  if (points.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) return false;
  const list = session.strokesByPage.get(page) ?? [];
  list.push(stroke);
  session.strokesByPage.set(page, list);
  return true;
}

export function undoStroke(session: ClassroomSession, page: number): string | null {
  const list = session.strokesByPage.get(page);
  if (!list || list.length === 0) return null;
  return list.pop()!.id;
}

export function clearPage(session: ClassroomSession, page: number): void {
  session.strokesByPage.set(page, []);
}

export function setPage(session: ClassroomSession, page: number): boolean {
  if (!isValidPage(session, page)) return false;
  session.currentPage = page;
  return true;
}

export function attendanceStatusOnJoin(startedAtMs: number, nowMs: number): 'present' | 'late' {
  return nowMs - startedAtMs > LATE_AFTER_MS ? 'late' : 'present';
}

export function closeInterval(participant: ClassroomParticipant, nowMs: number): number {
  if (participant.joinedAtMs === null) return 0;
  const added = Math.max(0, Math.round((nowMs - participant.joinedAtMs) / 1000));
  participant.totalSeconds += added;
  participant.joinedAtMs = null;
  return added;
}

export function buildSnapshot(session: ClassroomSession): ClassroomSnapshot {
  const strokesByPage: Record<number, ClassroomStroke[]> = {};
  for (const [page, strokes] of session.strokesByPage) strokesByPage[page] = strokes;
  return {
    sessionId: session.id,
    pdfName: session.pdfName,
    pages: session.pdfPages,
    currentPage: session.currentPage,
    strokesByPage,
    participants: [...session.participants.values()].map((p) => ({
      userId: p.userId, name: p.name, online: p.socketId !== null, status: p.status,
    })),
    startedAt: session.startedAtMs,
    hostOnline: session.hostSocketId !== null,
  };
}
