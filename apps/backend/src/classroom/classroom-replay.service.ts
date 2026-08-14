import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { classSessions, freeSessionParticipants } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { ClassroomRecordingService } from './classroom-recording.service';
import {
  ClassroomBoardSnapshot,
  ClassroomHistoryEvent,
  ClassroomRecordingMode,
} from './classroom.types';

@Injectable()
export class ClassroomReplayService {
  private readonly logger = new Logger(ClassroomReplayService.name);
  private subtitleTranscriptionJobs = new Map<string, Promise<void>>();

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly recording: ClassroomRecordingService,
  ) {}

  async getReplay(sessionId: string, callerId: string, recordingId?: string) {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: {
        course: true,
        attendance: {
          with: {
            enrollment: {
              with: { schoolMember: { with: { student: true } } },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Dars topilmadi');
    const course = row.course as unknown as { adminId: string; id: string } | null;
    const isTeacher = course
      ? course.adminId === callerId
      : row.teacherId === callerId;
    let hasAccess = isTeacher;
    if (!hasAccess && course) {
      const attendanceRows = row.attendance as unknown as Array<{
        enrollment?: { schoolMember?: { studentId?: string } };
      }>;
      hasAccess = attendanceRows.some(
        (a) => a.enrollment?.schoolMember?.studentId === callerId,
      );
    }
    if (!hasAccess && !course) {
      const participation = await db.query.freeSessionParticipants.findFirst({
        where: and(
          eq(freeSessionParticipants.sessionId, sessionId),
          eq(freeSessionParticipants.userId, callerId),
        ),
      });
      hasAccess = !!participation;
    }
    if (!hasAccess) throw new ForbiddenException();

    const freeParticipants = !course
      ? await db.query.freeSessionParticipants.findMany({
          where: eq(freeSessionParticipants.sessionId, sessionId),
          with: { user: true },
        })
      : [];

    const rawRecordings = (row.recordings as unknown as any[]) ?? [];
    const formattedRecordings = rawRecordings.map((r) => ({
      id: r.id,
      partNumber: r.partNumber,
      createdAt: r.createdAt,
      title: r.title ?? null,
      recordingStatus: r.recordingStatus ?? 'none',
      recordingMode: r.recordingMode ?? null,
      recordingUrl: r.recordingUrl ? this.storage.getPublicUrl(r.recordingUrl) : null,
    }));

    let selectedEntry: any = null;
    if (recordingId) {
      selectedEntry = rawRecordings.find((r) => r.id === recordingId);
    }
    if (!selectedEntry && rawRecordings.length > 0) {
      selectedEntry = rawRecordings[rawRecordings.length - 1];
    }

    let recordingUrl =
      selectedEntry && selectedEntry.recordingUrl
        ? selectedEntry.recordingUrl
        : row.recordingUrl;
    let recordingStatus =
      selectedEntry &&
      selectedEntry.recordingStatus &&
      selectedEntry.recordingStatus !== 'none'
        ? selectedEntry.recordingStatus
        : row.recordingStatus;
    if (recordingStatus === 'pending') {
      await this.recording.refreshRecording(sessionId);
      const refreshed = await db.query.classSessions.findFirst({
        where: eq(classSessions.id, sessionId),
      });
      if (refreshed) {
        recordingUrl = refreshed.recordingUrl;
        recordingStatus = refreshed.recordingStatus;
      }
    }

    const historyEvents = selectedEntry
      ? (selectedEntry.historyEvents ?? [])
      : ((row.historyEvents as unknown as ClassroomHistoryEvent[]) ?? []);
    const recordingStartedAtMs = selectedEntry
      ? selectedEntry.recordingStartedAtMs
      : row.recordingStartedAtMs;
    const recordingMode = selectedEntry
      ? selectedEntry.recordingMode
      : (row.recordingMode as ClassroomRecordingMode | null);
    const boardSnapshot = selectedEntry
      ? selectedEntry.boardSnapshot
      : (row.boardSnapshot as unknown as ClassroomBoardSnapshot | null);

    const subtitles =
      selectedEntry && Array.isArray(selectedEntry.subtitles)
        ? selectedEntry.subtitles
        : (((row as any).subtitles as unknown as any[]) ?? []);

    if ((!subtitles || subtitles.length === 0) && recordingUrl) {
      const publicUrl = this.storage.getPublicUrl(recordingUrl);
      if (publicUrl) {
        const jobKey = `${sessionId}:${selectedEntry?.id ?? 'latest'}`;
        if (!this.subtitleTranscriptionJobs.has(jobKey)) {
          const job = this.autoTranscribeReplayAudio(
            sessionId,
            publicUrl,
            selectedEntry?.id,
          )
            .catch((err) =>
              console.warn('[Subtitle] Auto-transcribe error for past replay:', err),
            )
            .finally(() => this.subtitleTranscriptionJobs.delete(jobKey));
          this.subtitleTranscriptionJobs.set(jobKey, job);
        }
      }
    }

    return {
      isTeacher,
      title: selectedEntry?.title ?? row.title ?? row.pdfName ?? null,
      pdfName: row.pdfName,
      pdfPages: (row.pdfPages as string[]) ?? [],
      historyEvents,
      subtitles,
      recordingUrl: recordingUrl ? this.storage.getPublicUrl(recordingUrl) : null,
      recordingStatus,
      recordingStartedAtMs,
      recordingMode: (recordingMode as ClassroomRecordingMode | null) ?? null,
      boardSnapshot:
        (boardSnapshot as unknown as ClassroomBoardSnapshot | null) ?? null,
      recordings: formattedRecordings,
      attendance:
        selectedEntry && Array.isArray(selectedEntry.attendance)
          ? selectedEntry.attendance
          : course
            ? (
                row.attendance as unknown as Array<{
                  enrollment?: {
                    schoolMember?: {
                      studentId?: string;
                      student?: { displayName: string };
                    };
                  };
                  status: string;
                }>
              )
                .filter((a) => a.enrollment?.schoolMember?.studentId)
                .map((a) => ({
                  userId: a.enrollment!.schoolMember!.studentId as string,
                  name: a.enrollment!.schoolMember!.student?.displayName ?? '—',
                  status: a.status,
                }))
            : freeParticipants.map((p) => ({
                userId: p.userId,
                name: p.user.displayName,
                status: 'present' as const,
              })),
    };
  }

  async autoTranscribeReplayAudio(
    sessionId: string,
    audioUrl: string,
    recordingId?: string,
  ) {
    try {
      const primaryUrl =
        this.config.get<string>('SUBTITLE_SERVER_URL') ??
        'http://subtitle-server:8090';
      let response: Response | null = null;
      try {
        response = await fetch(`${primaryUrl}/transcribe-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioUrl }),
        });
      } catch {
        try {
          response = await fetch('http://127.0.0.1:8090/transcribe-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioUrl }),
          });
        } catch {}
      }

      if (!response || !response.ok) return;
      const data = (await response.json()) as { cues?: any[] };
      if (data.cues && data.cues.length > 0) {
        const row = await db.query.classSessions.findFirst({
          where: eq(classSessions.id, sessionId),
        });
        const recordings = (
          (row?.recordings as unknown as any[]) ?? []
        ).map((entry) =>
          recordingId && entry.id === recordingId
            ? { ...entry, subtitles: data.cues }
            : entry,
        );
        await db
          .update(classSessions)
          .set({
            subtitles: recordingId
              ? ((row?.subtitles as any[]) ?? [])
              : data.cues,
            ...(recordingId ? { recordings } : {}),
          })
          .where(eq(classSessions.id, sessionId));
        this.logger.log(
          `Auto-transcribed ${data.cues.length} subtitle cues for session ${sessionId}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `autoTranscribeReplayAudio failed for session ${sessionId}: ${err}`,
      );
    }
  }
}
