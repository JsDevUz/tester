import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private client: RedisClientType | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    this.client = createClient({ url });
    this.client.on('error', (error) => console.error('Redis error', error));
    await this.client.connect();
  }

  get enabled() { return this.client !== null; }

  get raw(): RedisClientType {
    if (!this.client) throw new Error('REDIS_NOT_CONFIGURED');
    return this.client;
  }

  async onApplicationShutdown() {
    if (this.client?.isOpen) await this.client.quit();
  }
}
