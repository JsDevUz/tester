import {create} from 'zustand';
import type {RefObject} from 'react';
import type {View} from 'react-native';

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
  /**
   * The screen-level container HlsVideoPlayer is absolutely positioned inside (see
   * CourseScreen). LazyVideoPlayer's placeholder measures itself against this same node
   * (measureLayout), not the window -- so the resulting rect is already relative to
   * whatever CourseScreen uses to position the real player, regardless of how far down
   * the screen the header/safe-area pushes that container.
   */
  screenAnchorRef: RefObject<View | null> | null;
  setScreenAnchorRef: (ref: RefObject<View | null> | null) => void;
}

export const useActiveVideoStore = create<ActiveVideoState>((set) => ({
  isFullscreen: false,
  setIsFullscreen: (isFullscreen) => set({isFullscreen}),
  activeBlockId: null,
  setActiveBlockId: (activeBlockId) => set({activeBlockId}),
  placeholderRect: null,
  setPlaceholderRect: (placeholderRect) => set({placeholderRect}),
  screenAnchorRef: null,
  setScreenAnchorRef: (screenAnchorRef) => set({screenAnchorRef}),
}));
