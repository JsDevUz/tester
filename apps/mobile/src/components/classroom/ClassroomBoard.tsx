import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Image, Pressable, Text, View, useWindowDimensions} from 'react-native';
import Animated, {
  cancelAnimation,
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
  notebookPageOrientations = {},
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
  notebookPageOrientations?: ClassroomState['notebookPageOrientations'];
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

  const [aspects, setAspects] = useState<Record<number, number>>({});

  useEffect(() => {
    if (boardMode !== 'pdf' || pages.length === 0) return;
    pages.forEach((url, idx) => {
      if (!url) return;
      const pageNumber = idx + 1;
      if (aspectCache[url]) {
        setAspects((prev) =>
          prev[pageNumber] === aspectCache[url]
            ? prev
            : { ...prev, [pageNumber]: aspectCache[url] },
        );
      } else {
        Image.getSize(
          url,
          (w, h) => {
            if (w > 0 && h > 0) {
              const ratio = w / h;
              aspectCache[url] = ratio;
              if (idx === 0) {
                setCachedDocAspectRatio(ratio);
                setDocAspectRatio(ratio);
              }
              setAspects((prev) => ({ ...prev, [pageNumber]: ratio }));
            }
          },
          () => {},
        );
      }
    });
  }, [boardMode, pages]);

  const isLandscape = containerWidth > containerHeight;
  const cardAspectRatio = boardMode === 'pdf' ? (docAspectRatio > 0 ? docAspectRatio : 1600 / 2263) : (210 / 297);
  const safePaddingTop = isLandscape ? 12 : SAFE_TOP;
  const safePaddingBottom = isLandscape ? 12 : SAFE_BOTTOM;
  const availableH = Math.max(200, containerHeight - safePaddingTop - safePaddingBottom);
  const baseCardWidth = isLandscape
    ? Math.min(containerWidth, Math.max(260, availableH * cardAspectRatio))
    : Math.min(800, containerWidth);
  const baseCardHeight = baseCardWidth / cardAspectRatio;
  const baseItemTotalHeight = baseCardHeight + PAGE_GAP;

  const pageAspectRatios = useMemo(() => {
    return listData.map((pageNumber) => {
      if (boardMode === 'notebook') {
        const orientation = notebookPageOrientations[pageNumber] ?? 'portrait';
        return orientation === 'landscape' ? 297 / 210 : 210 / 297;
      }
      const url = pages[pageNumber - 1];
      if (url && aspectCache[url]) return aspectCache[url];
      if (aspects[pageNumber]) return aspects[pageNumber];
      return docAspectRatio > 0 ? docAspectRatio : 1600 / 2263;
    });
  }, [listData, boardMode, notebookPageOrientations, pages, aspects, docAspectRatio]);

  const pageHeights = useMemo(() => {
    return pageAspectRatios.map((ratio: number) => baseCardWidth / (ratio > 0 ? ratio : 1));
  }, [pageAspectRatios, baseCardWidth]);

  const pageOffsets = useMemo(() => {
    const offsets: number[] = [];
    let currentY = safePaddingTop;
    for (let i = 0; i < pageHeights.length; i++) {
      offsets.push(currentY);
      currentY += pageHeights[i] + PAGE_GAP;
    }
    return offsets;
  }, [pageHeights, safePaddingTop]);

  const totalContentHeight = useMemo(() => {
    const sumH = pageHeights.reduce((acc: number, h: number) => acc + h, 0);
    const gaps = Math.max(0, pageCount - 1) * PAGE_GAP;
    return safePaddingTop + sumH + gaps + safePaddingBottom;
  }, [pageHeights, pageCount, safePaddingTop, safePaddingBottom]);

  const baseCardWidthSV = useSharedValue(baseCardWidth);
  const totalHeightSV = useSharedValue(totalContentHeight);
  const itemTotalHeightSV = useSharedValue(baseItemTotalHeight);
  const pageCountSV = useSharedValue(pageCount);
  const pageOffsetsSV = useSharedValue<number[]>(pageOffsets);
  const pageHeightsSV = useSharedValue<number[]>(pageHeights);

  useEffect(() => {
    baseCardWidthSV.value = baseCardWidth;
    totalHeightSV.value = totalContentHeight;
    itemTotalHeightSV.value = baseItemTotalHeight;
    pageCountSV.value = pageCount;
    pageOffsetsSV.value = pageOffsets;
    pageHeightsSV.value = pageHeights;
  }, [baseCardWidth, totalContentHeight, baseItemTotalHeight, pageCount, pageOffsets, pageHeights, baseCardWidthSV, totalHeightSV, itemTotalHeightSV, pageCountSV, pageOffsetsSV, pageHeightsSV]);

  // Initial target Y for page
  const initialPageIdx = safeCurrentPage - 1;
  const initialTargetY = (pageOffsets[initialPageIdx] ?? safePaddingTop) + (pageHeights[initialPageIdx] ?? baseCardHeight) / 2;
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
    const pageIdx = targetPage - 1;
    const pageY = pageOffsets[pageIdx] ?? (safePaddingTop + pageIdx * baseItemTotalHeight);
    const pageH = pageHeights[pageIdx] ?? baseCardHeight;
    const targetContentY = pageY + pageH * targetYRatio;

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

  // Helper JS function to compute camera clamp using fresh JS layout variables
  // directly during React sync effects, avoiding stale SharedValue reads.
  const clampCameraVal = (
    targetTx: number,
    targetTy: number,
    s: number,
    cW: number,
    cH: number,
    totalW: number,
    totalH: number,
  ) => {
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

  // Helper worklet to compute visible page and clamp (tx, ty) during gesture pan
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
      const offsets = pageOffsetsSV.value;
      const heights = pageHeightsSV.value;
      let curPage = 1;
      for (let i = 0; i < offsets.length; i++) {
        const pageTop = offsets[i];
        const pageBottom = pageTop + (heights[i] || 0) + PAGE_GAP;
        if (currentYMid >= pageTop && currentYMid < pageBottom) {
          curPage = i + 1;
          break;
        }
        if (currentYMid >= pageBottom) {
          curPage = i + 1;
        }
      }
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
            const offsets = pageOffsetsSV.value;
            const heights = pageHeightsSV.value;
            let curPage = 1;
            for (let i = 0; i < offsets.length; i++) {
              const pageTop = offsets[i];
              const pageBottom = pageTop + (heights[i] || 0) + PAGE_GAP;
              if (curYMid >= pageTop && curYMid < pageBottom) {
                curPage = i + 1;
                break;
              }
              if (curYMid >= pageBottom) {
                curPage = i + 1;
              }
            }
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

  // Track initial sync load to set camera instantly without giant animation jump
  const isInitialSyncRef = useRef(true);

  // Reset initial sync flag when mode or page count changes fundamentally
  useEffect(() => {
    isInitialSyncRef.current = true;
  }, [boardMode, pageCount]);

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

    const pageIdx = targetPage - 1;
    const pageY = pageOffsets[pageIdx] ?? (safePaddingTop + pageIdx * baseItemTotalHeight);
    const pageH = pageHeights[pageIdx] ?? baseCardHeight;
    const targetContentY = pageY + pageH * targetYRatio;

    const s = zoom > 0 ? zoom : 1;
    const targetTy = s * (totalContentHeight / 2 - targetContentY);
    // Use fresh JS layout values to compute camera clamp immediately upon mount/sync
    const clamped = clampCameraVal(0, targetTy, s, containerWidth, containerHeight, baseCardWidth, totalContentHeight);

    const pageDistance = Math.abs(targetPage - (lastReportedPage.value || visiblePage));

    if (isInitialSyncRef.current || pageDistance > 1) {
      isInitialSyncRef.current = false;
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
      scale.value = s;
      tx.value = clamped.x;
      ty.value = clamped.y;
    } else {
      scale.value = withTiming(s, {duration: 80});
      tx.value = withTiming(clamped.x, {duration: 80});
      ty.value = withTiming(clamped.y, {duration: 80});
    }
    setVisiblePage(targetPage);
  }, [synced, safeCurrentPage, zoom, scroll?.page, scroll?.yRatio, baseCardWidth, baseCardHeight, baseItemTotalHeight, containerHeight, containerWidth, pageCount, totalContentHeight, pageOffsets, pageHeights, scale, tx, ty]);

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

    const clamped = clampCameraVal(nextTx, nextTy, nextS, containerWidth, containerHeight, baseCardWidth, totalContentHeight);

    scale.value = withTiming(nextS, {duration: 180});
    tx.value = withTiming(clamped.x, {duration: 180});
    ty.value = withTiming(clamped.y, {duration: 180});
  };

  const isPressingControlRef = useRef(false);
  const targetPage = Math.min(Math.max(1, scroll?.page ?? safeCurrentPage), pageCount);
  const activePageDisplay = synced ? targetPage : visiblePage;

  // Windowing: 191+ betli katta PDF'larda barcha sahifalarni birdaniga DOM'ga
  // chiqarmaymiz — faqat joriy ko'rinayotgan sahifa va uning atrofidagi 3 ta
  // sahifani (jami 7 ta) render qilamiz. Qolganlariga yengil placeholder joy
  // qoldiriladi. Bu xotira to'lishi, op-oppoq sahifa va tarmoq botlanishini batamom yo'qotadi.
  const renderWindowMin = Math.max(1, activePageDisplay - 3);
  const renderWindowMax = Math.min(pageCount, activePageDisplay + 3);

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
              paddingTop: safePaddingTop,
              paddingBottom: safePaddingBottom,
              alignItems: 'center',
            },
            animatedCameraStyle,
          ]}>
          {listData.map((pageNumber, idx) => {
            const isVisibleWindow = pageNumber >= renderWindowMin && pageNumber <= renderWindowMax;
            const cardHeight = pageHeights[idx] ?? baseCardHeight;
            return (
              <View
                key={pageNumber}
                style={{
                  width: baseCardWidth,
                  height: cardHeight,
                  marginBottom: PAGE_GAP,
                  alignItems: 'center',
                }}>
                {isVisibleWindow ? (
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
                ) : (
                  <View
                    style={{
                      width: baseCardWidth,
                      height: cardHeight,
                      backgroundColor: boardMode === 'pdf' ? '#ffffff' : (theme === 'dark' ? '#232733' : '#ffffff'),
                      borderRadius: 4,
                    }}
                  />
                )}
              </View>
            );
          })}
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
            notebookPageOrientations={state.notebookPageOrientations}
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
            notebookPageOrientations={state.notebookPageOrientations}
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
      notebookPageOrientations={state.notebookPageOrientations}
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
