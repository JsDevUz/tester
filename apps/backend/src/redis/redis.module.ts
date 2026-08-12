import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisSessionStore } from './redis-session.store';

@Global()
@Module({ providers: [RedisService, RedisSessionStore], exports: [RedisService, RedisSessionStore] })
export class RedisModule {}
