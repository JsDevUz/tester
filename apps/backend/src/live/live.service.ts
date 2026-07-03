import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { tests, submissions, answers } from '../db/schema';
import {
  LiveSession, LivePlayer, LiveQuestion, LiveBroadcaster, LeaderboardEntry,
} from './live.types';
import {
  LIVE_TYPES, ALLOWED_TIMES, REVEAL_MS, SESSION_CLEANUP_MS, HOST_GRACE_MS,
  computePoints, isAnswerCorrect, generatePin, buildLeaderboard,
} from './live.logic';

export interface SessionStatePayload {
  pin: string;
  testName: string;
  status: string;
  playerCount: number;
  players: Array<{ name: string }>;
  questionTimeSec: number;
  totalQuestions: number;
  currentQuestion: {
    id: string; idx: number; total: number; text: string; imageUrl: string | null;
    type: string; options: Array<{ id: string; text: string }>; endsAt: number;
  } | null;
  me: { score: number; answeredCurrent: boolean } | null;
}

@Injectable()
export class LiveService {
  private sessions = new Map<string, LiveSession>();
  private broadcaster: LiveBroadcaster = { toRoom: () => {}, toSocket: () => {} };

  setBroadcaster(b: LiveBroadcaster) { this.broadcaster = b; }

  // ── REST uchun ──────────────────────────────────────────────

  async listTests(adminId: string) {
    const rows = await db.query.tests.findMany({
      where: eq(tests.adminId, adminId),
      with: { questions: true },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      liveQuestionCount: t.questions.filter((q) => (LIVE_TYPES as readonly string[]).includes(q.type)).length,
    }));
  }

  async createSession(adminId: string, testId: string, questionTimeSec: number) {
    if (!ALLOWED_TIMES.includes(questionTimeSec)) throw new Error('INVALID_TIME');
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, adminId)),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    if (!test) throw new Error('NOT_FOUND');

    const liveQuestions: LiveQuestion[] = test.questions
      .filter((q) => (LIVE_TYPES as readonly string[]).includes(q.type))
      .map((q) => ({
        id: q.id,
        text: q.text,
        imageUrl: q.imageUrl,
        type: q.type as LiveQuestion['type'],
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
      }));
    if (liveQuestions.length === 0) throw new Error('NO_LIVE_QUESTIONS');

    const pin = this.initSession(adminId, test.id, test.name, liveQuestions, questionTimeSec);
    return { pin };
  }

  // testlarda db siz chaqiriladi
  initSession(adminId: string, testId: string, testName: string, questions: LiveQuestion[], questionTimeSec: number): string {
    const pin = generatePin(new Set(this.sessions.keys()));
    this.sessions.set(pin, {
      pin, testId, testName,
      hostAdminId: adminId,
      hostSocketId: null,
      questionTimeSec,
      status: 'lobby',
      questions,
      currentIdx: -1,
      questionStartedAt: 0,
      questionTimer: null,
      revealTimer: null,
      hostDisconnectTimer: null,
      players: new Map(),
    });
    return pin;
  }

  // ── Gateway uchun ───────────────────────────────────────────

  hostJoin(pin: string, adminId: string, socketId: string) {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    s.hostSocketId = socketId;
    if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }
    return { state: this.buildState(s, null) };
  }

  playerJoin(pin: string, user: { id: string; name: string }, socketId: string) {
    const s = this.mustGet(pin);
    if (s.status === 'finished') throw new Error('NOT_FOUND');
    let player = s.players.get(user.id);
    if (!player) {
      player = { userId: user.id, name: user.name, socketId, score: 0, answers: new Map() };
      s.players.set(user.id, player);
    } else {
      player.socketId = socketId; // reconnect
    }
    this.broadcastLobby(s);
    return { state: this.buildState(s, player) };
  }

  start(pin: string, adminId: string) {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    if (s.status !== 'lobby') throw new Error('ALREADY_STARTED');
    this.startQuestion(s, 0);
  }

  answer(pin: string, userId: string, questionId: string, selectedOptionIds: string[]) {
    const s = this.mustGet(pin);
    if (s.status !== 'question') throw new Error('NOT_QUESTION_PHASE');
    const q = s.questions[s.currentIdx];
    if (q.id !== questionId) throw new Error('WRONG_QUESTION');
    const player = s.players.get(userId);
    if (!player) throw new Error('NOT_FOUND');
    if (player.answers.has(questionId)) throw new Error('ALREADY_ANSWERED');

    const timeMs = Date.now() - s.questionStartedAt;
    const isCorrect = isAnswerCorrect(q.correctOptionIds, selectedOptionIds);
    const points = computePoints(isCorrect, timeMs, s.questionTimeSec * 1000);
    player.answers.set(questionId, { selectedOptionIds, isCorrect, points, timeMs });
    player.score += points;

    const answered = this.answeredCount(s);
    this.broadcaster.toRoom(s.pin, 'question:progress', { answered, total: s.players.size });

    if (answered >= s.players.size) {
      if (s.questionTimer) { clearTimeout(s.questionTimer); s.questionTimer = null; }
      this.reveal(s);
    }
  }

  async end(pin: string, adminId: string) {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    await this.finish(s);
  }

  handleDisconnect(socketId: string) {
    for (const s of this.sessions.values()) {
      if (s.hostSocketId === socketId) {
        s.hostSocketId = null;
        if (s.status !== 'finished' && !s.hostDisconnectTimer) {
          s.hostDisconnectTimer = setTimeout(() => { void this.finish(s); }, HOST_GRACE_MS);
        }
        return;
      }
      for (const p of s.players.values()) {
        if (p.socketId === socketId) {
          p.socketId = null;
          if (s.status === 'lobby') this.broadcastLobby(s);
          return;
        }
      }
    }
  }

  // ── Ichki state machine ─────────────────────────────────────

  private startQuestion(s: LiveSession, idx: number) {
    s.status = 'question';
    s.currentIdx = idx;
    s.questionStartedAt = Date.now();
    const q = s.questions[idx];
    this.broadcaster.toRoom(s.pin, 'question:start', {
      id: q.id,
      idx,
      total: s.questions.length,
      text: q.text,
      imageUrl: q.imageUrl,
      type: q.type,
      options: q.options,
      timeSec: s.questionTimeSec,
      endsAt: s.questionStartedAt + s.questionTimeSec * 1000,
    });
    s.questionTimer = setTimeout(() => this.reveal(s), s.questionTimeSec * 1000);
  }

  private reveal(s: LiveSession) {
    if (s.status !== 'question') return;
    s.status = 'reveal';
    const q = s.questions[s.currentIdx];

    const distribution: Record<string, number> = {};
    for (const opt of q.options) distribution[opt.id] = 0;
    for (const p of s.players.values()) {
      const a = p.answers.get(q.id);
      if (a) for (const id of a.selectedOptionIds) if (id in distribution) distribution[id]++;
    }

    const leaderboard = buildLeaderboard([...s.players.values()]);
    this.broadcaster.toRoom(s.pin, 'question:reveal', {
      correctOptionIds: q.correctOptionIds,
      distribution,
      leaderboard: leaderboard.slice(0, 5),
    });
    for (const p of s.players.values()) {
      if (!p.socketId) continue;
      const a = p.answers.get(q.id);
      const rank = leaderboard.find((e) => e.userId === p.userId)?.rank ?? 0;
      this.broadcaster.toSocket(p.socketId, 'question:reveal', {
        correctOptionIds: q.correctOptionIds,
        distribution,
        leaderboard: leaderboard.slice(0, 5),
        isCorrect: a?.isCorrect ?? false,
        points: a?.points ?? 0,
        score: p.score,
        rank,
      });
    }

    s.revealTimer = setTimeout(() => {
      if (s.currentIdx + 1 < s.questions.length) {
        this.startQuestion(s, s.currentIdx + 1);
      } else {
        void this.finish(s);
      }
    }, REVEAL_MS);
  }

  private async finish(s: LiveSession) {
    if (s.status === 'finished') return;
    s.status = 'finished';
    if (s.questionTimer) clearTimeout(s.questionTimer);
    if (s.revealTimer) clearTimeout(s.revealTimer);
    if (s.hostDisconnectTimer) clearTimeout(s.hostDisconnectTimer);

    this.broadcaster.toRoom(s.pin, 'game:finished', {
      leaderboard: buildLeaderboard([...s.players.values()]),
    });
    await this.persistResults(s);
    setTimeout(() => this.sessions.delete(s.pin), SESSION_CLEANUP_MS);
  }

  private async persistResults(s: LiveSession) {
    for (const p of s.players.values()) {
      const answersList = [...p.answers.entries()];
      const correctCount = answersList.filter(([, a]) => a.isCorrect).length;
      const [sub] = await db.insert(submissions).values({
        testId: s.testId,
        userId: p.userId,
        studentName: p.name,
        submittedAt: new Date(),
        score: correctCount,
        total: s.questions.length,
        mode: 'live',
      }).returning();
      const rows = answersList.map(([questionId, a]) => ({
        submissionId: sub.id,
        questionId,
        selectedOptionIds: a.selectedOptionIds,
        isCorrect: a.isCorrect,
      }));
      if (rows.length > 0) await db.insert(answers).values(rows);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private mustGet(pin: string): LiveSession {
    const s = this.sessions.get(pin);
    if (!s) throw new Error('NOT_FOUND');
    return s;
  }

  private answeredCount(s: LiveSession): number {
    const q = s.questions[s.currentIdx];
    let n = 0;
    for (const p of s.players.values()) if (p.answers.has(q.id)) n++;
    return n;
  }

  private broadcastLobby(s: LiveSession) {
    this.broadcaster.toRoom(s.pin, 'lobby:update', {
      players: [...s.players.values()].map((p) => ({ name: p.name })),
      count: s.players.size,
    });
  }

  private buildState(s: LiveSession, player: LivePlayer | null): SessionStatePayload {
    const q = s.status === 'question' || s.status === 'reveal' ? s.questions[s.currentIdx] : null;
    return {
      pin: s.pin,
      testName: s.testName,
      status: s.status,
      playerCount: s.players.size,
      players: [...s.players.values()].map((p) => ({ name: p.name })),
      questionTimeSec: s.questionTimeSec,
      totalQuestions: s.questions.length,
      currentQuestion: q ? {
        id: q.id,
        idx: s.currentIdx,
        total: s.questions.length,
        text: q.text,
        imageUrl: q.imageUrl,
        type: q.type,
        options: q.options,
        endsAt: s.questionStartedAt + s.questionTimeSec * 1000,
      } : null,
      me: player ? {
        score: player.score,
        answeredCurrent: q ? player.answers.has(q.id) : false,
      } : null,
    };
  }
}
