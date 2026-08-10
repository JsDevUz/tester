import client from './client';

export interface ApiChallengeWord {
  id: string;
  challengeId: string;
  word: string;
  translation: string;
  orderIndex: number;
}

export interface ApiStudentChallengeWord {
  id: string;
  word: string;
  translation: string;
  known: boolean;
}

export interface ApiChallengeWordLeaderboardEntry {
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  value: number;
  rank: number;
  isCurrentStudent: boolean;
}

export async function apiListChallengeWords(challengeId: string): Promise<ApiChallengeWord[]> {
  return (await client.get(`/challenges/${challengeId}/words`)).data;
}

export async function apiAddChallengeWord(challengeId: string, data: { word: string; translation: string }): Promise<ApiChallengeWord> {
  return (await client.post(`/challenges/${challengeId}/words`, data)).data;
}

export async function apiBulkImportChallengeWords(challengeId: string, text: string): Promise<{ added: number; skipped: number }> {
  return (await client.post(`/challenges/${challengeId}/words/bulk`, { text })).data;
}

export async function apiDeleteChallengeWord(challengeId: string, wordId: string): Promise<void> {
  await client.delete(`/challenges/${challengeId}/words/${wordId}`);
}

export async function apiListMyChallengeWords(challengeId: string): Promise<ApiStudentChallengeWord[]> {
  return (await client.get(`/me/challenges/${challengeId}/words`)).data;
}

export async function apiSetChallengeWordProgress(challengeId: string, wordId: string, known: boolean): Promise<{ wordId: string; known: boolean }> {
  return (await client.post(`/me/challenges/${challengeId}/words/${wordId}/progress`, { known })).data;
}

export async function apiGetMyChallengeWordLeaderboard(
  challengeId: string,
  timeframe?: string,
): Promise<{ entries: ApiChallengeWordLeaderboardEntry[] }> {
  return (
    await client.get(`/me/challenges/${challengeId}/words/leaderboard`, {
      params: { timeframe: timeframe && timeframe !== 'all' ? timeframe : undefined },
    })
  ).data;
}
