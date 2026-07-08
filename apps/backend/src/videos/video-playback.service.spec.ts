import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoPlaybackService } from './video-playback.service';

describe('VideoPlaybackService token verification', () => {
  function service() {
    return new VideoPlaybackService(
      {
        get: (key: string) =>
          key === 'VIDEO_PLAYBACK_TOKEN_SECRET'
            ? 'secret'
            : key === 'VIDEO_PLAYBACK_TOKEN_TTL_SECONDS'
              ? '7200'
              : undefined,
      } as ConfigService,
      {} as any,
      {} as any,
    );
  }

  it('rejects tampered tokens', () => {
    const svc: any = service();
    const token = svc.signPayload({
      sub: 's1',
      blockId: 'b1',
      courseId: 'c1',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    expect(() => svc.verifyToken(`${token}x`, 'b1')).toThrow(ForbiddenException);
  });

  it('rejects tokens for another block', () => {
    const svc: any = service();
    const token = svc.signPayload({
      sub: 's1',
      blockId: 'b1',
      courseId: 'c1',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    expect(() => svc.verifyToken(token, 'b2')).toThrow(ForbiddenException);
  });
});
