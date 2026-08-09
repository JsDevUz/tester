import client from './client';

export interface ApiChallenge {
  id: string;
  courseId: string;
  adminId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  type: string;
  createdAt: string;
}

export interface ApiChallengeBookTest {
  id: string;
  challengeBookId: string;
  testId: string;
  triggerPage: number | null;
  forceNow: boolean;
}

export interface ApiChallengeBook {
  id: string;
  challengeId: string;
  title: string;
  totalPages: number;
  orderIndex: number;
  test: ApiChallengeBookTest | null;
}

export interface ApiChallengeDetail extends ApiChallenge {
  books: ApiChallengeBook[];
}

export interface ApiChallengeStats {
  participantCount: number;
  bookStats: {
    bookId: string;
    title: string;
    testName: string | null;
    completedCount: number;
    testSubmittedCount: number | null;
  }[];
}

export interface ApiChallengeLeaderboardEntry {
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  value: number;
  rank: number;
  isCurrentStudent: boolean;
}

export interface ApiChallengeLeaderboard {
  entries: ApiChallengeLeaderboardEntry[];
}

export type ChallengeLeaderboardMetric = 'overall' | 'books' | 'words' | 'speed';

export async function apiListChallenges(courseId: string): Promise<ApiChallenge[]> {
  const res = await client.get(`/courses/${courseId}/challenges`);
  return res.data;
}

export async function apiCreateChallenge(
  courseId: string,
  data: { name: string; description?: string; imageUrl?: string; type?: string },
): Promise<ApiChallenge> {
  const res = await client.post(`/courses/${courseId}/challenges`, data);
  return res.data;
}

export async function apiGetChallenge(id: string): Promise<ApiChallengeDetail> {
  const res = await client.get(`/challenges/${id}`);
  return res.data;
}

export async function apiUpdateChallenge(
  id: string,
  data: Partial<{ name: string; description: string; imageUrl: string; type: string }>,
): Promise<ApiChallenge> {
  const res = await client.patch(`/challenges/${id}`, data);
  return res.data;
}

export async function apiDeleteChallenge(id: string): Promise<void> {
  await client.delete(`/challenges/${id}`);
}

export async function apiAddChallengeBook(
  challengeId: string,
  data: { title: string; totalPages: number },
): Promise<ApiChallengeBook> {
  const res = await client.post(`/challenges/${challengeId}/books`, data);
  return res.data;
}

export async function apiUpdateChallengeBook(
  bookId: string,
  data: Partial<{ title: string; totalPages: number }>,
): Promise<ApiChallengeBook> {
  const res = await client.patch(`/challenges/books/${bookId}`, data);
  return res.data;
}

export async function apiDeleteChallengeBook(bookId: string): Promise<void> {
  await client.delete(`/challenges/books/${bookId}`);
}

export async function apiSetChallengeBookTest(
  bookId: string,
  data: { testId: string; triggerPage?: number; forceNow?: boolean },
): Promise<ApiChallengeBookTest> {
  const res = await client.put(`/challenges/books/${bookId}/test`, data);
  return res.data;
}

export async function apiRemoveChallengeBookTest(bookId: string): Promise<void> {
  await client.delete(`/challenges/books/${bookId}/test`);
}

export async function apiGetChallengeStats(challengeId: string): Promise<ApiChallengeStats> {
  const res = await client.get(`/challenges/${challengeId}/stats`);
  return res.data;
}

export async function apiGetChallengeLeaderboard(
  challengeId: string,
  metric: ChallengeLeaderboardMetric,
  bookId?: string,
): Promise<ApiChallengeLeaderboard> {
  const res = await client.get(`/challenges/${challengeId}/leaderboard`, { params: { metric, bookId } });
  return res.data;
}

export interface ApiStudentChallenge {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  type: string;
  courseId: string;
  courseTitle: string;
  joined: boolean;
}

export async function apiListMyChallenges(): Promise<ApiStudentChallenge[]> {
  const res = await client.get('/me/challenges');
  return res.data;
}

export async function apiJoinChallenge(challengeId: string): Promise<{ id: string }> {
  const res = await client.post(`/me/challenges/${challengeId}/join`);
  return res.data;
}

export interface ApiMyChallengeBook {
  id: string;
  title: string;
  totalPages: number;
  lastPageRead: number;
  completed: boolean;
  pendingTest: { testId: string; slug: string | null; name: string } | null;
}

export interface ApiMyChallengeDetail {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  books: ApiMyChallengeBook[];
}

export interface ApiChallengeEvent {
  id: string;
  challengeBookId: string;
  startPage: number;
  endPage: number;
  newWordsCount: number;
  createdAt: string;
  book: { id: string; title: string };
}

export async function apiGetMyChallengeDetail(challengeId: string): Promise<ApiMyChallengeDetail> {
  const res = await client.get(`/me/challenges/${challengeId}`);
  return res.data;
}

export async function apiAddChallengeEvent(
  challengeId: string,
  bookId: string,
  data: { endPage: number; newWordsCount: number },
): Promise<ApiChallengeEvent> {
  const res = await client.post(`/me/challenges/${challengeId}/books/${bookId}/events`, data);
  return res.data;
}

export async function apiGetMyChallengeHistory(challengeId: string): Promise<ApiChallengeEvent[]> {
  const res = await client.get(`/me/challenges/${challengeId}/history`);
  return res.data;
}

export async function apiGetMyChallengeLeaderboard(
  challengeId: string,
  metric: ChallengeLeaderboardMetric,
  bookId?: string,
): Promise<ApiChallengeLeaderboard> {
  const res = await client.get(`/me/challenges/${challengeId}/leaderboard`, { params: { metric, bookId } });
  return res.data;
}
