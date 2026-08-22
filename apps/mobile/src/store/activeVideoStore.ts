import {create} from 'zustand';

interface ActiveVideoState {
  /** The block id of the lesson's currently open video, or null if none is open. Read by
   *  CourseScreen to know which video (if any) to render -- HlsVideoPlayer lives at the
   *  screen level (not inside the lesson ScrollView) so its fullscreen/PiP views are never
   *  clipped by the scroll container and the lesson stays scrollable while PiP is active. */
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
}

export const useActiveVideoStore = create<ActiveVideoState>((set) => ({
  activeBlockId: null,
  setActiveBlockId: (activeBlockId) => set({activeBlockId}),
}));
