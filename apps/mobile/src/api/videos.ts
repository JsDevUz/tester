import {api} from '../lib/api';

export async function apiStartVideoPlayback(
  blockId: string,
): Promise<{token: string; manifestUrl: string; expiresAt: string; subtitleUrl: string | null}> {
  const res = await api.post(`/videos/${blockId}/play`);
  return res.data;
}

export type WatchSegment = {startSec: number; endSec: number};

export async function apiSaveWatchProgress(
  blockId: string,
  startSec: number,
  endSec: number,
): Promise<{segments: WatchSegment[]; watchedPercent: number | null}> {
  const res = await api.post(`/videos/${blockId}/watch-progress`, {startSec, endSec});
  return res.data;
}

export async function apiGetWatchProgress(
  blockId: string,
): Promise<{segments: WatchSegment[]; watchedPercent: number | null}> {
  const res = await api.get(`/videos/${blockId}/watch-progress`);
  return res.data;
}
