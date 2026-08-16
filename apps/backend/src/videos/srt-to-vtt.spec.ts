import { srtToVtt } from './srt-to-vtt';

describe('srtToVtt', () => {
  it('converts a valid multi-cue SRT to WebVTT', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:04,500',
      'Salom, bugun darsni boshlaymiz.',
      '',
      '2',
      '00:00:05,200 --> 00:00:08,000',
      'Birinchi mavzu.',
      '',
    ].join('\n');

    const vtt = srtToVtt(srt);

    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.500');
    expect(vtt).toContain('Salom, bugun darsni boshlaymiz.');
    expect(vtt).toContain('00:00:05.200 --> 00:00:08.000');
    expect(vtt).toContain('Birinchi mavzu.');
    expect(vtt).not.toContain(',000 -->');
  });

  it('strips a UTF-8 BOM if present', () => {
    const srt = '﻿1\n00:00:01,000 --> 00:00:02,000\nSalom\n';
    const vtt = srtToVtt(srt);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).not.toContain('﻿');
  });

  it('normalizes CRLF line endings to LF', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nSalom\r\n';
    const vtt = srtToVtt(srt);
    expect(vtt).not.toContain('\r');
  });

  it('throws on malformed input with no timing arrows', () => {
    expect(() => srtToVtt('this is not a subtitle file')).toThrow(
      'Malformed SRT: no cues found',
    );
  });

  it('throws on empty input', () => {
    expect(() => srtToVtt('')).toThrow('Malformed SRT: no cues found');
  });
});
