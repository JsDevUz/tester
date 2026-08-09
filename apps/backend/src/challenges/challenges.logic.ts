export type ChallengeLeaderboardMetric = 'overall' | 'books' | 'words' | 'speed';

export interface LeaderboardParticipant {
  id: string;
  studentId: string;
  student: { displayName: string; displayAvatarUrl: string | null };
}

export interface LeaderboardEvent {
  challengeParticipantId: string;
  challengeBookId: string;
  startPage: number;
  endPage: number;
  newWordsCount: number;
  createdAt: Date | string | null;
}

export interface LeaderboardBook {
  id: string;
  totalPages: number;
}

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  value: number;
  rank: number;
  isCurrentStudent: boolean;
}

/**
 * Pure scoring logic shared by the student-facing and teacher-facing leaderboard
 * endpoints. Callers are responsible for gating access (enrollment vs. ownership)
 * and fetching the rows below; this function only computes ranked entries.
 */
export function computeLeaderboard(
  participants: LeaderboardParticipant[],
  events: LeaderboardEvent[],
  books: LeaderboardBook[],
  metric: ChallengeLeaderboardMetric,
  bookId: string | undefined,
  currentStudentId: string | null,
): { entries: LeaderboardEntry[] } {
  if (participants.length === 0) return { entries: [] };

  const bookTotalPages = new Map(books.map((b) => [b.id, b.totalPages]));
  const byParticipant = new Map(participants.map((p) => [p.id, events.filter((e) => e.challengeParticipantId === p.id)]));

  const scored = participants.map((participant) => {
    const participantEvents = bookId
      ? (byParticipant.get(participant.id) ?? []).filter((e) => e.challengeBookId === bookId)
      : (byParticipant.get(participant.id) ?? []);

    let value = 0;
    if (metric === 'words') {
      value = participantEvents.reduce((sum, e) => sum + e.newWordsCount, 0);
    } else if (metric === 'books') {
      const byBook = new Map<string, number>();
      for (const e of participantEvents) byBook.set(e.challengeBookId, Math.max(byBook.get(e.challengeBookId) ?? 0, e.endPage));
      value = [...byBook.entries()].filter(([bId, lastPage]) => lastPage >= (bookTotalPages.get(bId) ?? Infinity)).length;
    } else if (metric === 'speed') {
      const totalPages = participantEvents.reduce((sum, e) => sum + (e.endPage - e.startPage), 0);
      if (participantEvents.length === 0) {
        value = 0;
      } else {
        const dates = participantEvents.map((e) => new Date(e.createdAt!).setHours(0, 0, 0, 0));
        const dayMs = 24 * 60 * 60 * 1000;
        const dayCount = Math.round((Math.max(...dates) - Math.min(...dates)) / dayMs) + 1;
        value = Math.round((totalPages / dayCount) * 100) / 100;
      }
    } else {
      value = participantEvents.reduce((sum, e) => sum + (e.endPage - e.startPage), 0);
    }

    return {
      studentId: participant.studentId,
      studentName: participant.student.displayName,
      studentAvatarUrl: participant.student.displayAvatarUrl,
      value,
      isCurrentStudent: currentStudentId !== null && participant.studentId === currentStudentId,
    };
  });

  return {
    entries: scored
      .sort((a, b) => b.value - a.value || a.studentName.localeCompare(b.studentName, 'uz'))
      .map((entry, index) => ({ ...entry, rank: index + 1 })),
  };
}
