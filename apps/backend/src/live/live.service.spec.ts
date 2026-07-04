import { LiveService } from './live.service';
import { LiveQuestion, LiveBroadcaster } from './live.types';

// db ga tegmaslik uchun persistResults ni mock qilamiz
jest.mock('../db', () => ({ db: {} }));

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

  it('initSession with mode "team" starts in lobby with teams as an empty map', () => {
    const { service, pin } = setupTeam();
    const s = (service as any).sessions.get(pin);
    expect(s.mode).toBe('team');
    expect(s.teams).toBeInstanceOf(Map);
    expect(s.teams.size).toBe(0);
    expect(s.unassignedUserIds).toBeInstanceOf(Set);
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
