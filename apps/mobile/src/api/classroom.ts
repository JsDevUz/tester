import {api} from '../lib/api';
import type {ActiveClassSession, ClassReplayData} from '../types/classroom';

export async function apiActiveClassSessions(): Promise<ActiveClassSession[]> {
  const res = await api.get('/classroom/sessions/active');
  return res.data;
}

export async function apiClassReplay(sessionId: string): Promise<ClassReplayData> {
  const res = await api.get(`/classroom/sessions/${sessionId}/replay`);
  return res.data;
}

export async function apiVoiceToken(sessionId: string): Promise<{token: string; url: string}> {
  const res = await api.post(`/classroom/sessions/${sessionId}/voice-token`);
  return res.data;
}

export async function apiVoiceTokenGuest(
  sessionId: string,
  guestId: string,
  guestName: string,
): Promise<{token: string; url: string}> {
  const res = await api.post(`/classroom/sessions/${sessionId}/voice-token/guest`, {guestId, guestName});
  return res.data;
}

export async function apiStartClassRecording(sessionId: string): Promise<void> {
  await api.post(`/classroom/sessions/${sessionId}/recording/start`);
}
