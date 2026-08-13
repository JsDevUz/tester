import {api} from '../lib/api';
import type {ApiChallengeWordLeaderboardEntry, ApiStudentChallengeWord} from '../types/api';

export async function apiListMyChallengeWords(challengeId: string): Promise<ApiStudentChallengeWord[]> { return (await api.get(`/me/challenges/${challengeId}/words`)).data; }
export async function apiSetChallengeWordProgress(challengeId: string, wordId: string, known: boolean): Promise<{wordId: string; known: boolean}> { return (await api.post(`/me/challenges/${challengeId}/words/${wordId}/progress`, {known})).data; }
export async function apiGetMyChallengeWordLeaderboard(
  challengeId: string,
  timeframe?: string,
): Promise<{ entries: ApiChallengeWordLeaderboardEntry[] }> {
  return (
    await api.get(`/me/challenges/${challengeId}/words/leaderboard`, {
      params: { timeframe: timeframe && timeframe !== 'all' ? timeframe : undefined },
    })
  ).data;
}
