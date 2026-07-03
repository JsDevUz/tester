import { LiveService } from './live.service';
import { LiveQuestion, LiveBroadcaster } from './live.types';

// db ga tegmaslik uchun persistResults ni mock qilamiz
jest.mock('../db', () => ({ db: {} }));

function makeQuestions(): LiveQuestion[] {
  return [
    {
      id: 'q1', text: '2+2=?', imageUrl: null, type: 'single',
      options: [{ id: 'o1', text: '3' }, { id: 'o2', text: '4' }],
      correctOptionIds: ['o2'],
    },
    {
      id: 'q2', text: 'Yer dumaloqmi?', imageUrl: null, type: 'truefalse',
      options: [{ id: 'o3', text: "To'g'ri" }, { id: 'o4', text: "Noto'g'ri" }],
      correctOptionIds: ['o3'],
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

  it("hamma javob berganda darhol reveal bo'ladi", () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    expect(events.some((e) => e.event === 'question:reveal')).toBe(false);
    service.answer(pin, 'u2', 'q1', ['o1']);
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

  it('reveal da har o‘yinchiga shaxsiy natija boradi', () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    const personal = events.find((e) => e.target === 'sock:s1' && e.event === 'question:reveal');
    expect(personal).toBeDefined();
    expect(personal!.payload.isCorrect).toBe(true);
    expect(personal!.payload.points).toBeGreaterThanOrEqual(500);
  });

  it('ikki marta javob berish rad etiladi', () => {
    const { service, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    expect(() => service.answer(pin, 'u1', 'q1', ['o1'])).toThrow('ALREADY_ANSWERED');
  });

  it("reveal dan keyin keyingi savolga o'tadi, oxirgisidan keyin finished", () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);   // → reveal
    jest.advanceTimersByTime(4000);             // → q2
    const starts = events.filter((e) => e.event === 'question:start');
    expect(starts).toHaveLength(2);
    expect(starts[1].payload.idx).toBe(1);
    service.answer(pin, 'u1', 'q2', ['o3']);   // → reveal
    jest.advanceTimersByTime(4000);             // → finished
    expect(events.some((e) => e.event === 'game:finished')).toBe(true);
  });

  it('finished da persistResults chaqiriladi', () => {
    const { service, events, pin } = setup();
    const spy = jest.spyOn(service as any, 'persistResults');
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    jest.advanceTimersByTime(4000);
    service.answer(pin, 'u1', 'q2', ['o3']);
    jest.advanceTimersByTime(4000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reconnect: qayta playerJoin state qaytaradi, ball saqlanadi", () => {
    const { service, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
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

  it("uzilgan o'yinchi early revealni bloklamaydi (javobdan keyin uzilish)", () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.answer(pin, 'u1', 'q1', ['o2']);
    expect(events.some((e) => e.event === 'question:reveal')).toBe(false);
    service.handleDisconnect('s2'); // javob bermagan o'yinchi uzildi
    expect(events.some((e) => e.event === 'question:reveal')).toBe(true);
  });

  it("javob bermagan o'yinchi uzilsa qolganlar kutmaydi (uzilishdan keyin javob)", () => {
    const { service, events, pin } = setup();
    service.hostJoin(pin, 'admin1', 'hs');
    service.playerJoin(pin, { id: 'u1', name: 'Ali' }, 's1');
    service.playerJoin(pin, { id: 'u2', name: 'Vali' }, 's2');
    service.start(pin, 'admin1');
    service.handleDisconnect('s2'); // u2 javob bermay uzildi
    service.answer(pin, 'u1', 'q1', ['o2']); // yagona ulangan o'yinchi javob berdi
    expect(events.some((e) => e.event === 'question:reveal')).toBe(true);
  });

  it("noto'g'ri PIN NOT_FOUND", () => {
    const { service } = setup();
    expect(() => service.start('000000', 'admin1')).toThrow('NOT_FOUND');
  });
});
