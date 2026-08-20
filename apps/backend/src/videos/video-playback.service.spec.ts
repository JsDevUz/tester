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

  // Both playlist shapes exist in storage at once: everything transcoded before the ABR
  // change is single-rendition MPEG-TS, and it has to keep working untouched.
  describe('playlist rewriting across formats', () => {
    it('leaves a legacy MPEG-TS playlist fully playable', () => {
      const svc: any = service();
      const manifest = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x123',
        '#EXTINF:6.0,',
        'segment_000.ts',
        '#EXTINF:6.0,',
        'segment_001.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const out = svc.rewriteManifestUrls(manifest, 'tok');

      expect(out).toContain('URI="key?token=tok"');
      expect(out).toContain('segments/segment_000.ts?token=tok');
      expect(out).toContain('segments/segment_001.ts?token=tok');
      // Tags must survive untouched or the playlist stops parsing.
      expect(out).toContain('#EXTINF:6.0,');
      expect(out).toContain('#EXT-X-ENDLIST');
    });

    it('rewrites a master playlist that points at renditions', () => {
      const svc: any = service();
      const master = [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=3500000,RESOLUTION=1920x1080',
        'stream_0.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720',
        'stream_1.m3u8',
      ].join('\n');

      const out = svc.rewriteManifestUrls(master, 'tok');

      expect(out).toContain('segments/stream_0.m3u8?token=tok');
      expect(out).toContain('segments/stream_1.m3u8?token=tok');
      expect(out).toContain('#EXT-X-STREAM-INF:BANDWIDTH=3500000,RESOLUTION=1920x1080');
    });

    it('rewrites an fMP4 variant, including its init segment', () => {
      const svc: any = service();
      const variant = [
        '#EXTM3U',
        '#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x123',
        '#EXT-X-MAP:URI="init_0.mp4"',
        '#EXTINF:6.0,',
        'stream_0_000.m4s',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const out = svc.rewriteManifestUrls(variant, 'tok');

      expect(out).toContain('#EXT-X-MAP:URI="segments/init_0.mp4?token=tok"');
      expect(out).toContain('segments/stream_0_000.m4s?token=tok');
      expect(out).toContain('URI="key?token=tok"');
    });

    it('does not mangle comments or unrelated tags', () => {
      const svc: any = service();
      const manifest = ['#EXTM3U', '#EXT-X-TARGETDURATION:6', '#EXT-X-PLAYLIST-TYPE:VOD'].join('\n');

      expect(svc.rewriteManifestUrls(manifest, 'tok')).toBe(manifest);
    });
  });
});
