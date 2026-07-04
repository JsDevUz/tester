import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { tests, submissions, answers, liveSessions } from '../db/schema';
import {
  LiveSession, LivePlayer, LiveQuestion, LiveBroadcaster, LeaderboardEntry, LiveTeam,
} from './live.types';
import {
  LIVE_TYPES, ALLOWED_TIMES, REVEAL_MS, SESSION_CLEANUP_MS, HOST_GRACE_MS,
  computePoints, generatePin, buildLeaderboard,
  makeTeamId, validateTeamsReady, TEAM_TYPES_WITH_SUGGESTIONS,
} from './live.logic';
import { gradeAnswer } from '../grading/grading';

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
    type: string; options: Array<{ id: string; text: string }>; timeSec: number; endsAt: number;
  } | null;
  me: { score: number; answeredCurrent: boolean } | null;
  leaderboard?: LeaderboardEntry[];
  teams?: Array<{ id: string; name: string; captainUserId: string | null; members: Array<{ userId: string; name: string }> }>;
  unassigned?: Array<{ userId: string; name: string }>;
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

  async listSessionHistory(adminId: string, limit: number, offset: number) {
    const rows = await db.query.liveSessions.findMany({
      where: eq(liveSessions.adminId, adminId),
      orderBy: (ls, { desc }) => [desc(ls.createdAt)],
      limit,
      offset,
      with: { test: true },
    });
    return rows.map((r: any) => ({
      id: r.id,
      pin: r.pin,
      testId: r.testId,
      testName: r.test?.name ?? '',
      mode: r.mode,
      status: r.status,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
    }));
  }

  async createSession(adminId: string, testId: string, questionTimeSec: number, mode: 'individual' | 'team' = 'individual') {
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

    const liveQuestions: LiveQuestion[] = test.questions.map((q) => ({
      id: q.id,
      text: q.text,
      imageUrl: q.imageUrl,
      type: q.type as LiveQuestion['type'],
      options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: !!o.isCorrect, orderIndex: o.orderIndex })),
      correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
      correctAnswer: q.correctAnswer ?? null,
    }));
    if (liveQuestions.length === 0) throw new Error('NO_LIVE_QUESTIONS');

    const pin = this.initSession(adminId, test.id, test.name, liveQuestions, questionTimeSec, mode);
    await db.insert(liveSessions).values({
      testId: test.id,
      adminId,
      pin,
      mode,
      questionTimeSec,
      status: 'active',
    });
    return { pin };
  }

  // testlarda db siz chaqiriladi
  initSession(
    adminId: string, testId: string, testName: string, questions: LiveQuestion[],
    questionTimeSec: number, mode: 'individual' | 'team' = 'individual',
  ): string {
    const pin = generatePin(new Set(this.sessions.keys()));
    this.sessions.set(pin, {
      pin, testId, testName,
      hostAdminId: adminId,
      hostSocketId: null,
      questionTimeSec,
      status: mode === 'team' ? 'team_assign' : 'lobby',
      questions,
      currentIdx: -1,
      questionStartedAt: 0,
      questionTimer: null,
      revealTimer: null,
      hostDisconnectTimer: null,
      players: new Map(),
      mode,
      teams: mode === 'team' ? new Map() : null,
      unassignedUserIds: mode === 'team' ? new Set() : null,
    });
    const s = this.sessions.get(pin)!;
    s.hostDisconnectTimer = setTimeout(() => { void this.finish(s); }, HOST_GRACE_MS);
    return pin;
  }

  // ── Gateway uchun ───────────────────────────────────────────

  async hostJoin(pin: string, adminId: string, socketId: string) {
    const s = this.sessions.get(pin);
    if (!s) {
      const staleRow = await db.query.liveSessions.findFirst({
        where: and(eq(liveSessions.pin, pin), eq(liveSessions.status, 'active')),
      });
      if (staleRow) {
        try {
          await db.update(liveSessions)
            .set({ status: 'finished', finishedAt: new Date() })
            .where(eq(liveSessions.id, staleRow.id));
        } catch (e) {
          console.error(`hostJoin: failed to self-heal stale session ${pin}`, e);
        }
      }
      throw new Error('NOT_FOUND');
    }
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    s.hostSocketId = socketId;
    if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }
    return { state: this.buildState(s, null) };
  }

  playerJoin(pin: string, user: { id: string; name: string }, socketId: string) {
    const s = this.mustGet(pin);
    if (s.status === 'finished' && !s.players.has(user.id)) throw new Error('NOT_FOUND');
    let player = s.players.get(user.id);
    if (!player) {
      player = { userId: user.id, name: user.name, socketId, score: 0, answers: new Map() };
      s.players.set(user.id, player);
      if (s.mode === 'team' && s.unassignedUserIds) s.unassignedUserIds.add(user.id);
    } else {
      player.socketId = socketId; // reconnect
    }
    this.broadcastLobby(s);
    if (s.mode === 'team') this.broadcastTeamUpdate(s);
    return { state: this.buildState(s, player) };
  }

  start(pin: string, adminId: string) {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    if (s.mode === 'team') throw new Error('NOT_INDIVIDUAL_MODE');
    if (s.status !== 'lobby') throw new Error('ALREADY_STARTED');
    this.startQuestion(s, 0);
  }

  private mustBeTeamMode(s: LiveSession): void {
    if (s.mode !== 'team' || !s.teams || !s.unassignedUserIds) throw new Error('NOT_TEAM_MODE');
  }

  createTeam(pin: string, adminId: string, name: string): { teamId: string } {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    this.mustBeTeamMode(s);
    const teamId = makeTeamId(s.teams!.size + 1);
    s.teams!.set(teamId, {
      id: teamId, name, captainUserId: null,
      memberUserIds: new Set(), score: 0,
      answers: new Map(), suggestions: new Map(),
    });
    this.broadcastTeamUpdate(s);
    return { teamId };
  }

  assignPlayer(pin: string, adminId: string, userId: string, teamId: string): void {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    this.mustBeTeamMode(s);
    const team = s.teams!.get(teamId);
    if (!team) throw new Error('TEAM_NOT_FOUND');
    for (const t of s.teams!.values()) t.memberUserIds.delete(userId);
    s.unassignedUserIds!.delete(userId);
    team.memberUserIds.add(userId);
    this.broadcastTeamUpdate(s);
  }

  setCaptain(pin: string, adminId: string, teamId: string, userId: string): void {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    this.mustBeTeamMode(s);
    const team = s.teams!.get(teamId);
    if (!team) throw new Error('TEAM_NOT_FOUND');
    if (!team.memberUserIds.has(userId)) throw new Error('NOT_TEAM_MEMBER');
    team.captainUserId = userId;
    this.broadcastTeamUpdate(s);
  }

  removeTeam(pin: string, adminId: string, teamId: string): void {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    this.mustBeTeamMode(s);
    const team = s.teams!.get(teamId);
    if (!team) throw new Error('TEAM_NOT_FOUND');
    // Guruh a'zolari taqsimlanmaganlar ro'yxatiga qaytariladi, yo'qolib ketmaydi.
    for (const uid of team.memberUserIds) s.unassignedUserIds!.add(uid);
    s.teams!.delete(teamId);
    this.broadcastTeamUpdate(s);
  }

  startTeamGame(pin: string, adminId: string): void {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    this.mustBeTeamMode(s);
    if (s.status !== 'lobby' && s.status !== 'team_assign') throw new Error('ALREADY_STARTED');
    const { ready } = validateTeamsReady([...s.teams!.values()]);
    if (!ready) throw new Error('TEAM_NOT_READY');
    this.startQuestion(s, 0);
  }

  suggest(pin: string, teamId: string, userId: string, optionId: string): void {
    const s = this.mustGet(pin);
    this.mustBeTeamMode(s);
    if (s.status !== 'question') throw new Error('NOT_QUESTION_PHASE');
    const team = s.teams!.get(teamId);
    if (!team) throw new Error('TEAM_NOT_FOUND');
    if (!team.memberUserIds.has(userId)) throw new Error('NOT_TEAM_MEMBER');
    const q = s.questions[s.currentIdx];
    if (!(TEAM_TYPES_WITH_SUGGESTIONS as readonly string[]).includes(q.type)) throw new Error('NOT_SUGGESTABLE_TYPE');

    if (!team.suggestions.has(q.id)) team.suggestions.set(q.id, new Map());
    const perUser = team.suggestions.get(q.id)!;
    const current = perUser.get(userId);
    if (current === optionId) {
      perUser.delete(userId); // un-suggest
    } else {
      perUser.set(userId, optionId); // set new, or replace prior choice
    }
    if (team.captainUserId) {
      const captain = s.players.get(team.captainUserId);
      if (captain?.socketId) {
        const payload: Record<string, number> = {};
        for (const oid of perUser.values()) payload[oid] = (payload[oid] ?? 0) + 1;
        this.broadcaster.toSocket(captain.socketId, 'team:suggestionUpdate', { questionId: q.id, counts: payload });
      }
    }
  }

  captainAnswer(pin: string, userId: string, questionId: string, selectedOptionIds: string[], textAnswer: string | null): void {
    const s = this.mustGet(pin);
    this.mustBeTeamMode(s);
    if (s.status !== 'question') throw new Error('NOT_QUESTION_PHASE');
    const q = s.questions[s.currentIdx];
    if (q.id !== questionId) throw new Error('WRONG_QUESTION');
    const team = this.findTeamByCaptain(s, userId);
    if (!team) throw new Error('NOT_CAPTAIN');
    if (team.answers.has(questionId)) throw new Error('ALREADY_ANSWERED');

    const validIds = new Set(q.options.map((o) => o.id));
    const filteredOptionIds = (selectedOptionIds ?? []).filter((id) => validIds.has(id));
    const timeMs = Date.now() - s.questionStartedAt;

    // gradeAnswer is async only for 'open' (Groq call); for team mode's synchronous state machine
    // we resolve it inline — fire-and-forget the async grade, then finalize when it resolves.
    void (async () => {
      const isCorrect = (await gradeAnswer(
        { type: q.type, correctAnswer: q.correctAnswer, options: q.options, text: q.text },
        { selectedOptionIds: filteredOptionIds, textAnswer },
        async () => false, // team mode does not call Groq for 'open' — captains type answers directly and are graded as ungraded/manual only; AI grading is out of scope for this spec
      )) ?? false;
      const points = computePoints(isCorrect, timeMs, s.questionTimeSec * 1000);
      team.answers.set(questionId, { selectedOptionIds: filteredOptionIds, isCorrect, points, timeMs });
      team.score += points;
      this.maybeRevealEarlyTeams(s);
    })();
  }

  private findTeamByCaptain(s: LiveSession, userId: string): LiveTeam | null {
    if (!s.teams) return null;
    for (const t of s.teams.values()) if (t.captainUserId === userId) return t;
    return null;
  }

  private maybeRevealEarlyTeams(s: LiveSession): void {
    if (s.status !== 'question' || !s.teams) return;
    const q = s.questions[s.currentIdx];
    const teamsWithCaptain = [...s.teams.values()].filter((t) => t.captainUserId !== null);
    if (teamsWithCaptain.length === 0) return;
    if (teamsWithCaptain.every((t) => t.answers.has(q.id))) {
      if (s.questionTimer) { clearTimeout(s.questionTimer); s.questionTimer = null; }
      this.reveal(s);
    }
  }

  private buildTeamUpdatePayload(s: LiveSession): { teams: Array<{ id: string; name: string; captainUserId: string | null; members: Array<{ userId: string; name: string }> }>; unassigned: Array<{ userId: string; name: string }> } | null {
    if (!s.teams || !s.unassignedUserIds) return null;
    const nameOf = (userId: string) => s.players.get(userId)?.name ?? '?';
    return {
      teams: [...s.teams.values()].map((t) => ({
        id: t.id, name: t.name, captainUserId: t.captainUserId,
        members: [...t.memberUserIds].map((uid) => ({ userId: uid, name: nameOf(uid) })),
      })),
      unassigned: [...s.unassignedUserIds].map((uid) => ({ userId: uid, name: nameOf(uid) })),
    };
  }

  private broadcastTeamUpdate(s: LiveSession): void {
    const payload = this.buildTeamUpdatePayload(s);
    if (payload) this.broadcaster.toRoom(s.pin, 'team:update', payload);
  }

  answer(pin: string, userId: string, questionId: string, selectedOptionIds: string[], textAnswer: string | null = null) {
    const s = this.mustGet(pin);
    if (s.status !== 'question') throw new Error('NOT_QUESTION_PHASE');
    const q = s.questions[s.currentIdx];
    if (q.id !== questionId) throw new Error('WRONG_QUESTION');
    const player = s.players.get(userId);
    if (!player) throw new Error('NOT_FOUND');
    if (player.answers.has(questionId)) throw new Error('ALREADY_ANSWERED');

    const validIds = new Set(q.options.map((o) => o.id));
    const filteredOptionIds = (selectedOptionIds ?? []).filter((id) => validIds.has(id));
    const timeMs = Date.now() - s.questionStartedAt;

    void (async () => {
      const isCorrect = (await gradeAnswer(
        { type: q.type, correctAnswer: q.correctAnswer, options: q.options, text: q.text },
        { selectedOptionIds: filteredOptionIds, textAnswer },
        async () => false, // individual Live Quiz does not call Groq for 'open' — same as team mode, out of scope for this spec
      )) ?? false;
      const points = computePoints(isCorrect, timeMs, s.questionTimeSec * 1000);
      player.answers.set(questionId, { selectedOptionIds: filteredOptionIds, isCorrect, points, timeMs });
      player.score += points;

      const answered = this.answeredCount(s);
      this.broadcaster.toRoom(s.pin, 'question:progress', { answered, total: s.players.size });
      this.maybeRevealEarly(s);
    })();
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
          if (s.mode === 'team' && s.teams) {
            for (const t of s.teams.values()) {
              if (t.captainUserId === p.userId) {
                t.captainUserId = null;
                if (s.hostSocketId) this.broadcaster.toSocket(s.hostSocketId, 'team:captainDisconnected', { teamId: t.id });
              }
            }
          }
          if (s.status === 'lobby' || s.status === 'team_assign') this.broadcastLobby(s);
          if (s.status === 'question') {
            if (s.mode === 'team') this.maybeRevealEarlyTeams(s);
            else this.maybeRevealEarly(s);
          }
          return;
        }
      }
    }
  }

  // ── Ichki state machine ─────────────────────────────────────

  // Hamma *ulangan* o'yinchi javob bergan bo'lsa darhol reveal.
  // Uzilgan o'yinchilar (socketId === null) kutilmaydi, lekin ular
  // question:progress dagi answered/total hisobida qolaveradi.
  private maybeRevealEarly(s: LiveSession) {
    if (s.status !== 'question') return;
    const q = s.questions[s.currentIdx];
    const connected = [...s.players.values()].filter((p) => p.socketId !== null);
    if (connected.length === 0) return;
    if (connected.every((p) => p.answers.has(q.id))) {
      if (s.questionTimer) { clearTimeout(s.questionTimer); s.questionTimer = null; }
      this.reveal(s);
    }
  }

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
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
      timeSec: s.questionTimeSec,
      endsAt: s.questionStartedAt + s.questionTimeSec * 1000,
    });
    s.questionTimer = setTimeout(() => this.reveal(s), s.questionTimeSec * 1000);
  }

  private reveal(s: LiveSession) {
    if (s.status !== 'question') return;
    s.status = 'reveal';
    const q = s.questions[s.currentIdx];

    if (s.mode === 'team' && s.teams) {
      const distribution: Record<string, number> = {};
      for (const opt of q.options) distribution[opt.id] = 0;
      for (const t of s.teams.values()) {
        const a = t.answers.get(q.id);
        if (a) for (const id of a.selectedOptionIds) if (id in distribution) distribution[id]++;
      }
      const teamLeaderboard = [...s.teams.values()]
        .sort((a, b) => b.score - a.score)
        .map((t, i) => ({ userId: t.id, name: t.name, score: t.score, rank: i + 1 }));

      this.broadcaster.toRoom(s.pin, 'question:reveal', {
        correctOptionIds: q.correctOptionIds,
        correctAnswer: q.correctAnswer,
        distribution,
        leaderboard: teamLeaderboard.slice(0, 5),
      });
      for (const t of s.teams.values()) {
        if (!t.captainUserId) continue;
        const captain = s.players.get(t.captainUserId);
        if (!captain?.socketId) continue;
        const a = t.answers.get(q.id);
        const rank = teamLeaderboard.find((e) => e.userId === t.id)?.rank ?? 0;
        this.broadcaster.toSocket(captain.socketId, 'question:reveal', {
          correctOptionIds: q.correctOptionIds,
          correctAnswer: q.correctAnswer,
          distribution,
          leaderboard: teamLeaderboard.slice(0, 5),
          isCorrect: a?.isCorrect ?? false,
          points: a?.points ?? 0,
          score: t.score,
          rank,
        });
      }
    } else {
      const distribution: Record<string, number> = {};
      for (const opt of q.options) distribution[opt.id] = 0;
      for (const p of s.players.values()) {
        const a = p.answers.get(q.id);
        if (a) for (const id of a.selectedOptionIds) if (id in distribution) distribution[id]++;
      }

      const leaderboard = buildLeaderboard([...s.players.values()]);
      this.broadcaster.toRoom(s.pin, 'question:reveal', {
        correctOptionIds: q.correctOptionIds,
        correctAnswer: q.correctAnswer,
        distribution,
        leaderboard: leaderboard.slice(0, 5),
      });
      for (const p of s.players.values()) {
        if (!p.socketId) continue;
        const a = p.answers.get(q.id);
        const rank = leaderboard.find((e) => e.userId === p.userId)?.rank ?? 0;
        this.broadcaster.toSocket(p.socketId, 'question:reveal', {
          correctOptionIds: q.correctOptionIds,
          correctAnswer: q.correctAnswer,
          distribution,
          leaderboard: leaderboard.slice(0, 5),
          isCorrect: a?.isCorrect ?? false,
          points: a?.points ?? 0,
          score: p.score,
          rank,
        });
      }
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

    const leaderboard = s.mode === 'team' && s.teams
      ? [...s.teams.values()].sort((a, b) => b.score - a.score).map((t, i) => ({ userId: t.id, name: t.name, score: t.score, rank: i + 1 }))
      : buildLeaderboard([...s.players.values()]);

    this.broadcaster.toRoom(s.pin, 'game:finished', { leaderboard });
    if (s.currentIdx >= 0) {
      if (s.mode === 'team') await this.persistTeamResults(s);
      else await this.persistResults(s);
    }
    try {
      await db.update(liveSessions)
        .set({ status: 'finished', finishedAt: new Date() })
        .where(and(eq(liveSessions.pin, s.pin), eq(liveSessions.status, 'active')));
    } catch (e) {
      console.error(`finish: failed to mark session ${s.pin} as finished`, e);
    }
    setTimeout(() => this.sessions.delete(s.pin), SESSION_CLEANUP_MS);
  }

  private async persistTeamResults(s: LiveSession) {
    if (!s.teams) return;
    for (const t of s.teams.values()) {
      try {
        const answersList = [...t.answers.entries()];
        const correctCount = answersList.filter(([, a]) => a.isCorrect).length;
        const finalCaptainUserId = t.captainUserId ?? [...t.memberUserIds][0] ?? null;
        const [sub] = await db.insert(submissions).values({
          testId: s.testId,
          userId: finalCaptainUserId,
          studentName: t.name,
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
      } catch (e) {
        console.error(`persistTeamResults: failed to persist team ${t.id} in session ${s.pin}`, e);
      }
    }
  }

  private async persistResults(s: LiveSession) {
    for (const p of s.players.values()) {
      try {
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
      } catch (e) {
        console.error(`persistResults: failed to persist player ${p.userId} in session ${s.pin}`, e);
      }
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
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        timeSec: s.questionTimeSec,
        endsAt: s.questionStartedAt + s.questionTimeSec * 1000,
      } : null,
      me: player ? {
        score: player.score,
        answeredCurrent: q ? player.answers.has(q.id) : false,
      } : null,
      ...(s.status === 'finished' ? { leaderboard: buildLeaderboard([...s.players.values()]) } : {}),
      ...(this.buildTeamUpdatePayload(s) ?? {}),
    };
  }
}
