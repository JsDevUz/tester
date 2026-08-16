// SRT and WebVTT share the same cue structure (index, timing line, text
// lines, blank-line-separated). The only real differences: WebVTT needs a
// "WEBVTT" header and uses "." instead of "," as the millisecond separator
// in timing lines. No ffmpeg or AI involved — this is a pure text transform.
export function srtToVtt(srtText: string): string {
  const normalized = srtText
    .replace(/^﻿/, '') // strip UTF-8 BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (!normalized.includes('-->')) {
    throw new Error('Malformed SRT: no cues found');
  }

  const withVttTimings = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2',
  );

  return `WEBVTT\n\n${withVttTimings.trim()}\n`;
}
