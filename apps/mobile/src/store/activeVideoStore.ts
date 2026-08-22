import {create} from 'zustand';

interface ActiveVideoState {
  /** The block id of the lesson's currently open video, or null if none is open. Read by
   *  CourseScreen to know which video (if any) to render -- HlsVideoPlayer lives at the
   *  screen level (not inside the lesson ScrollView) so its fullscreen/PiP views are never
   *  clipped by the scroll container and the lesson stays scrollable while PiP is active. */
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
  /** Whether the open video is fullscreen or PiP. CourseScreen hides its own native header
   *  while fullscreen (the video covers the header's spot, so the header must not still be
   *  reserving room above it) but keeps it while PiP (the video is small; the header stays
   *  useful for navigating lessons). */
  isFullscreen: boolean;
  setIsFullscreen: (isFullscreen: boolean) => void;
}

export const useActiveVideoStore = create<ActiveVideoState>((set) => ({
  activeBlockId: null,
  setActiveBlockId: (activeBlockId) => set({activeBlockId}),
  isFullscreen: true,
  setIsFullscreen: (isFullscreen) => set({isFullscreen}),
}));
