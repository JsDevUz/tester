export type VideoProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export const VIDEO_STATUSES: VideoProcessingStatus[] = ['pending', 'processing', 'ready', 'failed'];

export interface PlaybackTokenPayload {
  sub: string;
  role: 'student' | 'teacher' | 'super';
  blockId: string;
  courseId: string;
  exp: number;
  /**
   * Storage keys carried in the token so segment and key requests need no database round
   * trip. They are already known when the token is signed, and the HMAC covers them, so a
   * client cannot point playback at someone else's files by editing the token.
   *
   * Optional because tokens minted before this field existed are still valid until they
   * expire; those requests fall back to a lookup.
   */
  hlsBaseKey?: string;
  aesKeyRef?: string;
}
