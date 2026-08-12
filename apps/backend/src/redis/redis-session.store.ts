import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function replacer(key: string, value: unknown) {
  if (key.endsWith('Timer')) return null;
  if (value instanceof Map) return { __redisType: 'Map', entries: [...value.entries()] };
  if (value instanceof Set) return { __redisType: 'Set', values: [...value.values()] };
  return value;
}

function reviver(_key: string, value: any) {
  if (value?.__redisType === 'Map') return new Map(value.entries);
  if (value?.__redisType === 'Set') return new Set(value.values);
  return value;
}

@Injectable()
export class RedisSessionStore {
  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis.enabled) return null;
    const raw = await this.redis.raw.get(key);
    return raw ? JSON.parse(raw, reviver) as T : null;
  }

  async set(key: string, value: unknown, ttlSeconds = 86_400): Promise<void> {
    if (!this.redis.enabled) return;
    await this.redis.raw.set(key, JSON.stringify(value, replacer), { EX: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    if (this.redis.enabled) await this.redis.raw.del(key);
  }

  async transaction<T>(key: string, action: () => Promise<T> | T): Promise<T> {
    if (!this.redis.enabled) return action();
    const lockKey = `${key}:lock`;
    const token = randomUUID();
    const deadline = Date.now() + 5_000;
    while (!(await this.redis.raw.set(lockKey, token, { NX: true, PX: 15_000 }))) {
      if (Date.now() >= deadline) throw new Error('SESSION_BUSY');
      await sleep(20 + Math.floor(Math.random() * 30));
    }
    try {
      return await action();
    } finally {
      await this.redis.raw.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        { keys: [lockKey], arguments: [token] },
      );
    }
  }
}
