import {create} from 'zustand';

export interface PlaceholderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ActiveVideoState {
  isFullscreen: boolean;
  setIsFullscreen: (isFullscreen: boolean) => void;
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
  placeholderRect: PlaceholderRect | null;
  setPlaceholderRect: (rect: PlaceholderRect | null) => void;
}

export const useActiveVideoStore = create<ActiveVideoState>((set) => ({
  isFullscreen: false,
  setIsFullscreen: (isFullscreen) => set({isFullscreen}),
  activeBlockId: null,
  setActiveBlockId: (activeBlockId) => set({activeBlockId}),
  placeholderRect: null,
  setPlaceholderRect: (placeholderRect) => set({placeholderRect}),
}));
