import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Maximize, Pause, Play, RotateCcw, RotateCw } from 'lucide-react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Video, {
  SelectedTrackType,
  TextTrackType,
  type OnLoadData,
  type OnProgressData,
  type VideoRef,
} from 'react-native-video';
import { useAuthStore } from '../store/authStore';
import { useOfflineVideoStore } from '../store/offlineVideoStore';
import { useNetwork } from '../providers/NetworkProvider';
import { apiGetWatchProgress, apiSaveWatchProgress, apiStartVideoPlayback, type WatchSegment } from '../api/videos';
import { API_URL } from '../config/env';
import { disableSecureScreen, enableSecureScreen } from '../lib/secureScreen';
import {
  cleanupOfflinePlayback,
  getOfflineVideoMeta,
  isOfflineVideoComplete,
  prepareOfflinePlayback,
} from '../lib/offlineVideoService';

const API_BASE = API_URL.replace(/\/$/, '');

/** iOS cannot play the files the downloader writes (AVFoundation refuses both the rewritten
 *  playlist and a merged .ts -- see offlineVideoService), so downloading there only burns
 *  storage for a badge that can never deliver offline playback. */
const DOWNLOADS_SUPPORTED = Platform.OS === 'android';

function computeTotalWatchedSeconds(segments: WatchSegment[], live: WatchSegment | null): number {
  const all: WatchSegment[] = segments.map(s => ({ startSec: s.startSec, endSec: s.endSec }));
  if (live && live.endSec > live.startSec) {
    all.push({ startSec: live.startSec, endSec: live.endSec });
  }
  if (all.length === 0) return 0;

  all.sort((a, b) => a.startSec - b.startSec);

  const merged: WatchSegment[] = [{ startSec: all[0].startSec, endSec: all[0].endSec }];
  for (let i = 1; i < all.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = all[i];
    if (curr.startSec <= prev.endSec) {
      prev.endSec = Math.max(prev.endSec, curr.endSec);
    } else {
      merged.push({ startSec: curr.startSec, endSec: curr.endSec });
    }
  }

  return merged.reduce((sum, s) => sum + Math.max(0, s.endSec - s.startSec), 0);
}

/**
 * Fullscreen and Picture-in-Picture are both native here (react-native-video's
 * presentFullscreenPlayer / enterPictureInPicture, backed on Android by reparenting the same
 * ExoPlayer surface into a native Dialog / the OS's real PiP window) -- not JS-simulated. The
 * tradeoff, for now: react-native-video's native fullscreen Dialog only carries over the video
 * surface and (with controls) its own native control bar, not our RN view tree, so the custom
 * watermark/subtitle overlay from the previous approach is dropped in this phase rather than
 * silently rendered somewhere it can't be seen. See
 * docs/superpowers/specs/2026-08-22-native-fullscreen-pip-video-design.md for the full
 * reasoning and the deferred follow-up (patching the native FullScreenPlayerView to reinject
 * watermark/subtitles as native overlay views).
 */
export function HlsVideoPlayer({
  blockId,
  title,
  lessonId,
  lessonTitle,
  courseId,
  courseTitle,
  schoolId,
  onClose,
}: {
  blockId: string;
  title?: string;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  courseTitle?: string;
  schoolId?: string;
  /** This component is only ever mounted by a play press (see LazyVideoPlayer), so it always
   *  starts playing immediately -- there is no separate "mounted but paused" entry point.
   *  Called only from the error state's own close button: leaving native fullscreen (the
   *  Dialog's own back/close) just returns to inline playback, since the same mounted
   *  <Video> is still playing -- there's nothing to "close" on a plain fullscreen dismiss. */
  onClose: () => void;
}) {
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [watchedSegments, setWatchedSegments] = useState<WatchSegment[]>([]);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seeking, setSeeking] = useState(false);
  // Native fullscreen's own Dialog only carries over the video surface, not our custom
  // overlay below -- so while it's up, native controls take over instead of leaving the
  // student with no controls at all. Inline goes back to the custom overlay as soon as it
  // dismisses.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const durationRef = useRef<number | null>(null);
  const resumeTimeRef = useRef(0);
  const currentTimeRef = useRef(0);
  const cachedDurationRef = useRef<number | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(paused);
  const seekBarWidthRef = useRef(0);

  const token = useAuthStore(s => s.token);
  const {
    registry,
    startDownload,
    loadRegistry,
  } = useOfflineVideoStore();

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  const videoRef = useRef<VideoRef>(null);
  const currentRangeRef = useRef<{ start: number; end: number } | null>(null);
  const lastSavedEndRef = useRef(0);
  const lastTimeRef = useRef(0);
  const watchedSegmentsRef = useRef<WatchSegment[]>([]);
  const lastPercentCalcRef = useRef(0);

  useEffect(() => {
    enableSecureScreen();
    return () => {
      disableSecureScreen();
      void cleanupOfflinePlayback(blockId);
    };
  }, [blockId]);

  const { online } = useNetwork();
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const loadPlayback = useCallback(async (forcedOnline?: boolean) => {
    setError(false);

    const isOnline = forcedOnline !== undefined ? forcedOnline : online;

    // 1. Prefer a fully downloaded local copy -- it plays the whole video with no network.
    //    A partial cache is deliberately skipped while online: it only covers what was
    //    fetched before the download stopped, so preferring it would pin a 30-minute lesson
    //    to however far it got. Offline it beats an error screen, so it plays there -- and
    //    in the catch below it is also the fallback for a failed session call.
    const localMeta = await getOfflineVideoMeta(blockId);
    if (localMeta && localMeta.localManifestPath) {
      const hasCompleteCopy = isOfflineVideoComplete(localMeta);
      if (hasCompleteCopy || !isOnline) {
        const cleanPath = localMeta.localManifestPath.replace('file://', '');
        const exists = await ReactNativeBlobUtil.fs.exists(cleanPath).catch(() => false);
        if (exists) {
          await prepareOfflinePlayback(blockId).catch(() => {});
          setManifestUrl(`file://${cleanPath}`);
          if (hasCompleteCopy && localMeta.localSubtitlePath) {
            const cleanSub = localMeta.localSubtitlePath.replace('file://', '');
            const subExists = await ReactNativeBlobUtil.fs.exists(cleanSub).catch(() => false);
            if (subExists) {
              setSubtitleUrl(`file://${cleanSub}`);
            }
          }
          cachedDurationRef.current = hasCompleteCopy ? null : localMeta.durationSec ?? null;
          setIsOfflineMode(true);
          return;
        }
      }
    }

    if (!isOnline) {
      setError(true);
      return;
    }

    let playingPartialFallback = false;
    if (localMeta && localMeta.localManifestPath) {
      const cleanPath = localMeta.localManifestPath.replace('file://', '');
      const exists = await ReactNativeBlobUtil.fs.exists(cleanPath).catch(() => false);
      if (exists) {
        await prepareOfflinePlayback(blockId).catch(() => {});
        setManifestUrl(`file://${cleanPath}`);
        cachedDurationRef.current = isOfflineVideoComplete(localMeta)
          ? null
          : localMeta.durationSec ?? null;
        setIsOfflineMode(true);
        playingPartialFallback = true;
      }
    }

    try {
      const playback = await apiStartVideoPlayback(blockId);
      if (currentTimeRef.current > 0) {
        resumeTimeRef.current = currentTimeRef.current;
      }
      cachedDurationRef.current = null;
      setManifestUrl(`${API_BASE}${playback.manifestUrl}`);
      setSubtitleUrl(playback.subtitleUrl);
      setIsOfflineMode(false);
    } catch {
      if (!playingPartialFallback) {
        setError(true);
      }
    }
  }, [blockId, online]);

  useEffect(() => {
    void loadPlayback();
  }, [loadPlayback]);

  const wasOfflineRef = useRef(online);
  useEffect(() => {
    const cameBackOnline = online && !wasOfflineRef.current;
    wasOfflineRef.current = online;
    if (cameBackOnline && (error || isOfflineMode)) {
      void loadPlayback(true);
    }
  }, [online, error, isOfflineMode, loadPlayback]);

  const startDownloadIfNeeded = useCallback(() => {
    if (!DOWNLOADS_SUPPORTED || !onlineRef.current) return;
    const state = useOfflineVideoStore.getState();
    if (
      isOfflineVideoComplete(state.registry[blockId]) ||
      state.activeDownloads[blockId]?.status === 'downloading'
    ) {
      return;
    }
    void startDownload(blockId, {
      title,
      lessonId,
      lessonTitle,
      courseId,
      courseTitle,
      schoolId,
      durationSec: durationRef.current,
    });
  }, [blockId, title, lessonId, lessonTitle, courseId, courseTitle, schoolId, startDownload]);

  const cachingStartedRef = useRef(false);
  useEffect(() => {
    if (paused || cachingStartedRef.current) return;
    cachingStartedRef.current = true;
    startDownloadIfNeeded();
  }, [paused, startDownloadIfNeeded]);

  useEffect(() => {
    let cancelled = false;
    apiGetWatchProgress(blockId)
      .then(data => {
        if (cancelled) return;
        setWatchedSegments(data.segments);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blockId]);

  useEffect(() => {
    watchedSegmentsRef.current = watchedSegments;
  }, [watchedSegments]);

  const closeCurrentRange = useCallback(() => {
    const range = currentRangeRef.current;
    if (range && range.end > range.start && range.end > lastSavedEndRef.current) {
      const startSec = Math.floor(range.start);
      const endSec = Math.ceil(range.end);
      if (endSec > startSec) {
        const dur =
          !isOfflineMode && durationRef.current && durationRef.current > 0
            ? Math.round(durationRef.current)
            : undefined;
        apiSaveWatchProgress(blockId, startSec, endSec, dur)
          .then(data => {
            setWatchedSegments(data.segments);
          })
          .catch(() => {});
        lastSavedEndRef.current = range.end;
      }
    }
  }, [blockId, isOfflineMode]);

  useEffect(() => {
    durationRef.current = videoDuration;
  }, [videoDuration]);

  function handleLoad(data: OnLoadData) {
    const cached = cachedDurationRef.current;
    if (cached && cached > 0) {
      setVideoDuration(cached);
    } else if (!isNaN(data.duration) && isFinite(data.duration)) {
      setVideoDuration(data.duration);
    }
    const resumeAt = resumeTimeRef.current;
    if (resumeAt > 0) {
      videoRef.current?.seek(resumeAt);
      resumeTimeRef.current = 0;
    }
  }

  function handleProgress(data: OnProgressData) {
    const current = data.currentTime;
    currentTimeRef.current = current;
    if (!seeking) setCurrentTime(current);

    const jumpThreshold = 4;
    const jumped = Math.abs(current - lastTimeRef.current) > jumpThreshold;
    lastTimeRef.current = current;

    if (jumped || !currentRangeRef.current) {
      closeCurrentRange();
      currentRangeRef.current = { start: current, end: current };
      lastSavedEndRef.current = 0;
    } else {
      currentRangeRef.current.end = current;
    }

    const inProgress = currentRangeRef.current;
    const liveSegment = { startSec: Math.floor(inProgress.start), endSec: Math.ceil(inProgress.end) };
    if (videoDuration && videoDuration > 0 && Date.now() - lastPercentCalcRef.current >= 2000) {
      lastPercentCalcRef.current = Date.now();
      void computeTotalWatchedSeconds(watchedSegmentsRef.current, liveSegment);
    }
  }

  useEffect(() => {
    return () => closeCurrentRange();
  }, [closeCurrentRange]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        closeCurrentRange();
      }
    });
    return () => sub.remove();
  }, [closeCurrentRange]);

  // Controls auto-hide while playing (same 3.5s pattern as native's own control bar) so
  // scrubbing/pausing/tapping doesn't fight a timer mid-interaction; paused always stays
  // visible since there's nothing to hide it from.
  const scheduleAutoHide = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 3500);
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      setControlsVisible(true);
    } else {
      scheduleAutoHide();
    }
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [paused, scheduleAutoHide]);

  function toggleControls() {
    if (controlsVisible) {
      setControlsVisible(false);
    } else {
      setControlsVisible(true);
      if (!paused) scheduleAutoHide();
    }
  }

  function togglePlayPause() {
    setPaused(p => !p);
    setControlsVisible(true);
    if (paused) scheduleAutoHide();
  }

  function handleSeekBarLayout(width: number) {
    seekBarWidthRef.current = width;
  }

  function seekBy(deltaSeconds: number) {
    const duration = durationRef.current ?? 0;
    const next = Math.max(0, Math.min(duration, currentTimeRef.current + deltaSeconds));
    videoRef.current?.seek(next);
    currentTimeRef.current = next;
    setCurrentTime(next);
    if (!paused) scheduleAutoHide();
  }

  function formatTime(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  // PanResponder.create only runs once (useRef initializer), so its callbacks close over
  // that first render's values forever -- every value they read (seek bar width, pause
  // state) comes from a ref for that reason, not the state/props above.
  const seekPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
        setSeeking(true);
        const duration = durationRef.current ?? 0;
        const width = seekBarWidthRef.current;
        if (width > 0 && duration > 0) {
          const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / width));
          setCurrentTime(ratio * duration);
        }
      },
      onPanResponderMove: (evt) => {
        const duration = durationRef.current ?? 0;
        const width = seekBarWidthRef.current;
        if (width > 0 && duration > 0) {
          const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / width));
          setCurrentTime(ratio * duration);
        }
      },
      onPanResponderRelease: (evt) => {
        const duration = durationRef.current ?? 0;
        const width = seekBarWidthRef.current;
        if (width > 0 && duration > 0) {
          const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / width));
          const target = ratio * duration;
          videoRef.current?.seek(target);
          currentTimeRef.current = target;
          setCurrentTime(target);
        }
        setSeeking(false);
        if (!pausedRef.current) scheduleAutoHide();
      },
    }),
  ).current;

  const textTracks = subtitleUrl
    ? [
        {
          title: 'Subtitr',
          language: 'uz' as const,
          type: subtitleUrl.endsWith('.vtt') ? TextTrackType.VTT : TextTrackType.SUBRIP,
          uri: subtitleUrl,
        },
      ]
    : undefined;

  return (
    <View style={StyleSheet.absoluteFill}>
      {error ? (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center p-6 bg-black z-30">
          <Text className="text-xs font-semibold text-white/90 mb-1 text-center">
            Internetga ulanmagansiz
          </Text>
          <Text className="text-[11px] text-white/50 mb-4 text-center">
            Ushbu video hali xotiraga keshlanmagan. Ko'rish uchun internetni yoqing.
          </Text>
          <Pressable
            onPress={() => void loadPlayback()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 active:opacity-80">
            <Text className="text-xs font-bold text-white">Qayta urinish</Text>
          </Pressable>
          <Pressable onPress={onClose} className="mt-3 px-5 py-2">
            <Text className="text-xs font-semibold text-white/70">Yopish</Text>
          </Pressable>
        </View>
      ) : !manifestUrl ? (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-black">
          <ActivityIndicator color="white" />
        </View>
      ) : (
        <>
          <Video
            ref={videoRef}
            source={
              manifestUrl.startsWith('file://')
                ? { uri: manifestUrl }
                : { uri: manifestUrl, headers: token ? { Authorization: `Bearer ${token}` } : undefined }
            }
            style={StyleSheet.absoluteFill}
            paused={paused}
            controls={isFullscreen}
            resizeMode="contain"
            textTracks={textTracks}
            selectedTextTrack={
              textTracks ? { type: SelectedTrackType.TITLE, value: 'Subtitr' } : undefined
            }
            progressUpdateInterval={500}
            preventsDisplaySleepDuringVideoPlayback
            ignoreSilentSwitch="ignore"
            playInBackground
            playWhenInactive
            showNotificationControls
            enterPictureInPictureOnLeave
            bufferConfig={{
              minBufferMs: 15000,
              maxBufferMs: 50000,
              bufferForPlaybackMs: 1000,
              bufferForPlaybackAfterRebufferMs: 2500,
            }}
            onLoad={handleLoad}
            onProgress={handleProgress}
            onError={() => {
              if (isOfflineMode) {
                setIsOfflineMode(false);
                apiStartVideoPlayback(blockId)
                  .then(playback => {
                    setManifestUrl(`${API_BASE}${playback.manifestUrl}`);
                    setSubtitleUrl(playback.subtitleUrl);
                  })
                  .catch(() => setError(true));
              } else {
                setError(true);
              }
            }}
            onEnd={() => {
              closeCurrentRange();
              setPaused(true);
            }}
            onFullscreenPlayerWillPresent={() => setIsFullscreen(true)}
            onFullscreenPlayerWillDismiss={() => setIsFullscreen(false)}
          />
          {!isFullscreen && (
          <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={toggleControls}
            accessibilityRole="button"
            accessibilityLabel={controlsVisible ? 'Boshqaruv panelini yashirish' : 'Boshqaruv panelini ko\'rsatish'}
          />
          {controlsVisible && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <View className="flex-1 flex-row items-center justify-center gap-6">
                <Pressable
                  onPress={() => seekBy(-5)}
                  hitSlop={14}
                  className="h-11 w-11 items-center justify-center rounded-full bg-black/40"
                  accessibilityLabel="5 soniya orqaga">
                  <RotateCcw size={22} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={togglePlayPause}
                  hitSlop={14}
                  className="h-[72px] w-[72px] items-center justify-center rounded-full bg-black/40"
                  accessibilityLabel={paused ? 'Ijro etish' : 'Pauza'}>
                  {paused ? (
                    <Play size={34} color="#fff" fill="#fff" />
                  ) : (
                    <Pause size={34} color="#fff" fill="#fff" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => seekBy(5)}
                  hitSlop={14}
                  className="h-11 w-11 items-center justify-center rounded-full bg-black/40"
                  accessibilityLabel="5 soniya oldinga">
                  <RotateCw size={22} color="#fff" />
                </Pressable>
              </View>
              <View className="bg-black/40 px-3 pb-2.5 pt-3">
                <View
                  onLayout={e => handleSeekBarLayout(e.nativeEvent.layout.width)}
                  {...seekPanResponder.panHandlers}
                  className="h-8 justify-center">
                  <View className="h-1 overflow-hidden rounded-full bg-white/30">
                    <View
                      className="h-1 rounded-full bg-white"
                      style={{
                        width:
                          videoDuration && videoDuration > 0
                            ? `${Math.min(100, (currentTime / videoDuration) * 100)}%`
                            : '0%',
                      }}
                    />
                  </View>
                </View>
                <View className="flex-row items-center justify-between px-0.5">
                  <Text className="text-xs font-semibold text-white">
                    {formatTime(currentTime)} / {formatTime(videoDuration ?? 0)}
                  </Text>
                  <Pressable
                    onPress={() => videoRef.current?.presentFullscreenPlayer()}
                    hitSlop={14}
                    accessibilityLabel="To'liq ekran">
                    <Maximize size={19} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
          </>
          )}
        </>
      )}
    </View>
  );
}
