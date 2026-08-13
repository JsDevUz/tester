import React from 'react';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {runOnJS} from 'react-native-reanimated';

/**
 * Pinch gesture wrapper — forwards raw gesture scale + focal coordinates
 * to the parent Pane. No zoom state or visual transform lives here;
 * the Pane drives everything (visual transform during pinch, layout
 * commit on pinch end).
 */
export function ClassroomZoomPan({
  onBreakSync,
  onPinchStart,
  onPinchUpdate,
  onPinchEnd,
  children,
}: {
  onBreakSync: () => void;
  onPinchStart: (focalX: number, focalY: number) => void;
  onPinchUpdate: (scale: number, focalX: number, focalY: number) => void;
  onPinchEnd: () => void;
  children: React.ReactNode;
}) {
  const pinch = Gesture.Pinch()
    .cancelsTouchesInView(true)
    .onStart(e => {
      runOnJS(onBreakSync)();
      const fx = Number.isFinite(e.focalX) ? e.focalX : 0;
      const fy = Number.isFinite(e.focalY) ? e.focalY : 0;
      runOnJS(onPinchStart)(fx, fy);
    })
    .onUpdate(e => {
      const scale = Number.isFinite(e.scale) && e.scale > 0 ? e.scale : 1;
      const fx = Number.isFinite(e.focalX) ? e.focalX : 0;
      const fy = Number.isFinite(e.focalY) ? e.focalY : 0;
      runOnJS(onPinchUpdate)(scale, fx, fy);
    })
    .onEnd(() => {
      runOnJS(onPinchEnd)();
    })
    .onFinalize(() => {
      runOnJS(onPinchEnd)();
    });

  return <GestureDetector gesture={pinch}>{children}</GestureDetector>;
}
