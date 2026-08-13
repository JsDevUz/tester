import React, {useEffect, useRef, useState} from 'react';
import {Image, Pressable, Text, View, useWindowDimensions} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {Minus, Move, Plus} from 'lucide-react-native';
import {ClassroomPageView, aspectCache, getCachedDocAspectRatio, setCachedDocAspectRatio} from './ClassroomPageView';
import {MAX_ZOOM, MIN_ZOOM} from '../../types/classroom';
import type {ClassroomState, CsBoardMode, CsPointer, CsScrollPosition, CsStroke} from '../../types/classroom';

const PAGE_GAP = 12;
const SAFE_TOP = 54;
const SAFE_BOTTOM = 88;
const ZOOM_STEP = 0.25;

function Pane({
  pages,
  boardMode,
  notebookPageStyles,
  notebookPageCount,
  theme,
  strokesByPage,
  pointer,
  zoom,
  currentPage,
  scroll,
  onTapBoard,
  overlayVisible = true,
}: {
  pages: string[];
  boardMode: CsBoardMode;
  notebookPageStyles: ClassroomState['notebookPageStyles'];
  notebookPageCount: number;
  theme: 'light' | 'dark';
  strokesByPage: Record<number, CsStroke[]>;
  pointer?: CsPointer | null;
  zoom: number;
  currentPage: number;
  scroll: CsScrollPosition | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onTapBoard?: () => void;
  overlayVisible?: boolean;
}) {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const [containerHeight, setContainerHeight] = useState(windowHeight);

  const containerWSV = useSharedValue(windowWidth);
  const containerHSV = useSharedValue(windowHeight);

  useEffect(() => {
    containerWSV.value = containerWidth;
    containerHSV.value = containerHeight;
  }, [containerWidth, containerHeight, containerWSV, containerHSV]);

  const [synced, setSynced] = useState(true);
  const [visiblePage, setVisiblePage] = useState(currentPage);

  const pageCount = boardMode === 'notebook' ? Math.max(1, notebookPageCount) : Math.max(1, pages.length);
  const listData = Array.from({length: pageCount}, (_, i) => i + 1);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), pageCount);

  const [docAspectRatio, setDocAspectRatio] = useState<number>(() => {
    if (boardMode === 'notebook') return 210 / 297;
    if (pages[0] && aspectCache[pages[0]]) return aspectCache[pages[0]];
    return getCachedDocAspectRatio() || 1600 / 2263;
  });

  useEffect(() => {
    if (boardMode === 'pdf' && pages.length > 0 && pages[0]) {
      if (aspectCache[pages[0]]) {
        setDocAspectRatio(aspectCache[pages[0]]);
      } else {
        Image.getSize(pages[0], (w, h) => {
          if (w > 0 && h > 0) {
            const ratio = w / h;
            aspectCache[pages[0]] = ratio;
            setCachedDocAspectRatio(ratio);
            setDocAspectRatio(ratio);
          }
        });
      }
    }
  }, [boardMode, pages]);

  const baseCardWidth = Math.min(800, containerWidth);
  const cardAspectRatio = boardMode === 'pdf' ? (docAspectRatio > 0 ? docAspectRatio : 1600 / 2263) : (210 / 297);
  const baseCardHeight = baseCardWidth / cardAspectRatio;
  const baseItemTotalHeight = baseCardHeight + PAGE_GAP;
  const totalContentHeight = SAFE_TOP + pageCount * baseItemTotalHeight + SAFE_BOTTOM;

  const baseCardWidthSV = useSharedValue(baseCardWidth);
  const totalHeightSV = useSharedValue(totalContentHeight);
  const itemTotalHeightSV = useSharedValue(baseItemTotalHeight);
  const pageCountSV = useSharedValue(pageCount);

  useEffect(() => {
    baseCardWidthSV.value = baseCardWidth;
    totalHeightSV.value = totalContentHeight;
    itemTotalHeightSV.value = baseItemTotalHeight;
    pageCountSV.value = pageCount;
  }, [baseCardWidth, totalContentHeight, baseItemTotalHeight, pageCount, baseCardWidthSV, totalHeightSV, itemTotalHeightSV, pageCountSV]);

  // Initial target Y for page
  const initialTargetY = SAFE_TOP + (safeCurrentPage - 0.5) * baseItemTotalHeight;
  const initialTy = (totalContentHeight / 2 - initialTargetY);

  const tx = useSharedValue(0);
  const ty = useSharedValue(initialTy);
  const scale = useSharedValue(zoom > 0 ? zoom : 1);

  const startTx = useSharedValue(0);
  const startTy = useSharedValue(initialTy);
  const lastReportedPage = useSharedValue(safeCurrentPage);
  const lastSyncPayloadRef = useRef<string>('');

  const unsyncJS = () => {
    lastSyncPayloadRef.current = '';
    setSynced(false);
  };

  const returnToTeacher = () => {
    setSynced(true);
    lastSyncPayloadRef.current = '';

    const targetPage = Math.min(Math.max(1, scroll?.page ?? safeCurrentPage), pageCount);
    const targetYRatio = scroll?.yRatio ?? 0;

    const pageY = SAFE_TOP + (targetPage - 1) * baseItemTotalHeight;
    const targetContentY = pageY + baseCardHeight * targetYRatio;

    const s = zoom > 0 ? zoom : 1;
    scale.value = withTiming(s, {duration: 250});

    const targetTy = s * (totalContentHeight / 2 - targetContentY);
    const clamped = clampCamera(0, targetTy, s);

    tx.value = withTiming(clamped.x, {duration: 250});
    ty.value = withTiming(clamped.y, {duration: 250});
    setVisiblePage(targetPage);
  };

  const updateVisiblePageJS = (page: number) => {
    setVisiblePage(page);
  };

  // Helper worklet to compute visible page and clamp (tx, ty)
  const clampCamera = (targetTx: number, targetTy: number, s: number) => {
    'worklet';
    const cW = containerWSV.value;
    const cH = containerHSV.value;
    const totalW = baseCardWidthSV.value;
    const totalH = totalHeightSV.value;

    const currentW = totalW * s;
    const currentH = totalH * s;

    let clampedX = targetTx;
    if (currentW <= cW) {
      clampedX = 0;
    } else {
      const maxDeltaX = (currentW - cW) / 2;
      clampedX = Math.max(-maxDeltaX, Math.min(maxDeltaX, targetTx));
    }

    let clampedY = targetTy;
    if (currentH <= cH) {
      clampedY = 0;
    } else {
      const maxDeltaY = (currentH - cH) / 2;
      clampedY = Math.max(-maxDeltaY, Math.min(maxDeltaY, targetTy));
    }

    return {x: clampedX, y: clampedY};
  };

  // Pan gesture for natural 2D scrolling
  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startTx.value = tx.value;
      startTy.value = ty.value;
      runOnJS(unsyncJS)();
    })
    .onUpdate(e => {
      'worklet';
      const s = scale.value > 0 ? scale.value : 1;
      const newTx = startTx.value + e.translationX;
      const newTy = startTy.value + e.translationY;
      const clamped = clampCamera(newTx, newTy, s);
      tx.value = clamped.x;
      ty.value = clamped.y;

      const totalH = totalHeightSV.value;
      const currentYMid = totalH / 2 - clamped.y / s;
      const yInList = currentYMid - SAFE_TOP;
      const itemH = itemTotalHeightSV.value;
      const pCount = pageCountSV.value;
      const curPage = Math.max(1, Math.min(pCount, Math.floor(yInList / itemH) + 1));
      if (curPage !== lastReportedPage.value) {
        lastReportedPage.value = curPage;
        runOnJS(updateVisiblePageJS)(curPage);
      }
    })
    .onEnd(e => {
      'worklet';
      const s = scale.value > 0 ? scale.value : 1;
      const cH = containerHSV.value;
      const totalH = totalHeightSV.value;
      const currentH = totalH * s;

      if (currentH > cH) {
        const maxDeltaY = (currentH - cH) / 2;
        ty.value = withDecay(
          {
            velocity: e.velocityY,
            clamp: [-maxDeltaY, maxDeltaY],
            deceleration: 0.997,
          },
          () => {
            'worklet';
            const curYMid = totalH / 2 - ty.value / s;
            const yInList = curYMid - SAFE_TOP;
            const itemH = itemTotalHeightSV.value;
            const pCount = pageCountSV.value;
            const curPage = Math.max(1, Math.min(pCount, Math.floor(yInList / itemH) + 1));
            if (curPage !== lastReportedPage.value) {
              lastReportedPage.value = curPage;
              runOnJS(updateVisiblePageJS)(curPage);
            }
          },
        );
      }
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(10)
    .onEnd(() => {
      'worklet';
      if (onTapBoard) runOnJS(onTapBoard)();
    });

  const gesture = Gesture.Simultaneous(panGesture, tapGesture);

  // Animated style: centered in container, scaled around center, translated by (tx, ty)
  const animatedCameraStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {translateX: tx.value},
        {translateY: ty.value},
        {scale: scale.value},
      ],
    };
  });

  // =========================================================================
  // TEACHER SYNC LOGIC
  // =========================================================================
  useEffect(() => {
    if (!synced) return;
    const targetPage = Math.min(Math.max(1, scroll?.page ?? safeCurrentPage), pageCount);
    const targetYRatio = scroll?.yRatio ?? 0;
    const syncKey = `${synced}_${targetPage}_${targetYRatio}_${zoom}_${containerWidth}_${containerHeight}`;
    if (lastSyncPayloadRef.current === syncKey) return;
    lastSyncPayloadRef.current = syncKey;

    const pageY = SAFE_TOP + (targetPage - 1) * baseItemTotalHeight;
    const targetContentY = pageY + baseCardHeight * targetYRatio;

    const s = zoom > 0 ? zoom : 1;
    scale.value = withTiming(s, {duration: 200});

    const targetTy = s * (totalContentHeight / 2 - targetContentY);
    const clamped = clampCamera(0, targetTy, s);

    tx.value = withTiming(clamped.x, {duration: 200});
    ty.value = withTiming(clamped.y, {duration: 200});
    setVisiblePage(targetPage);
  }, [synced, safeCurrentPage, zoom, scroll?.page, scroll?.yRatio, baseCardWidth, baseCardHeight, baseItemTotalHeight, containerHeight, containerWidth, pageCount, totalContentHeight, scale, tx, ty]);

  // =========================================================================
  // DISCRETE ZOOM BUTTONS (+/-)
  // Mathematical Focal Scaling around Screen Center with Zero Drift:
  // nextTy = currentTy * (nextScale / currentScale)
  // nextTx = currentTx * (nextScale / currentScale)
  // =========================================================================
  const applyZoomStep = (direction: 1 | -1) => {
    setSynced(false);
    const currentS = scale.value > 0 ? scale.value : 1;
    const nextS = Math.max(MIN_ZOOM, Math.min(currentS + direction * ZOOM_STEP, MAX_ZOOM));
    if (nextS === currentS) return;

    const ratio = nextS / currentS;
    const nextTx = tx.value * ratio;
    const nextTy = ty.value * ratio;

    const clamped = clampCamera(nextTx, nextTy, nextS);

    scale.value = withTiming(nextS, {duration: 180});
    tx.value = withTiming(clamped.x, {duration: 180});
    ty.value = withTiming(clamped.y, {duration: 180});
  };

  const isPressingControlRef = useRef(false);
  const activePageDisplay = synced ? safeCurrentPage : visiblePage;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme === 'dark' ? '#18191c' : '#f3f4f6',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onLayout={e => {
        setContainerHeight(e.nativeEvent.layout.height);
        setContainerWidth(e.nativeEvent.layout.width);
      }}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              width: baseCardWidth,
              paddingTop: SAFE_TOP,
              paddingBottom: SAFE_BOTTOM,
              alignItems: 'center',
            },
            animatedCameraStyle,
          ]}>
          {listData.map(pageNumber => (
            <View
              key={pageNumber}
              style={{
                width: baseCardWidth,
                marginBottom: PAGE_GAP,
                alignItems: 'center',
              }}>
              <ClassroomPageView
                pageUrl={boardMode === 'pdf' ? (pages[pageNumber - 1] ?? null) : null}
                boardMode={boardMode}
                notebookStyle={notebookPageStyles[pageNumber] ?? 'grid'}
                theme={theme}
                strokes={strokesByPage[pageNumber] ?? []}
                pageIndex={pageNumber}
                pointer={pointer && pointer.page === pageNumber ? pointer : null}
                customWidth={baseCardWidth}
              />
            </View>
          ))}
        </Animated.View>
      </GestureDetector>

      {/* Floating Top Left Controls (Page Indicator) */}
      {overlayVisible && (
        <View
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 60,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.9)',
              borderRadius: 9999,
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: 'row',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 1},
              shadowOpacity: 0.1,
              shadowRadius: 3,
              elevation: 2,
            }}>
            <Text
              style={{
                color: '#6b7280',
                fontSize: 11,
                fontWeight: '600',
              }}>
              {activePageDisplay} / {pageCount}
            </Text>
          </View>
        </View>
      )}

      {/* Right-Center Zoom Controls (+/-) */}
      {overlayVisible && (
        <View
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            marginTop: -52,
            zIndex: 60,
            gap: 8,
          }}>
          <Pressable
            onPressIn={() => {
              isPressingControlRef.current = true;
            }}
            onPressOut={() => {
              setTimeout(() => {
                isPressingControlRef.current = false;
              }, 150);
            }}
            onPress={() => applyZoomStep(1)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 1},
              shadowOpacity: 0.1,
              shadowRadius: 3,
              elevation: 2,
            }}>
            <Plus size={18} color="#374151" />
          </Pressable>
          <Pressable
            onPressIn={() => {
              isPressingControlRef.current = true;
            }}
            onPressOut={() => {
              setTimeout(() => {
                isPressingControlRef.current = false;
              }, 150);
            }}
            onPress={() => applyZoomStep(-1)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 1},
              shadowOpacity: 0.1,
              shadowRadius: 3,
              elevation: 2,
            }}>
            <Minus size={18} color="#374151" />
          </Pressable>
        </View>
      )}

      {/* Floating Bottom Resync Button ("Ustozga qaytish") */}
      {!synced && (
        <View
          style={{
            position: 'absolute',
            bottom: 84,
            alignSelf: 'center',
            zIndex: 60,
          }}>
          <Pressable
            onPressIn={() => {
              isPressingControlRef.current = true;
            }}
            onPressOut={() => {
              setTimeout(() => {
                isPressingControlRef.current = false;
              }, 150);
            }}
            onPress={returnToTeacher}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#4f46e5',
              paddingHorizontal: 16,
              paddingVertical: 9,
              borderRadius: 20,
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 4},
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 8,
            }}>
            <Move size={14} color="white" />
            <Text style={{color: 'white', fontSize: 12, fontWeight: '700'}}>Ustozga qaytish</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export const ClassroomBoard = React.memo(function ClassroomBoard({
  state,
  isFullscreen,
  onToggleFullscreen,
  onTapBoard,
  overlayVisible = true,
}: {
  state: ClassroomState;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onTapBoard?: () => void;
  overlayVisible?: boolean;
}) {
  if (state.boardLayout === 'split') {
    return (
      <View style={{flex: 1, flexDirection: 'row'}}>
        <View style={{flex: 1, borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.1)'}}>
          <Pane
            pages={state.pages}
            boardMode={state.leftBoardMode}
            notebookPageStyles={state.notebookPageStyles}
            notebookPageCount={state.notebookPageCount}
            theme={state.classroomTheme}
            strokesByPage={state.strokesByPage}
            pointer={state.pointer && (state.pointer.pane ?? 'left') === 'left' ? state.pointer : null}
            zoom={state.zoom}
            currentPage={state.currentPage}
            scroll={state.scroll}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            onTapBoard={onTapBoard}
            overlayVisible={overlayVisible}
          />
        </View>
        <View style={{flex: 1}}>
          <Pane
            pages={state.pages}
            boardMode={state.rightBoardMode}
            notebookPageStyles={state.notebookPageStyles}
            notebookPageCount={state.notebookPageCount}
            theme={state.classroomTheme}
            strokesByPage={state.rightStrokesByPage}
            pointer={state.pointer && state.pointer.pane === 'right' ? state.pointer : null}
            zoom={state.rightZoom}
            currentPage={state.currentPage}
            scroll={state.rightScroll}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            onTapBoard={onTapBoard}
            overlayVisible={overlayVisible}
          />
        </View>
      </View>
    );
  }

  return (
    <Pane
      pages={state.pages}
      boardMode={state.boardMode}
      notebookPageStyles={state.notebookPageStyles}
      notebookPageCount={state.notebookPageCount}
      theme={state.classroomTheme}
      strokesByPage={state.strokesByPage}
      pointer={state.pointer}
      zoom={state.zoom}
      currentPage={state.currentPage}
      scroll={state.scroll}
      isFullscreen={isFullscreen}
      onToggleFullscreen={onToggleFullscreen}
      onTapBoard={onTapBoard}
      overlayVisible={overlayVisible}
    />
  );
});
