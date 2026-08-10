import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db';
import {
  challengeParticipants, challengeWordProgress, challengeWords, challenges, groupEnrollments, groups,
} from '../db/schema';

@Injectable()
export class StudentChallengeWordsService {
  private async assertEnrolled(challengeId: string, studentId: string) {
    const challenge = await db.query.challenges.findFirst({ where: eq(challenges.id, challengeId) });
    if (!challenge || challenge.type !== 'soz_yodlash') throw new NotFoundException('Challenge not found');

    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, challenge.courseId) });
    const groupIds = courseGroups.map((group) => group.id);
    if (groupIds.length === 0) throw new NotFoundException('Challenge not found');
    const enrollments = await db.query.groupEnrollments.findMany({
      where: and(inArray(groupEnrollments.groupId, groupIds), isNull(groupEnrollments.removedAt)),
      with: { schoolMember: true },
    });
    if (!enrollments.some((enrollment) => enrollment.schoolMember.studentId === studentId)) {
      throw new NotFoundException('Challenge not found');
    }
    return challenge;
  }

  private async requireParticipant(challengeId: string, studentId: string) {
    const participant = await db.query.challengeParticipants.findFirst({
      where: and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.studentId, studentId)),
    });
    if (!participant) throw new NotFoundException("Siz bu challenge-ga qo'shilmagansiz");
    return participant;
  }

  async listWords(challengeId: string, studentId: string) {
    await this.assertEnrolled(challengeId, studentId);
    const participant = await this.requireParticipant(challengeId, studentId);
    const words = await db.query.challengeWords.findMany({
      where: eq(challengeWords.challengeId, challengeId),
      orderBy: (word, { asc }) => [asc(word.orderIndex)],
    });
    const progress = await db.query.challengeWordProgress.findMany({
      where: eq(challengeWordProgress.challengeParticipantId, participant.id),
    });
    const knownByWord = new Map(progress.map((row) => [row.challengeWordId, row.known]));
    return words.map((word) => ({ id: word.id, word: word.word, translation: word.translation, known: knownByWord.get(word.id) ?? false }));
  }

  async setProgress(challengeId: string, wordId: string, studentId: string, known: boolean) {
    await this.assertEnrolled(challengeId, studentId);
    const participant = await this.requireParticipant(challengeId, studentId);
    const word = await db.query.challengeWords.findFirst({
      where: and(eq(challengeWords.id, wordId), eq(challengeWords.challengeId, challengeId)),
    });
    if (!word) throw new NotFoundException('Word not found');

    const [row] = await db.insert(challengeWordProgress).values({
      challengeParticipantId: participant.id,
      challengeWordId: wordId,
      known,
    }).onConflictDoUpdate({
      target: [challengeWordProgress.challengeParticipantId, challengeWordProgress.challengeWordId],
      set: { known, updatedAt: new Date() },
    }).returning();
    return { wordId: row.challengeWordId, known: row.known };
  }

  async leaderboard(challengeId: string, studentId: string) {
    await this.assertEnrolled(challengeId, studentId);
    const participants = await db.query.challengeParticipants.findMany({
      where: eq(challengeParticipants.challengeId, challengeId),
      with: { student: true },
    });
    if (participants.length === 0) return { entries: [] };
    const progress = await db.query.challengeWordProgress.findMany({
      where: inArray(challengeWordProgress.challengeParticipantId, participants.map((participant) => participant.id)),
    });
    const counts = new Map<string, number>();
    for (const row of progress) if (row.known) counts.set(row.challengeParticipantId, (counts.get(row.challengeParticipantId) ?? 0) + 1);
    const entries = participants.map((participant) => ({
      studentId: participant.studentId,
      studentName: participant.student.displayName,
      studentAvatarUrl: participant.student.displayAvatarUrl,
      value: counts.get(participant.id) ?? 0,
      isCurrentStudent: participant.studentId === studentId,
    })).sort((a, b) => b.value - a.value || a.studentName.localeCompare(b.studentName, 'uz'))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    return { entries };
  }
}
