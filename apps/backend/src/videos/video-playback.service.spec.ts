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
      role: 'student',
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
      role: 'student',
      blockId: 'b1',
      courseId: 'c1',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    expect(() => svc.verifyToken(token, 'b2')).toThrow(ForbiddenException);
  });

  it('rewrites manifest URLs relative to the manifest endpoint', () => {
    const svc: any = service();
    const manifest = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x123',
      'segment_000.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    expect(svc.rewriteManifestUrls(manifest, 'token.value')).toContain(
      'URI="key?token=token.value"',
    );
    expect(svc.rewriteManifestUrls(manifest, 'token.value')).toContain(
      'segments/segment_000.ts?token=token.value',
    );
  });
});
