import { ForbiddenException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
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
import { RedisSessionStore } from '../redis/redis-session.store';
import { RedisService } from '../redis/redis.service';

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

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly sessionStore?: RedisSessionStore,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private sessionKey(pin: string) { return `live:session:${pin}`; }

  async withSession<T>(pin: string, action: () => Promise<T> | T): Promise<T> {
    const store = this.sessionStore;
    if (!store) return action();
    return store.transaction(this.sessionKey(pin), async () => {
      const shared = await store.get<LiveSession>(this.sessionKey(pin));
      if (shared) this.sessions.set(pin, shared);
      const result = await action();
      const current = this.sessions.get(pin);
      if (current) await store.set(this.sessionKey(pin), current);
      return result;
    });
  }

  private async loadSharedSession(pin: string): Promise<LiveSession | null> {
    const shared = this.sessionStore
      ? await this.sessionStore.get<LiveSession>(this.sessionKey(pin))
      : null;
    if (shared) this.sessions.set(pin, shared);
    return shared ?? this.sessions.get(pin) ?? null;
  }

  private async indexSocket(socketId: string, pin: string) {
    if (this.redis?.enabled) await this.redis.raw.set(`live:socket:${socketId}`, pin, { EX: 86_400 });
  }

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
      questionCount: t.questions.length,
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
    await this.sessionStore?.set(this.sessionKey(pin), this.sessions.get(pin));
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
    await this.indexSocket(socketId, pin);
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
    void this.indexSocket(socketId, pin);
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
    const teamId = team.id;
    team.answers.set(questionId, { selectedOptionIds: filteredOptionIds, isCorrect: false, points: 0, timeMs });

    // gradeAnswer is async only for 'open' (Groq call); for team mode's synchronous state machine
    // we resolve it inline — fire-and-forget the async grade, then finalize when it resolves.
    void (async () => {
      const isCorrect = (await gradeAnswer(
        { type: q.type, correctAnswer: q.correctAnswer, options: q.options, text: q.text },
        { selectedOptionIds: filteredOptionIds, textAnswer },
        async () => false, // team mode does not call Groq for 'open' — captains type answers directly and are graded as ungraded/manual only; AI grading is out of scope for this spec
      )) ?? false;
      await this.withSession(pin, () => {
        const latest = this.mustGet(pin);
        const latestTeam = latest.teams?.get(teamId);
        if (!latestTeam) return;
        const points = computePoints(isCorrect, timeMs, latest.questionTimeSec * 1000);
        latestTeam.answers.set(questionId, { selectedOptionIds: filteredOptionIds, isCorrect, points, timeMs });
        latestTeam.score += points;
        this.maybeRevealEarlyTeams(latest);
      });
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
    player.answers.set(questionId, { selectedOptionIds: filteredOptionIds, isCorrect: false, points: 0, timeMs });

    void (async () => {
      const isCorrect = (await gradeAnswer(
        { type: q.type, correctAnswer: q.correctAnswer, options: q.options, text: q.text },
        { selectedOptionIds: filteredOptionIds, textAnswer },
        async () => false, // individual Live Quiz does not call Groq for 'open' — same as team mode, out of scope for this spec
      )) ?? false;
      await this.withSession(pin, () => {
        const latest = this.mustGet(pin);
        const latestPlayer = latest.players.get(userId);
        if (!latestPlayer) return;
        const points = computePoints(isCorrect, timeMs, latest.questionTimeSec * 1000);
        latestPlayer.answers.set(questionId, { selectedOptionIds: filteredOptionIds, isCorrect, points, timeMs });
        latestPlayer.score += points;
        const answered = this.answeredCount(latest);
        this.broadcaster.toRoom(latest.pin, 'question:progress', { answered, total: latest.players.size });
        this.maybeRevealEarly(latest);
      });
    })();
  }

  async end(pin: string, adminId: string) {
    const s = this.mustGet(pin);
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    await this.finish(s);
  }

  // ---------- Ovoz (LiveKit) ----------

  private livekitConfig(): { url: string; apiKey: string; apiSecret: string } | null {
    const url = this.config.get<string>('LIVEKIT_URL');
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) return null;
    return { url, apiKey, apiSecret };
  }

  // Musobaqada ishtirokchi bo'lish — individual rejimda players xaritasida,
  // jamoa rejimida esa istalgan jamoa a'zosi bo'lishi kifoya (faqat kapitan
  // emas, chunki barcha a'zolar ovozda gaplasha olishi kerak).
  private isParticipant(s: LiveSession, userId: string): boolean {
    if (s.players.has(userId)) return true;
    if (s.teams) {
      for (const t of s.teams.values()) if (t.memberUserIds.has(userId)) return true;
    }
    return false;
  }

  async voiceToken(pin: string, userId: string, displayName: string): Promise<{ token: string; url: string }> {
    const s = await this.loadSharedSession(pin);
    if (!s) throw new NotFoundException('Musobaqa topilmadi yoki allaqachon tugagan');
    const isHost = s.hostAdminId === userId;
    if (!isHost && !this.isParticipant(s, userId)) throw new ForbiddenException('Siz bu musobaqaning ishtirokchisi emassiz');

    const cfg = this.livekitConfig();
    if (!cfg) throw new ServiceUnavailableException('VOICE_DISABLED');

    const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
      identity: userId,
      name: displayName,
      ttl: '10h',
    });
    at.addGrant({
      roomJoin: true,
      room: `live-${pin}`,
      canPublish: true,
      canSubscribe: true,
      roomAdmin: isHost,
    });
    return { token: await at.toJwt(), url: cfg.url };
  }

  async muteParticipant(pin: string, adminId: string, targetUserId: string): Promise<void> {
    const s = await this.loadSharedSession(pin);
    if (!s) throw new NotFoundException('Musobaqa topilmadi yoki allaqachon tugagan');
    if (s.hostAdminId !== adminId) throw new ForbiddenException();
    const cfg = this.livekitConfig();
    if (!cfg) throw new ServiceUnavailableException('VOICE_DISABLED');

    const httpUrl = cfg.url.replace(/^ws/, 'http');
    const client = new RoomServiceClient(httpUrl, cfg.apiKey, cfg.apiSecret);
    const room = `live-${pin}`;
    const participants = await client.listParticipants(room);
    const target = participants.find((p) => p.identity === targetUserId);
    if (!target) throw new NotFoundException('Ishtirokchi ovoz xonasida emas');
    for (const track of target.tracks) {
      if (track.type === 1 /* AUDIO */ && !track.muted) {
        await client.mutePublishedTrack(room, targetUserId, track.sid, true);
      }
    }
  }

  handleDisconnect(socketId: string): void | Promise<void> {
    if (!this.redis?.enabled) {
      for (const s of this.sessions.values()) {
        if (this.disconnectFromSession(s, socketId)) return;
      }
      return;
    }
    return this.handleDistributedDisconnect(socketId);
  }

  private async handleDistributedDisconnect(socketId: string): Promise<void> {
    const indexedPin = await this.redis!.raw.get(`live:socket:${socketId}`);
    const pins = indexedPin ? [indexedPin] : [...this.sessions.keys()];
    for (const pin of pins) {
      await this.withSession(pin, async () => {
        const s = this.sessions.get(pin);
        if (s) this.disconnectFromSession(s, socketId);
      });
    }
    await this.redis!.raw.del(`live:socket:${socketId}`);
  }

  private disconnectFromSession(s: LiveSession, socketId: string): boolean {
    if (s.hostSocketId === socketId) {
      s.hostSocketId = null;
      if (s.status !== 'finished' && !s.hostDisconnectTimer) {
        s.hostDisconnectTimer = setTimeout(() => { void this.finish(s); }, HOST_GRACE_MS);
      }
      return true;
    }
    for (const p of s.players.values()) {
      if (p.socketId !== socketId) continue;
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
      return true;
    }
    return false;
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
    s.questionTimer = setTimeout(() => {
      void this.withSession(s.pin, () => this.reveal(this.mustGet(s.pin)));
    }, s.questionTimeSec * 1000);
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
      void this.withSession(s.pin, async () => {
        const latest = this.mustGet(s.pin);
        if (latest.currentIdx + 1 < latest.questions.length) {
          this.startQuestion(latest, latest.currentIdx + 1);
        } else {
          await this.finish(latest);
        }
      });
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
    setTimeout(() => {
      this.sessions.delete(s.pin);
      void this.sessionStore?.delete(this.sessionKey(s.pin));
    }, SESSION_CLEANUP_MS);
    await this.sessionStore?.set(this.sessionKey(s.pin), s, Math.ceil(SESSION_CLEANUP_MS / 1000));
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
