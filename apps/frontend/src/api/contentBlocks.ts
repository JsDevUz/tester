import client from './client';

export interface ApiMessageLine {
  id: string;
  text: string;
  orderIndex: number;
}

export interface ApiContentBlock {
  id: string;
  lessonId: string;
  type: 'editor' | 'video' | 'image' | 'file' | 'live_class' | 'button' | 'message';
  orderIndex: number;
  html: string | null;
  fileName: string | null;
  previewUrl: string | null;
  embedUrl: string | null;
  label: string | null;
  processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  sourceKey: string | null;
  hlsMasterKey: string | null;
  hlsBaseKey: string | null;
  aesKeyRef: string | null;
  subtitleKey: string | null;
  subtitleFileName: string | null;
  durationSec: number | null;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
  classSessionId: string | null;
  buttonUrl: string | null;
  buttonColor: string | null;
  buttonTextColor: string | null;
  openInNewTab: boolean;
  messageLines?: ApiMessageLine[];
  messageSender?: { name: string; avatarUrl: string | null };
}

export async function apiListBlocks(lessonId: string): Promise<ApiContentBlock[]> {
  const res = await client.get(`/lessons/${lessonId}/blocks`);
  return res.data;
}

export async function apiCreateBlock(lessonId: string, type: 'editor'): Promise<ApiContentBlock> {
  const res = await client.post(`/lessons/${lessonId}/blocks`, { type });
  return res.data;
}

export async function apiUpdateBlock(
  id: string,
  data: {
    html?: string;
    label?: string;
    embedUrl?: string;
    buttonUrl?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    openInNewTab?: boolean;
  },
): Promise<ApiContentBlock> {
  const res = await client.patch(`/blocks/${id}`, data);
  return res.data;
}

// Video to'g'ridan-to'g'ri S3'ga yuklanadi (backend orqali proxy qilinmaydi) —
// katta fayllarda bu ancha tezroq, chunki backend serverning tarmoq
// kanali cheklovchi bo'g'in bo'lmay qoladi. Uch bosqich:
// 1) backend'dan muddati qisqa yuklash havolasi olinadi
// 2) brauzer faylni to'g'ridan-to'g'ri shu havolaga PUT qiladi
// 3) backend'ga "tugadi" deb signal beriladi — u S3'dan haqiqiy holatni
//    tekshiradi va shundan keyingina HLS transcode job'ni ishga tushiradi
export async function apiUploadVideoBlock(
  lessonId: string,
  file: File,
  label?: string,
  onProgress?: (percent: number) => void,
): Promise<ApiContentBlock> {
  const { blockId, uploadUrl } = (
    await client.post(`/lessons/${lessonId}/videos/initiate`, {
      fileName: file.name,
      mimeType: file.type,
      label,
    })
  ).data;

  await uploadFileToPresignedUrl(uploadUrl, file, onProgress);

  const res = await client.post(`/blocks/${blockId}/videos/complete`);
  return res.data;
}

function uploadFileToPresignedUrl(url: string, file: File, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Video yuklashda xatolik (status ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Video yuklashda tarmoq xatosi'));
    xhr.send(file);
  });
}

export async function apiUploadFileBlock(
  lessonId: string,
  file: File,
  label?: string,
  onProgress?: (percent: number) => void,
): Promise<ApiContentBlock> {
  const formData = new FormData();
  formData.append('file', file);
  if (label) formData.append('label', label);
  const res = await client.post(`/lessons/${lessonId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return res.data;
}

export async function apiCreateFileBlockFromLibrary(
  lessonId: string,
  url: string,
  fileName: string,
): Promise<ApiContentBlock> {
  const res = await client.post(`/lessons/${lessonId}/files/from-library`, { url, fileName });
  return res.data;
}

export async function apiCreateLiveClassBlock(lessonId: string, classSessionId: string): Promise<ApiContentBlock> {
  const res = await client.post(`/lessons/${lessonId}/blocks/live-class`, { classSessionId });
  return res.data;
}

export async function apiCreateButtonBlock(lessonId: string): Promise<ApiContentBlock> {
  const res = await client.post(`/lessons/${lessonId}/blocks/button`);
  return res.data;
}

export async function apiCreateMessageBlock(lessonId: string): Promise<ApiContentBlock> {
  const res = await client.post(`/lessons/${lessonId}/blocks/message`);
  return res.data;
}

export async function apiAddMessageLine(blockId: string): Promise<ApiMessageLine> {
  const res = await client.post(`/blocks/${blockId}/message-lines`);
  return res.data;
}

export async function apiUpdateMessageLine(lineId: string, text: string): Promise<ApiMessageLine> {
  const res = await client.patch(`/message-lines/${lineId}`, { text });
  return res.data;
}

export async function apiRemoveMessageLine(lineId: string): Promise<void> {
  await client.delete(`/message-lines/${lineId}`);
}

export async function apiReorderMessageLines(blockId: string, lineIds: string[]): Promise<void> {
  await client.post(`/blocks/${blockId}/message-lines/reorder`, { lineIds });
}

export async function apiRetryVideoBlock(blockId: string): Promise<ApiContentBlock> {
  const res = await client.post(`/blocks/${blockId}/videos/retry`);
  return res.data;
}

export async function apiUploadSubtitle(blockId: string, file: File): Promise<ApiContentBlock> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await client.post(`/blocks/${blockId}/subtitles`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function apiDeleteSubtitle(blockId: string): Promise<ApiContentBlock> {
  const res = await client.delete(`/blocks/${blockId}/subtitles`);
  return res.data;
}

export async function apiStartVideoPlayback(
  blockId: string,
): Promise<{ token: string; manifestUrl: string; expiresAt: string; subtitleUrl: string | null }> {
  const res = await client.post(`/videos/${blockId}/play`);
  return res.data;
}

export interface WatchSegment {
  startSec: number;
  endSec: number;
}

export async function apiSaveWatchProgress(
  blockId: string,
  startSec: number,
  endSec: number,
  durationSec?: number,
): Promise<{ segments: WatchSegment[]; watchedPercent: number | null }> {
  const res = await client.post(`/videos/${blockId}/watch-progress`, { startSec, endSec, durationSec });
  return res.data;
}

export async function apiGetWatchProgress(
  blockId: string,
): Promise<{ segments: WatchSegment[]; watchedPercent: number | null }> {
  const res = await client.get(`/videos/${blockId}/watch-progress`);
  return res.data;
}

export async function apiDeleteBlock(id: string): Promise<void> {
  await client.delete(`/blocks/${id}`);
}

export async function apiReorderBlocks(lessonId: string, blockIds: string[]): Promise<void> {
  await client.post(`/lessons/${lessonId}/blocks/reorder`, { blockIds });
}
