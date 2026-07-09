export type VideoProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export const VIDEO_STATUSES: VideoProcessingStatus[] = ['pending', 'processing', 'ready', 'failed'];

export interface PlaybackTokenPayload {
  sub: string;
  role: 'student' | 'teacher' | 'super';
  blockId: string;
  courseId: string;
  exp: number;
}
