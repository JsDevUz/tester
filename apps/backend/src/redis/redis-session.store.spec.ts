import { createClient, RedisClientType } from 'redis';
import { RedisSessionStore } from './redis-session.store';

const REDIS_URL = process.env.TEST_REDIS_URL;
const describeRedis = REDIS_URL ? describe : describe.skip;

describeRedis('RedisSessionStore integration', () => {
  let client: RedisClientType;
  let store: RedisSessionStore;

  beforeAll(async () => {
    client = createClient({ url: REDIS_URL });
    await client.connect();
    store = new RedisSessionStore({ enabled: true, raw: client } as any);
  });

  afterAll(async () => {
    await client.flushDb();
    await client.quit();
  });

  it('nested Map va Set qiymatlarini saqlab tiklaydi', async () => {
    const state = {
      players: new Map([['u1', { answers: new Map([['q1', 100]]) }]]),
      members: new Set(['u1', 'u2']),
      questionTimer: setTimeout(() => {}, 60_000),
    };
    await store.set('test:codec', state);
    clearTimeout(state.questionTimer);
    const restored = await store.get<any>('test:codec');
    expect(restored.players).toBeInstanceOf(Map);
    expect(restored.players.get('u1').answers.get('q1')).toBe(100);
    expect(restored.members).toBeInstanceOf(Set);
    expect(restored.members.has('u2')).toBe(true);
    expect(restored.questionTimer).toBeNull();
  });

  it('parallel transactionlarni ketma-ket bajaradi', async () => {
    await client.set('test:counter', '0');
    await Promise.all(Array.from({ length: 20 }, () =>
      store.transaction('test:counter-session', async () => {
        const current = Number(await client.get('test:counter'));
        await new Promise((resolve) => setTimeout(resolve, 5));
        await client.set('test:counter', String(current + 1));
      }),
    ));
    expect(await client.get('test:counter')).toBe('20');
  });
});
