import client from './client';

export interface BoardItem {
  id: string;
  title: string | null;
  pdfName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  status: 'active' | 'ended';
  hasBoardSnapshot: boolean;
}

export interface BoardActivityItem {
  id: string;
  type: string;
  description: string;
  timestampMs: number;
  userName: string;
  strokeId?: string | null;
  page?: number | null;
  stroke?: any;
}

export interface BoardVersionItem {
  id: string;
  versionNumber: number;
  label: string;
  timestampMs: number;
  boardMode: string;
  pdfName: string | null;
  pageCount: number;
  strokeCount: number;
  snapshot: any;
}

export async function apiListBoards(): Promise<BoardItem[]> {
  const res = await client.get('/boards');
  return res.data;
}

export async function apiCreateBoard(title?: string): Promise<{ id: string }> {
  const res = await client.post('/boards', { title });
  return res.data;
}

export async function apiDeleteBoard(id: string): Promise<void> {
  await client.delete(`/boards/${id}`);
}

export async function apiUpdateBoardTitle(id: string, title: string): Promise<void> {
  await client.patch(`/boards/${id}/title`, { title });
}

export interface BoardActivityResponse {
  items: BoardActivityItem[];
  total: number;
  hasMore: boolean;
  page: number;
  limit: number;
}

export async function apiGetBoardActivity(id: string, page = 1, limit = 20): Promise<BoardActivityResponse> {
  const res = await client.get(`/boards/${id}/activity`, { params: { page, limit } });
  if (Array.isArray(res.data)) {
    return { items: res.data, total: res.data.length, hasMore: false, page: 1, limit: res.data.length };
  }
  return res.data;
}

export async function apiGetBoardVersions(id: string): Promise<BoardVersionItem[]> {
  const res = await client.get(`/boards/${id}/versions`);
  return res.data;
}

export async function apiRestoreBoardVersion(boardId: string, versionId: string): Promise<void> {
  await client.post(`/boards/${boardId}/versions/${versionId}/restore`);
}

export async function apiCreateBoardVersionCheckpoint(boardId: string, label?: string): Promise<void> {
  await client.post(`/boards/${boardId}/versions/checkpoint`, { label });
}
