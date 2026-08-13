import {api} from '../lib/api';
import type {ApiChallengeEvent, ApiChallengeLeaderboardEntry, ApiMyChallengeDetail, ApiStudentChallenge, ChallengeLeaderboardMetric} from '../types/api';

export async function apiListMyChallenges(): Promise<ApiStudentChallenge[]> { return (await api.get('/me/challenges')).data; }
export async function apiJoinChallenge(challengeId: string): Promise<{id: string}> { return (await api.post(`/me/challenges/${challengeId}/join`)).data; }
export async function apiGetMyChallengeDetail(challengeId: string): Promise<ApiMyChallengeDetail> { return (await api.get(`/me/challenges/${challengeId}`)).data; }
export async function apiAddChallengeEvent(challengeId: string, bookId: string, data: {endPage: number; newWordsCount: number}): Promise<ApiChallengeEvent> { return (await api.post(`/me/challenges/${challengeId}/books/${bookId}/events`, data)).data; }
export async function apiGetChallengeLeaderboard(
  challengeId: string,
  metric: ChallengeLeaderboardMetric,
  timeframe?: string,
  bookId?: string,
): Promise<{ entries: ApiChallengeLeaderboardEntry[] }> {
  return (
    await api.get(`/me/challenges/${challengeId}/leaderboard`, {
      params: {
        metric,
        timeframe: timeframe && timeframe !== 'all' ? timeframe : undefined,
        bookId: bookId && bookId !== 'all' ? bookId : undefined,
      },
    })
  ).data;
}
