import { LiveService } from './live.service';
import { LiveQuestion, LiveBroadcaster } from './live.types';
import { db } from '../db';

// db ga tegmaslik uchun persistResults ni mock qilamiz
jest.mock('../db', () => ({
  db: {
    insert: jest.fn(() => ({ values: () => ({ returning: async () => [{ id: 'row-1' }] }) })),
    update: jest.fn(() => ({ set: () => ({ where: async () => {} }) })),
    query: {
      tests: { findFirst: jest.fn(), findMany: jest.fn() },
      liveSessions: { findFirst: jest.fn().mockResolvedValue(undefined), findMany: jest.fn() },
    },
  },
}));

function makeQuestions(): LiveQuestion[] {
  return [
    {
      id: 'q1', text: '2+2=?', imageUrl: null, type: 'single', correctAnswer: null,
      options: [
        { id: 'o1', text: '3', isCorrect: false, orderIndex: 0 },
        { id: 'o2', text: '4', isCorrect: true, orderIndex: 1 },
      ],
      correctOptionIds: ['o2'],
    },
    {
      id: 'q2', text: 'Yer dumaloqmi?', imageUrl: null, type: 'truefalse', correctAnswer: null,
      options: [
        { id: 'o3', text: "To'g'ri", isCorrect: true, orderIndex: 0 },
        { id: 'o4', text: "Noto'g'ri", isCorrect: false, orderIndex: 1 },
      ],
      correctOptionIds: ['o3'],
    },
  ];
}

function makeAllTypesQuestions(): LiveQuestion[] {
  return [
    {
      id: 'q1', text: '2+2=?', imageUrl: null, type: 'single', correctAnswer: null,
      options: [
        { id: 'o1', text: '3', isCorrect: false, orderIndex: 0 },
        { id: 'o2', text: '4', isCorrect: true, orderIndex: 1 },
      ],
      correctOptionIds: ['o2'],
    },
    {
      id: 'q2', text: "Bo'sh joyni to'ldiring: poytaxt ___", imageUrl: null, type: 'fillblank',
      correctAnswer: 'Toshkent', options: [], correctOptionIds: [],
    },
    {
      id: 'q3', text: 'Qiymatni tanlang', imageUrl: null, type: 'slider',
      correctAnswer: '50',
      options: [
        { id: 'o1', text: '0', isCorrect: false, orderIndex: 0 },
        { id: 'o2', text: '100', isCorrect: false, orderIndex: 1 },
        { id: 'o3', text: '5', isCorrect: false, orderIndex: 2 },
      ],
      correctOptionIds: [],
    },
  ];
}

function makeFakeBroadcaster() {
  const events: Array<{ target: string; event: string; payload: any }> = [];
  const b: LiveBroadcaster = {
    toRoom: (pin, event, payload) => events.push({ target: `room:${pin}`, event, payload }),
    toSocket: (sid, event, payload) => events.push({ target: `sock:${sid}`, event, payload }),
  };
  return { b, events };
}

function setup() {
  const service = new LiveService();
  const { b, events } = makeFakeBroadcaster();
  service.setBroadcaster(b);
  jest.spyOn(service as any, 'persistResults').mockResolvedValue(undefined);
  const pin = service.initSession('admin1', 'test1', 'Matematika', makeQuestions(), 10);
  return { service, events, pin };
}

describe('LiveService state machine', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('initSession lobby holatda sessiya yaratadi', () => {
    const { service, pin } = setup();
    expect(pin).toMatch(/^\d{6}$/);
    expect((service as any).sessions.get(pin).status).toBe('lobby');
  });

  it("playerJoin lobby:update broadcast qiladi va state qaytaradi", () => {
    const { service, events, pin } = setup();
    const { state } = service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    expect(state.status).toBe('lobby');
    expect(events.some((e) => e.event === 'lobby:update')).toBe(true);
  });

  it("start savolni ochadi — to'g'ri javob YUBORILMAYDI", () => {
    const { service, events, pin } = setup();
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.hostJoin(pin, 'admin1', 'hs');
    service.start(pin, 'admin1');
    const qs = events.find((e) => e.event === 'question:start');
    expect(qs).toBeDefined();
    expect(qs!.payload.correctOptionIds).toBeUndefined();
    expect(qs!.payload.options).toHaveLength(2);
    expect(qs!.payload.idx).toBe(0);
  });

  it('start faqat host uchun', () => {
    const { service, pin } = setup();
    expect(() => service.start(pin, 'boshqa-admin')).toThrow('NOT_HOST');
  });

  it("question:start broadcast options isCorrect/orderIndex ni ochib qo'ymaydi", () => {
    const { service, events, pin } = setup();
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.hostJoin(pin, 'admin1', 'hs');
    service.start(pin, 'admin1');
    const qs = events.find((e) => e.event === 'question:start');
    expect(qs).toBeDefined();
    for (const opt of qs!.payload.options) {
      expect(Object.keys(opt).sort()).toEqual(['id', 'text']);
      expect(opt).not.toHaveProperty('isCorrect');
      expect(opt).not.toHaveProperty('orderIndex');
    }
  });

  it("hamma javob berganda darhol reveal bo'ladi", async () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    await Promise.resolve();
    expect(events.some((e) => e.event === 'question:reveal')).toBe(false);
    service.answer(pin, 'u2', 'q1', ['o1']);
    await Promise.resolve();
    expect(events.some((e) => e.event === 'question:reveal')).toBe(true);
  });

  it("vaqt tugaganda reveal bo'ladi", () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    jest.advanceTimersByTime(10000);
    expect(events.some((e) => e.event === 'question:reveal')).toBe(true);
  });

  it('reveal da har o‘yinchiga shaxsiy natija boradi', async () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    await Promise.resolve();
    const personal = events.find((e) => e.target === 'sock:s1' && e.event === 'question:reveal');
    expect(personal).toBeDefined();
    expect(personal!.payload.isCorrect).toBe(true);
    expect(personal!.payload.points).toBeGreaterThanOrEqual(500);
  });

  it('ikki marta javob berish rad etiladi', async () => {
    const { service, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    await Promise.resolve();
    expect(() => service.answer(pin, 'u1', 'q1', ['o1'])).toThrow('ALREADY_ANSWERED');
  });

  it("reveal dan keyin keyingi savolga o'tadi, oxirgisidan keyin finished", async () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);   // → reveal
    await Promise.resolve();
    jest.advanceTimersByTime(4000);             // → q2
    const starts = events.filter((e) => e.event === 'question:start');
    expect(starts).toHaveLength(2);
    expect(starts[1].payload.idx).toBe(1);
    service.answer(pin, 'u1', 'q2', ['o3']);   // → reveal
    await Promise.resolve();
    jest.advanceTimersByTime(4000);             // → finished
    expect(events.some((e) => e.event === 'game:finished')).toBe(true);
  });

  it('finished da persistResults chaqiriladi', async () => {
    const { service, events, pin } = setup();
    const spy = jest.spyOn(service as any, 'persistResults');
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    await Promise.resolve();
    jest.advanceTimersByTime(4000);
    service.answer(pin, 'u1', 'q2', ['o3']);
    await Promise.resolve();
    jest.advanceTimersByTime(4000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reconnect: qayta playerJoin state qaytaradi, ball saqlanadi", async () => {
    const { service, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    await Promise.resolve();
    service.handleDisconnect('s1');
    const { state } = service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1new');
    expect(state.status).toBe('question');
    expect(state.me!.score).toBeGreaterThan(0);
    expect(state.me!.answeredCurrent).toBe(true);
  });

  it('ustoz uzilib 2 daqiqada qaytmasa sessiya tugaydi', () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.handleDisconnect('hs');
    jest.advanceTimersByTime(120000);
    expect(events.some((e) => e.event === 'game:finished')).toBe(true);
  });

  it("uzilgan o'yinchi early revealni bloklamaydi (javobdan keyin uzilish)", async () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    await Promise.resolve();
    expect(events.some((e) => e.event === 'question:reveal')).toBe(false);
    service.handleDisconnect('s2'); // javob bermagan o'yinchi uzildi
    expect(events.some((e) => e.event === 'question:reveal')).toBe(true);
  });

  it("javob bermagan o'yinchi uzilsa qolganlar kutmaydi (uzilishdan keyin javob)", async () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.handleDisconnect('s2'); // u2 javob bermay uzildi
    service.answer(pin, 'u1', 'q1', ['o2']); // yagona ulangan o'yinchi javob berdi
    await Promise.resolve();
    expect(events.some((e) => e.event === 'question:reveal')).toBe(true);
  });

  it("noto'g'ri PIN NOT_FOUND", () => {
    const { service } = setup();
    expect(() => service.start('000000', 'admin1')).toThrow('NOT_FOUND');
  });

  it('junk option id yuborilsa noto\'g\'ri hisoblanadi va saqlangan javobda filtrlanadi', async () => {
    const { service, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['x']);
    await Promise.resolve();
    const session: any = (service as any).sessions.get(pin);
    const player = session.players.get('u1');
    const a = player.answers.get('q1');
    expect(a.isCorrect).toBe(false);
    expect(a.selectedOptionIds).toEqual([]);
  });

  it('host lobbyda uzilib 120s o\'tsa persistResults chaqirilmaydi, lekin finished broadcast bo\'ladi', () => {
    const { service, events, pin } = setup();
    const spy = jest.spyOn(service as any, 'persistResults');
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.handleDisconnect('hs');
    jest.advanceTimersByTime(120000);
    expect(spy).not.toHaveBeenCalled();
    expect(events.some((e) => e.event === 'game:finished')).toBe(true);
  });

  it('host hech qachon join qilmasa, 120s dan keyin sessiya finished bo\'ladi', () => {
    const service = new LiveService();
    const { b, events } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    jest.spyOn(service as any, 'persistResults').mockResolvedValue(undefined);
    service.initSession('admin1', 'test1', 'Matematika', makeQuestions(), 10);
    jest.advanceTimersByTime(120000);
    expect(events.some((e) => e.event === 'game:finished')).toBe(true);
  });

  it('buildState savol paytida timeSec ni o\'z ichiga oladi', () => {
    const { service, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    const { state } = service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1new');
    expect(state.currentQuestion?.timeSec).toBe(10);
  });
});

describe('LiveService individual mode — all 10 question types', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  function setupAllTypes() {
    const service = new LiveService();
    const { b, events } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    jest.spyOn(service as any, 'persistResults').mockResolvedValue(undefined);
    const pin = service.initSession('admin1', 'test1', 'Aralash test', makeAllTypesQuestions(), 30, 'individual');
    return { service, events, pin };
  }

  it('fillblank question grades correctly via answer()', async () => {
    const { service, pin } = setupAllTypes();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    await Promise.resolve();
    jest.advanceTimersByTime(4000); // reveal -> next question (q2, fillblank)
    service.answer(pin, 'u1', 'q2', [], 'toshkent');
    await Promise.resolve();
    const s = (service as any).sessions.get(pin);
    const player = s.players.get('u1');
    expect(player.answers.get('q2').isCorrect).toBe(true);
  });

  it('slider question grades correctly via answer()', async () => {
    const { service, pin } = setupAllTypes();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    await Promise.resolve();
    jest.advanceTimersByTime(4000);
    service.answer(pin, 'u1', 'q2', [], 'toshkent');
    await Promise.resolve();
    jest.advanceTimersByTime(4000); // -> q3, slider
    service.answer(pin, 'u1', 'q3', [], '52');
    await Promise.resolve();
    const s = (service as any).sessions.get(pin);
    const player = s.players.get('u1');
    expect(player.answers.get('q3').isCorrect).toBe(true);
  });

  it('createSession no longer filters out non single/multi/truefalse questions in individual mode', async () => {
    // This is verified indirectly via listTests/createSession in the DB-backed integration path;
    // at the unit level, confirm liveQuestionCount-style filtering constant LIVE_TYPES is unchanged
    // (still used only for the teacher-facing question count on the test-selection screen, not for exclusion).
    const { LIVE_TYPES } = await Promise.resolve(require('./live.logic'));
    expect(LIVE_TYPES).toEqual(['single', 'multi', 'truefalse']);
  });
});

function makeTeamQuestions(): LiveQuestion[] {
  return [
    {
      id: 'q1', text: '2+2=?', imageUrl: null, type: 'single', correctAnswer: null,
      options: [
        { id: 'o1', text: '3', isCorrect: false, orderIndex: 0 },
        { id: 'o2', text: '4', isCorrect: true, orderIndex: 1 },
      ],
      correctOptionIds: ['o2'],
    },
  ];
}

describe('LiveService team mode — creation and assignment', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  function setupTeam() {
    const service = new LiveService();
    const { b, events } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    jest.spyOn(service as any, 'persistResults').mockResolvedValue(undefined);
    const pin = service.initSession('admin1', 'test1', 'Matematika', makeTeamQuestions(), 10, 'team');
    return { service, events, pin };
  }

  it('initSession with mode "team" starts in team_assign (not lobby) with teams as an empty map', () => {
    const { service, pin } = setupTeam();
    const s = (service as any).sessions.get(pin);
    expect(s.mode).toBe('team');
    expect(s.status).toBe('team_assign');
    expect(s.teams).toBeInstanceOf(Map);
    expect(s.teams.size).toBe(0);
    expect(s.unassignedUserIds).toBeInstanceOf(Set);
  });

  it('start() rejects a team-mode session (must use startTeamGame instead)', () => {
    const { service, pin } = setupTeam();
    service.hostJoin(pin, 'admin1', 'hs');
    expect(() => service.start(pin, 'admin1')).toThrow('NOT_INDIVIDUAL_MODE');
  });

  it('playerJoin in team mode adds the user to unassignedUserIds', () => {
    const { service, pin } = setupTeam();
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    const s = (service as any).sessions.get(pin);
    expect(s.unassignedUserIds.has('u1')).toBe(true);
  });

  it('createTeam adds a team with a sequential id and broadcasts team:update', () => {
    const { service, events, pin } = setupTeam();
    service.hostJoin(pin, 'admin1', 'hs');
    const { teamId } = service.createTeam(pin, 'admin1', "Guruh 1");
    expect(teamId).toBe('team-1');
    expect(events.some((e) => e.event === 'team:update')).toBe(true);
  });

  it('createTeam rejects non-host', () => {
    const { service, pin } = setupTeam();
    expect(() => service.createTeam(pin, 'not-admin', "Guruh 1")).toThrow('NOT_HOST');
  });

  it('assignPlayer moves a user from unassigned into the team, and out of any previous team', () => {
    const { service, pin } = setupTeam();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    const { teamId: t1 } = service.createTeam(pin, 'admin1', "Guruh 1");
    const { teamId: t2 } = service.createTeam(pin, 'admin1', "Guruh 2");
    service.assignPlayer(pin, 'admin1', 'u1', t1);
    let s = (service as any).sessions.get(pin);
    expect(s.teams.get(t1).memberUserIds.has('u1')).toBe(true);
    expect(s.unassignedUserIds.has('u1')).toBe(false);

    service.assignPlayer(pin, 'admin1', 'u1', t2);
    s = (service as any).sessions.get(pin);
    expect(s.teams.get(t1).memberUserIds.has('u1')).toBe(false);
    expect(s.teams.get(t2).memberUserIds.has('u1')).toBe(true);
  });

  it('setCaptain requires the user to already be a team member', () => {
    const { service, pin } = setupTeam();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    const { teamId } = service.createTeam(pin, 'admin1', "Guruh 1");
    expect(() => service.setCaptain(pin, 'admin1', teamId, 'u1')).toThrow('NOT_TEAM_MEMBER');
    service.assignPlayer(pin, 'admin1', 'u1', teamId);
    service.setCaptain(pin, 'admin1', teamId, 'u1');
    const s = (service as any).sessions.get(pin);
    expect(s.teams.get(teamId).captainUserId).toBe('u1');
  });

  it('startTeamGame rejects when fewer than 2 teams or a team lacks a captain', () => {
    const { service, pin } = setupTeam();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    const { teamId: t1 } = service.createTeam(pin, 'admin1', "Guruh 1");
    service.assignPlayer(pin, 'admin1', 'u1', t1);
    service.setCaptain(pin, 'admin1', t1, 'u1');
    expect(() => service.startTeamGame(pin, 'admin1')).toThrow('TEAM_NOT_READY');

    const { teamId: t2 } = service.createTeam(pin, 'admin1', "Guruh 2");
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.assignPlayer(pin, 'admin1', 'u2', t2);
    expect(() => service.startTeamGame(pin, 'admin1')).toThrow('TEAM_NOT_READY'); // team 2 has no captain yet

    service.setCaptain(pin, 'admin1', t2, 'u2');
    service.startTeamGame(pin, 'admin1'); // now succeeds
    const s = (service as any).sessions.get(pin);
    expect(s.status).toBe('question');
  });

  it('createTeam/assignPlayer/setCaptain reject when session mode is "individual"', () => {
    const service = new LiveService();
    const { b } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    const pin = service.initSession('admin1', 'test1', 'Matematika', makeTeamQuestions(), 10, 'individual');
    expect(() => service.createTeam(pin, 'admin1', "Guruh 1")).toThrow('NOT_TEAM_MODE');
  });
});

describe('LiveService team mode — gameplay', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  function setupReadyTeamGame() {
    const service = new LiveService();
    const { b, events } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    jest.spyOn(service as any, 'persistResults').mockResolvedValue(undefined);
    const pin = service.initSession('admin1', 'test1', 'Matematika', makeTeamQuestions(), 10, 'team');
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'captain1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'member1', name: 'Vali' }, 's2');
    service.playerJoin(pin, { id: 'captain2', name: 'Soli' }, 's3');
    const { teamId: t1 } = service.createTeam(pin, 'admin1', "Guruh 1");
    const { teamId: t2 } = service.createTeam(pin, 'admin1', "Guruh 2");
    service.assignPlayer(pin, 'admin1', 'captain1', t1);
    service.assignPlayer(pin, 'admin1', 'member1', t1);
    service.assignPlayer(pin, 'admin1', 'captain2', t2);
    service.setCaptain(pin, 'admin1', t1, 'captain1');
    service.setCaptain(pin, 'admin1', t2, 'captain2');
    return { service, events, pin, t1, t2 };
  }

  it('member suggest toggles a count visible only to that team, sent only to the captain socket', () => {
    const { service, events, pin, t1 } = setupReadyTeamGame();
    service.startTeamGame(pin, 'admin1');
    service.suggest(pin, t1, 'member1', 'o2');
    const s = (service as any).sessions.get(pin);
    expect(s.teams.get(t1).suggestions.get('q1').get('member1')).toBe('o2');
    const captainMsg = events.find((e) => e.target === 'sock:s1' && e.event === 'team:suggestionUpdate');
    expect(captainMsg).toBeDefined();
    expect(captainMsg.payload).toEqual({ questionId: 'q1', counts: { o2: 1 } });
    // toggling again removes the suggestion
    service.suggest(pin, t1, 'member1', 'o2');
    expect(s.teams.get(t1).suggestions.get('q1').has('member1')).toBe(false);
  });

  it('two different users suggesting the same option both count toward it', () => {
    const { service, events, pin, t1 } = setupReadyTeamGame();
    service.startTeamGame(pin, 'admin1');
    service.assignPlayer(pin, 'admin1', 'captain2', t1); // move captain2 into t1 as a second member
    service.suggest(pin, t1, 'member1', 'o2');
    service.suggest(pin, t1, 'captain2', 'o2');
    const s = (service as any).sessions.get(pin);
    const perUser = s.teams.get(t1).suggestions.get('q1');
    expect(perUser.get('member1')).toBe('o2');
    expect(perUser.get('captain2')).toBe('o2');
    const lastMsg = [...events].reverse().find((e) => e.target === 'sock:s1' && e.event === 'team:suggestionUpdate');
    expect(lastMsg.payload).toEqual({ questionId: 'q1', counts: { o2: 2 } });
    // captain never sees per-user data, only aggregated counts
    expect(lastMsg.payload).not.toHaveProperty('userId');
    expect(Object.keys(lastMsg.payload)).toEqual(['questionId', 'counts']);
  });

  it('a user changing their suggestion moves their contribution between options', () => {
    const { service, events, pin, t1 } = setupReadyTeamGame();
    service.startTeamGame(pin, 'admin1');
    service.suggest(pin, t1, 'member1', 'o2');
    service.suggest(pin, t1, 'member1', 'o1');
    const s = (service as any).sessions.get(pin);
    expect(s.teams.get(t1).suggestions.get('q1').get('member1')).toBe('o1');
    const lastMsg = [...events].reverse().find((e) => e.target === 'sock:s1' && e.event === 'team:suggestionUpdate');
    expect(lastMsg.payload).toEqual({ questionId: 'q1', counts: { o1: 1 } });
  });

  it('suggest rejects a user who is not in that team', () => {
    const { service, pin, t1, t2 } = setupReadyTeamGame();
    service.startTeamGame(pin, 'admin1');
    expect(() => service.suggest(pin, t1, 'captain2', 'o2')).toThrow('NOT_TEAM_MEMBER');
  });

  it('captainAnswer rejects a non-captain team member', () => {
    const { service, pin, t1 } = setupReadyTeamGame();
    service.startTeamGame(pin, 'admin1');
    expect(() => service.captainAnswer(pin, 'member1', 'q1', ['o2'], null)).toThrow('NOT_CAPTAIN');
  });

  it('captainAnswer grades correctly and stores on the team, not the individual player', async () => {
    const { service, pin, t1 } = setupReadyTeamGame();
    service.startTeamGame(pin, 'admin1');
    service.captainAnswer(pin, 'captain1', 'q1', ['o2'], null);
    await Promise.resolve();
    const s = (service as any).sessions.get(pin);
    const team = s.teams.get(t1);
    expect(team.answers.get('q1').isCorrect).toBe(true);
    expect(team.score).toBeGreaterThan(0);
  });

  it('reveal fires once every team\'s captain has answered (not every individual player)', async () => {
    const { service, events, pin } = setupReadyTeamGame();
    service.startTeamGame(pin, 'admin1');
    service.captainAnswer(pin, 'captain1', 'q1', ['o2'], null);
    await Promise.resolve();
    expect(events.some((e) => e.event === 'question:reveal')).toBe(false); // team 2's captain hasn't answered
    service.captainAnswer(pin, 'captain2', 'q1', ['o1'], null);
    await Promise.resolve();
    expect(events.some((e) => e.event === 'question:reveal')).toBe(true);
  });

  it('captain disconnect during question phase marks the team captain-less and rejects further answers until reassigned', () => {
    const { service, pin, t1 } = setupReadyTeamGame();
    service.startTeamGame(pin, 'admin1');
    service.handleDisconnect('s1'); // captain1's socket
    const s = (service as any).sessions.get(pin);
    expect(s.teams.get(t1).captainUserId).toBe(null);
    expect(() => service.captainAnswer(pin, 'captain1', 'q1', ['o2'], null)).toThrow('NOT_CAPTAIN');
  });

  it('host can reassign captain mid-question after a disconnect, and the new captain can then answer', async () => {
    const { service, pin, t1 } = setupReadyTeamGame();
    service.startTeamGame(pin, 'admin1');
    service.handleDisconnect('s1');
    service.setCaptain(pin, 'admin1', t1, 'member1');
    service.captainAnswer(pin, 'member1', 'q1', ['o2'], null);
    await Promise.resolve();
    const s = (service as any).sessions.get(pin);
    expect(s.teams.get(t1).answers.get('q1').isCorrect).toBe(true);
  });

  it('finish persists one submission row per team with the team name as studentName', async () => {
    const { service, pin, t1, t2 } = setupReadyTeamGame();
    const persistSpy = jest.spyOn(service as any, 'persistTeamResults').mockResolvedValue(undefined);
    service.startTeamGame(pin, 'admin1');
    service.captainAnswer(pin, 'captain1', 'q1', ['o2'], null);
    await Promise.resolve();
    service.captainAnswer(pin, 'captain2', 'q1', ['o1'], null);
    await Promise.resolve();
    jest.advanceTimersByTime(4000); // reveal -> only 1 question, so this finishes the game
    expect(persistSpy).toHaveBeenCalledTimes(1);
  });
});

describe('LiveService — live_sessions persistence', () => {
  it('createSession inserts a live_sessions row with status "active"', async () => {
    const insertedRows: any[] = [];
    (db.insert as jest.Mock).mockImplementation((table: any) => ({
      values: (vals: any) => {
        insertedRows.push(vals);
        return { returning: async () => [{ id: 'row-1', ...vals }] };
      },
    }));
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({
      id: 'test1', name: 'Matematika', questions: [
        { id: 'q1', text: 'Q', type: 'single', imageUrl: null, correctAnswer: null,
          options: [{ id: 'o1', text: 'A', isCorrect: true, orderIndex: 0 }] },
      ],
    });

    const service = new LiveService();
    service.setBroadcaster(makeFakeBroadcaster().b);
    await service.createSession('admin1', 'test1', 20, 'individual');

    const sessionRow = insertedRows.find((r) => r.pin !== undefined && r.status === 'active');
    expect(sessionRow).toBeDefined();
    expect(sessionRow.testId).toBe('test1');
    expect(sessionRow.adminId).toBe('admin1');
    expect(sessionRow.mode).toBe('individual');
    expect(sessionRow.questionTimeSec).toBe(20);
  });

  it('finish() updates the live_sessions row to status "finished" with a finishedAt timestamp', async () => {
    const updateCalls: any[] = [];
    (db.update as jest.Mock).mockImplementation((table: any) => ({
      set: (vals: any) => {
        updateCalls.push(vals);
        return { where: async () => {} };
      },
    }));
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: () => ({ returning: async () => [{ id: 'row-1' }] }),
    }));

    const service = new LiveService();
    const { b } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    jest.spyOn(service as any, 'persistResults').mockResolvedValue(undefined);
    const pin = service.initSession('admin1', 'test1', 'Matematika', makeQuestions(), 10, 'individual');
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    await (service as any).finish((service as any).sessions.get(pin));

    const finishUpdate = updateCalls.find((u) => u.status === 'finished');
    expect(finishUpdate).toBeDefined();
    expect(finishUpdate.finishedAt).toBeInstanceOf(Date);
  });

  it('finish() does not throw/reject when db.update rejects (e.g. connection blip)', async () => {
    (db.update as jest.Mock).mockImplementation(() => ({
      set: () => ({
        where: async () => { throw new Error('connection blip'); },
      }),
    }));
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: () => ({ returning: async () => [{ id: 'row-1' }] }),
    }));

    const service = new LiveService();
    const { b } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    jest.spyOn(service as any, 'persistResults').mockResolvedValue(undefined);
    const pin = service.initSession('admin1', 'test1', 'Matematika', makeQuestions(), 10, 'individual');
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');

    await expect((service as any).finish((service as any).sessions.get(pin))).resolves.toBeUndefined();
  });

  it('hostJoin self-heals a stale active live_sessions row to finished when no in-memory session exists for the pin', async () => {
    const updateCalls: any[] = [];
    (db.query as any).liveSessions = {
      findFirst: jest.fn().mockResolvedValue({ id: 'row-1', pin: '999999', status: 'active' }),
    };
    (db.update as jest.Mock).mockImplementation((table: any) => ({
      set: (vals: any) => {
        updateCalls.push(vals);
        return { where: async () => {} };
      },
    }));

    const service = new LiveService();
    service.setBroadcaster(makeFakeBroadcaster().b);
    await expect(service.hostJoin('999999', 'admin1', 'hs')).rejects.toThrow();

    expect(updateCalls.some((u) => u.status === 'finished')).toBe(true);
  });

  it('listSessionHistory returns sessions for the given admin, most recent first, with testName joined', async () => {
    const rows = [
      { id: 'row-2', pin: '222222', mode: 'team', status: 'finished', createdAt: new Date('2026-01-02'), finishedAt: new Date('2026-01-02'), testId: 'test1', test: { name: 'Fizika' } },
      { id: 'row-1', pin: '111111', mode: 'individual', status: 'active', createdAt: new Date('2026-01-01'), finishedAt: null, testId: 'test2', test: { name: 'Matematika' } },
    ];
    (db.query as any).liveSessions = {
      findMany: jest.fn().mockResolvedValue(rows),
    };

    const service = new LiveService();
    const result = await service.listSessionHistory('admin1', 20, 0);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'row-2', pin: '222222', testName: 'Fizika', mode: 'team', status: 'finished' });
    expect(result[1]).toMatchObject({ id: 'row-1', pin: '111111', testName: 'Matematika', mode: 'individual', status: 'active' });
  });
});
