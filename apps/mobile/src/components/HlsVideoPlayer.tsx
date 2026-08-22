import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Video, {
  type OnLoadData,
  type OnProgressData,
  type VideoRef,
} from 'react-native-video';
import {
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  DownloadCloud,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { apiGetWatchProgress, apiSaveWatchProgress, apiStartVideoPlayback, type WatchSegment } from '../api/videos';
import { API_URL } from '../config/env';
import { disableSecureScreen, enableSecureScreen } from '../lib/secureScreen';
import { useNetwork } from '../providers/NetworkProvider';
import { useAuthStore } from '../store/authStore';
import { useOfflineVideoStore } from '../store/offlineVideoStore';
import { useActiveVideoStore } from '../store/activeVideoStore';
import { getOfflineVideoMeta, isOfflineVideoComplete } from '../lib/offlineVideoService';

const API_BASE = API_URL.replace(/\/$/, '');

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Speeds the rate button cycles through, in order. */
const PLAYBACK_RATES: number[] = [1, 1.25, 1.5, 1.75, 2];

/** iOS cannot play the files the downloader writes (AVFoundation refuses both the rewritten
 *  playlist and a merged .ts -- see offlineVideoService), so downloading there only burns
 *  storage for a badge that can never deliver offline playback. */
const DOWNLOADS_SUPPORTED = Platform.OS === 'android';

/** "7,2 MB" -- comma decimal separator, matching the rest of the Uzbek UI. */
function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function base64Encode(input: string): string {
  let output = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = input.charCodeAt(i + 1);
    const c = input.charCodeAt(i + 2);
    const triplet = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c);
    output += BASE64_CHARS[(triplet >> 18) & 0x3f];
    output += BASE64_CHARS[(triplet >> 12) & 0x3f];
    output += isNaN(b) ? '=' : BASE64_CHARS[(triplet >> 6) & 0x3f];
    output += isNaN(c) ? '=' : BASE64_CHARS[triplet & 0x3f];
  }
  return output;
}

function extractWatermarkPhone(phone?: string | null): string {
  const rawPhone = phone?.replace(/\D/g, '') ?? '';
  if (!rawPhone) return '';
  const withoutCountryCode = rawPhone.startsWith('998') ? rawPhone.slice(3) : rawPhone;
  return base64Encode(withoutCountryCode);
}

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

function quietWatermarkPosition() {
  const leftZones = [14 + Math.random() * 14, 72 + Math.random() * 14];
  const topZones = [18 + Math.random() * 12, 68 + Math.random() * 14];
  return {
    left: leftZones[Math.floor(Math.random() * leftZones.length)],
    top: topZones[Math.floor(Math.random() * topZones.length)],
  };
}

function parseTime(timeStr: string): number {
  const cleanStr = timeStr.trim().replace(',', '.');
  const parts = cleanStr.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(cleanStr) || 0;
}

function parseSubtitles(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const [startStr, endPart] = line.split('-->');
      const start = parseTime(startStr);
      const end = parseTime(endPart.trim().split(/\s+/)[0]);
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        const cleanText = lines[i].replace(/<[^>]*>/g, '').trim();
        if (cleanText) textLines.push(cleanText);
        i++;
      }
      if (textLines.length > 0 && !isNaN(start) && !isNaN(end) && end > start) {
        cues.push({
          start,
          end,
          text: textLines.join('\n'),
        });
      }
    }
    i++;
  }
  return cues;
}

export function HlsVideoPlayer({
  blockId,
  watermark = true,
  title,
  lessonId,
  lessonTitle,
  courseId,
  courseTitle,
  schoolId,
  onClose,
}: {
  blockId: string;
  watermark?: boolean;
  title?: string;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  courseTitle?: string;
  schoolId?: string;
  /** This component is only ever mounted by a play press (see LazyVideoPlayer), so it always
   *  starts playing immediately -- there is no separate "mounted but paused" entry point. */
  onClose: () => void;
}) {
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [error, setError] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [markVisible, setMarkVisible] = useState(false);
  const [markPosition, setMarkPosition] = useState(() => quietWatermarkPosition());
  const [watchedSegments, setWatchedSegments] = useState<WatchSegment[]>([]);
  const [watchedPercent, setWatchedPercent] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [barWidth, setBarWidth] = useState(0);
  // How far the player has buffered ahead, drawn as the lighter track behind the played
  // portion so the bar shows what is ready to watch, Telegram-style.
  const [playableDuration, setPlayableDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef<number | null>(null);
  const barWidthRef = useRef(0);
  const currentTimeRef = useRef(0);
  const resumeTimeRef = useRef(0);
  /** Target of a seek still settling, and when it was issued; see seekTo and handleProgress. */
  const pendingSeekRef = useRef<number | null>(null);
  const seekStartedAtRef = useRef(0);
  const [progressOpen, setProgressOpen] = useState(false);
  const [mode, setMode] = useState<'fullscreen' | 'pip'>('fullscreen');
  const isFullscreen = mode === 'fullscreen';
  const setStoreIsFullscreen = useActiveVideoStore(s => s.setIsFullscreen);

  // Mirrors local `mode` into the store so CourseScreen can hide its native header only
  // while truly fullscreen (PiP is small enough that the header stays useful). Resets to
  // true on unmount so a later video reopens fullscreen-first regardless of how the
  // previous one was left.
  useEffect(() => {
    setStoreIsFullscreen(isFullscreen);
    return () => setStoreIsFullscreen(true);
  }, [isFullscreen, setStoreIsFullscreen]);

  const [isBuffering, setIsBuffering] = useState(false);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  // PiP box position, dragged freely with a finger. Starts near the top-right so it never
  // opens on top of the close/PiP buttons a viewer might reach for next. The box itself is
  // small enough that it never needs to be clamped to stay fully on screen in practice for
  // the phone sizes this app targets.
  const pipSize = { width: 320, height: 180 };
  const pipPan = useRef(
    new Animated.ValueXY({ x: Dimensions.get('screen').width - pipSize.width - 16, y: 80 }),
  ).current;
  const pipPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pipPan.setOffset({
          // @ts-expect-error -- Animated.ValueXY exposes _value at runtime; there is no
          // public getter, and this is the standard RN pattern for resuming a drag from the
          // box's current position instead of snapping back to (0,0).
          x: pipPan.x._value,
          // @ts-expect-error -- see above.
          y: pipPan.y._value,
        });
        pipPan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pipPan.x, dy: pipPan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pipPan.flattenOffset();
      },
    }),
  ).current;

  // Fullscreen swipe-to-dismiss: dragging the video up or down fades it out proportionally
  // to how far the finger has moved (Telegram/Instagram's media-viewer gesture), closing
  // once the drag passes a threshold and springing back otherwise. Only claims the gesture
  // once the drag is clearly vertical and past a small slop, so a plain tap still reaches
  // the tap-to-toggle-controls Pressable underneath instead of being swallowed here.
  const dismissDrag = useRef(new Animated.Value(0)).current;
  const dismissThreshold = 120;
  const dismissResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_e, gesture) =>
        Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5,
      onPanResponderMove: Animated.event([null, { dy: dismissDrag }], { useNativeDriver: false }),
      onPanResponderRelease: (_e, gesture) => {
        if (Math.abs(gesture.dy) > dismissThreshold) {
          onClose();
          return;
        }
        Animated.spring(dismissDrag, { toValue: 0, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dismissDrag, { toValue: 0, useNativeDriver: false }).start();
      },
    }),
  ).current;
  const dismissOpacity = dismissDrag.interpolate({
    inputRange: [-dismissThreshold * 2, 0, dismissThreshold * 2],
    outputRange: [0.3, 1, 0.3],
    extrapolate: 'clamp',
  });

  const {
    registry,
    activeDownloads,
    startDownload,
    removeDownload,
    loadRegistry,
  } = useOfflineVideoStore();

  // A registry entry exists from the FIRST segment onwards -- it is written progressively so
  // an interrupted download stays playable. Treating its mere presence as "downloaded" showed
  // a completed badge over a partial copy, which is how a 76-minute lesson could sit there
  // claiming to be saved with only 52 minutes on disk.
  const isDownloaded = isOfflineVideoComplete(registry[blockId]);
  const activeDownload = activeDownloads[blockId];
  const isDownloading = activeDownload?.status === 'downloading';
  const downloadProgress = activeDownload?.progress ?? 0;
  const downloadedBytes = activeDownload?.downloadedBytes ?? 0;
  const estimatedBytes = activeDownload?.totalBytes ?? 0;
  const downloadedSizeLabel = registry[blockId]?.totalBytes
    ? formatMegabytes(registry[blockId].totalBytes)
    : null;

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  const renderedMarkPosition = isFullscreen
    ? isLandscape
      ? {
        left: Math.max(12, Math.min(80, markPosition.left)),
        top: Math.max(12, Math.min(80, markPosition.top)),
      }
      : {
        left: Math.max(15, Math.min(75, markPosition.left)),
        top: 38 + (markPosition.top / 100) * 22,
      }
    : {
      left: Math.max(10, Math.min(75, markPosition.left)),
      top: Math.max(15, Math.min(70, markPosition.top)),
    };
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const token = useAuthStore(s => s.token);
  const userPhone = useAuthStore(s => s.user?.phone);
  const watermarkText = watermark ? extractWatermarkPhone(userPhone) : '';

  const videoRef = useRef<VideoRef>(null);
  const currentRangeRef = useRef<{ start: number; end: number } | null>(null);
  const lastSavedEndRef = useRef(0);
  const lastTimeRef = useRef(0);
  const watchedSegmentsRef = useRef<WatchSegment[]>([]);
  /** When the watched-percent was last recomputed; see handleProgress. */
  const lastPercentCalcRef = useRef(0);

  useEffect(() => {
    enableSecureScreen();
    return () => disableSecureScreen();
  }, []);

  // Hidden only in fullscreen. PiP shares the screen with the rest of the app (the lesson
  // is visible and scrollable behind it), so the status bar has no reason to disappear
  // there. This also sidesteps a race with React Navigation's own status-bar handling: this
  // effect used to hide it for the component's whole lifetime and restore it on unmount,
  // but if that unmount landed while a screen transition (e.g. navigating back while a PiP
  // video was still open) was resolving its own status-bar state, the two fought over the
  // final value and left a gap the height of the mismatch above the next screen's header.
  useEffect(() => {
    if (mode !== 'fullscreen') return;
    StatusBar.setHidden(true, 'fade');
    return () => StatusBar.setHidden(false, 'fade');
  }, [mode]);

  // Connectivity comes from the provider rather than a probe of our own: opening a video
  // while already known-offline should go straight to the local copy instead of burning a
  // request timeout first. The resolver stays stable (blockId only) so a connectivity flap
  // can never remount the <Video> mid-playback -- reads go through a ref, and recovery is
  // handled by the dedicated effect below.
  const {online} = useNetwork();
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const loadPlayback = useCallback(async () => {
    setManifestUrl(null);
    setError(false);
    setIsOfflineMode(false);

    const isOnline = onlineRef.current;

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
          setManifestUrl(`file://${cleanPath}`);
          if (hasCompleteCopy && localMeta.localSubtitlePath) {
            const cleanSub = localMeta.localSubtitlePath.replace('file://', '');
            const subExists = await ReactNativeBlobUtil.fs.exists(cleanSub).catch(() => false);
            if (subExists) {
              setSubtitleUrl(`file://${cleanSub}`);
            }
          }
          // Only a partial file needs the recorded length -- what's on disk is shorter than
          // the lesson, so the player's own reading of it is wrong by definition. A complete
          // file is the lesson itself: trust whatever it reports over a stored durationSec,
          // which can be stale (e.g. saved from an earlier, still-downloading state) and
          // would otherwise permanently undercut a fully downloaded video's timeline.
          cachedDurationRef.current = hasCompleteCopy ? null : localMeta.durationSec ?? null;
          setIsOfflineMode(true);
          return;
        }
      }
    }

    // Known-offline with nothing usable on disk: fail fast instead of waiting out a
    // request that cannot succeed.
    if (!isOnline) {
      setError(true);
      return;
    }

    // A partial local copy playing while the session request is still in flight beats
    // making the viewer stare at a spinner for the request's full timeout (axios: 15s) --
    // that request only mattered here to prove the app *isn't* actually offline, and a
    // stale NetworkProvider reading (e.g. right after launch, before its first probe lands)
    // was exactly what sent a truly offline viewer down this branch in the first place.
    // Playing the partial copy immediately does not skip the online attempt: it still runs
    // and, on success, replaces this with the full stream via setManifestUrl below.
    let playingPartialFallback = false;
    if (localMeta && localMeta.localManifestPath) {
      const cleanPath = localMeta.localManifestPath.replace('file://', '');
      const exists = await ReactNativeBlobUtil.fs.exists(cleanPath).catch(() => false);
      if (exists) {
        setManifestUrl(`file://${cleanPath}`);
        cachedDurationRef.current = isOfflineVideoComplete(localMeta)
          ? null
          : localMeta.durationSec ?? null;
        setIsOfflineMode(true);
        playingPartialFallback = true;
      }
    }

    try {
      // 2. Otherwise start online playback stream & background progressive caching
      //
      // Caching is kicked off by pressing play (see the play button), not on open. Running it
      // here too would download in the background while the badge still read "Yuklab olish",
      // since startAutoCacheVideo bypasses the store the badge renders from.
      const playback = await apiStartVideoPlayback(blockId);
      setManifestUrl(`${API_BASE}${playback.manifestUrl}`);
      setSubtitleUrl(playback.subtitleUrl);
      setIsOfflineMode(false);
    } catch {
      // The session call failed outright (server hiccup, captive portal, or truly no
      // network). The partial copy set above is already playing if there was one; only a
      // video with nothing at all on disk needs the error screen.
      if (!playingPartialFallback) {
        setError(true);
      }
    }
  }, [blockId]);

  useEffect(() => {
    void loadPlayback();
  }, [loadPlayback]);

  // A video that failed to resolve while offline should come back on its own once
  // connectivity returns, not sit on its retry button until the user notices. A video
  // playing from a partial local copy does not need this: loadPlayback already attempts
  // the online session every time it runs (see the partial-fallback branch above), so once
  // connectivity actually returns the *next* mount or retry picks it up on its own --
  // and NetInfo below fires promptly enough that this effect's job is really just the
  // error case, where nothing is playing yet.
  const wasOfflineRef = useRef(online);
  useEffect(() => {
    const cameBackOnline = online && !wasOfflineRef.current;
    wasOfflineRef.current = online;
    if (cameBackOnline && (error || isOfflineMode)) {
      void loadPlayback();
    }
  }, [online, error, isOfflineMode, loadPlayback]);

  // Robust Subtitle Fetching and Parsing (supports both local file:// and remote URLs)
  useEffect(() => {
    if (!subtitleUrl) {
      setSubtitleCues([]);
      return;
    }

    let cancelled = false;

    if (subtitleUrl.startsWith('file://')) {
      const rawPath = subtitleUrl.replace('file://', '');
      ReactNativeBlobUtil.fs
        .readFile(rawPath, 'utf8')
        .then(text => {
          if (!cancelled) {
            setSubtitleCues(parseSubtitles(text));
          }
        })
        .catch(err => {
          console.warn('Failed to read local subtitle:', err);
          if (!cancelled) setSubtitleCues([]);
        });
      return () => {
        cancelled = true;
      };
    }

    const fullUrl = subtitleUrl.startsWith('http') ? subtitleUrl : `${API_BASE}${subtitleUrl}`;
    const curToken = useAuthStore.getState().token;

    fetch(fullUrl)
      .then(res => {
        if (res.ok) return res.text();
        if (curToken) {
          return fetch(fullUrl, { headers: { Authorization: `Bearer ${curToken}` } }).then(r =>
            r.ok ? r.text() : Promise.reject(new Error('Subtitle error')),
          );
        }
        return Promise.reject(new Error('Subtitle fetch failed'));
      })
      .then(text => {
        if (cancelled) return;
        const cues = parseSubtitles(text);
        setSubtitleCues(cues);
      })
      .catch(err => {
        console.warn('Failed to load subtitles:', err);
        if (!cancelled) setSubtitleCues([]);
      });

    return () => {
      cancelled = true;
    };
  }, [subtitleUrl]);

  /**
   * Begins caching the lesson unless it is already cached or in flight. Reads the store
   * directly rather than the rendered flags so it stays correct when called from inside a
   * state updater, where those flags may be a render behind.
   */
  const cachedDurationRef = useRef<number | null>(null);

  const startDownloadIfNeeded = useCallback(() => {
    // iOS cannot play what the downloader writes (see DOWNLOADS_SUPPORTED), and a download
    // started while known-offline only fails a moment later with a "no network" alert.
    if (!DOWNLOADS_SUPPORTED || !onlineRef.current) {
      return;
    }
    const state = useOfflineVideoStore.getState();
    // A registry entry alone does not mean the video is cached -- a download interrupted at
    // segment 17 of 396 leaves one behind. Skipping on its mere presence stranded those
    // videos: the download never resumed and the badge sat frozen on its progress ring.
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
    }).then(result => {
      // Success needs no dialog -- the badge switches to its "downloaded" state. Only a
      // failure is worth interrupting for, and a cancellation is not a failure.
      if (!result) {
        const lastErr = useOfflineVideoStore.getState().activeDownloads[blockId]?.errorMessage;
        if (lastErr) {
          Alert.alert('Yuklab bo‘lmadi', lastErr);
        }
      }
    });
  }, [blockId, title, lessonId, lessonTitle, courseId, courseTitle, schoolId, startDownload]);

  // Caching follows PLAYBACK, not a download button -- this component starts playing the
  // moment it mounts (the poster tap already was the "play" action), so hanging the download
  // off a separate button meant a lesson could be watched with nothing saved, and going
  // offline afterwards showed "not cached" despite minutes of viewing.
  const cachingStartedRef = useRef(false);
  useEffect(() => {
    if (paused || cachingStartedRef.current) return;
    cachingStartedRef.current = true;
    startDownloadIfNeeded();
  }, [paused, startDownloadIfNeeded]);

  const handleDownloadPress = useCallback(() => {
    if (!DOWNLOADS_SUPPORTED) return;

    // Tapping a download in flight stops it immediately, the way the badge's stop-square
    // implies. Nothing is lost: the segments already written stay on disk and a later tap
    // resumes from there.
    if (isDownloading) {
      useOfflineVideoStore.getState().cancelDownload(blockId);
      return;
    }

    if (isDownloaded) {
      Alert.alert(
        'Yuklangan video',
        'Ushbu video internetsiz ko‘rish uchun xotirada saqlangan. Xotiradan o‘chirmoqchimisiz?',
        [
          { text: 'Yo‘q', style: 'cancel' },
          {
            text: 'O‘chirish',
            style: 'destructive',
            onPress: () => {
              void removeDownload(blockId);
            },
          },
        ],
      );
      return;
    }

    startDownloadIfNeeded();
  }, [
    isDownloading,
    isDownloaded,
    blockId,
    startDownloadIfNeeded,
    removeDownload,
  ]);

  useEffect(() => {
    let cancelled = false;
    apiGetWatchProgress(blockId)
      .then(data => {
        if (cancelled) return;
        setWatchedSegments(data.segments);
        setWatchedPercent(data.watchedPercent);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [blockId]);

  useEffect(() => {
    watchedSegmentsRef.current = watchedSegments;
  }, [watchedSegments]);

  useEffect(() => {
    if (!watermarkText) return undefined;
    let visibleTimer: ReturnType<typeof setTimeout> | undefined;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let moveTimer: ReturnType<typeof setTimeout> | undefined;

    const show = () => {
      setMarkVisible(true);
      visibleTimer = setTimeout(() => {
        setMarkVisible(false);
        moveTimer = setTimeout(() => {
          setMarkPosition(quietWatermarkPosition());
          hiddenTimer = setTimeout(show, 5000 + Math.random() * 3000);
        }, 800);
      }, 6000);
    };
    show();

    return () => {
      if (visibleTimer) clearTimeout(visibleTimer);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (moveTimer) clearTimeout(moveTimer);
    };
  }, [watermarkText]);

  const closeCurrentRange = useCallback(() => {
    const range = currentRangeRef.current;
    if (range && range.end > range.start && range.end > lastSavedEndRef.current) {
      const startSec = Math.floor(range.start);
      const endSec = Math.ceil(range.end);
      if (endSec > startSec) {
        // A partially cached copy is only as long as what was downloaded, so its duration
        // says nothing about the real lesson. Reporting it would tell the server a 57-minute
        // video is one minute long.
        const dur =
          !isOfflineMode && durationRef.current && durationRef.current > 0
            ? Math.round(durationRef.current)
            : undefined;
        apiSaveWatchProgress(blockId, startSec, endSec, dur)
          .then(data => {
            setWatchedPercent(data.watchedPercent);
            setWatchedSegments(data.segments);
          })
          .catch(() => { });
        lastSavedEndRef.current = range.end;
      }
    }
  }, [blockId]);

  useEffect(() => {
    durationRef.current = videoDuration;
  }, [videoDuration]);
  useEffect(() => {
    barWidthRef.current = barWidth;
  }, [barWidth]);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (paused) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
      return;
    }
    bumpControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [paused, bumpControls]);

  function seekTo(seconds: number) {
    const duration = durationRef.current ?? 0;
    const target = Math.max(0, Math.min(duration || seconds, seconds));
    videoRef.current?.seek(target);
    setCurrentTime(target);
    currentTimeRef.current = target;
    // The player keeps emitting the pre-seek position for a few ticks before it lands on the
    // new one. Without this the bar snaps back to where it was and only jumps forward again
    // seconds later, so progress reports are ignored until one arrives near the target.
    pendingSeekRef.current = target;
    seekStartedAtRef.current = Date.now();
  }

  // The scrub position tracks the finger 1:1 across the bar: tapping anywhere jumps there and
  // dragging follows directly, which is what a touch timeline is expected to do. The grant
  // position is kept so a drag stays anchored to where the finger landed.
  const grantScrubRef = useRef(0);
  const scrubResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const duration = durationRef.current ?? 0;
        const width = barWidthRef.current;
        if (!duration || !width) return;
        const at = Math.max(0, Math.min(duration, (e.nativeEvent.locationX / width) * duration));
        grantScrubRef.current = at;
        setIsScrubbing(true);
        setScrubTime(at);
      },
      onPanResponderMove: (_e, gesture) => {
        const duration = durationRef.current ?? 0;
        const width = barWidthRef.current;
        if (!duration || !width) return;
        const delta = (gesture.dx / width) * duration;
        setScrubTime(Math.max(0, Math.min(duration, grantScrubRef.current + delta)));
      },
      onPanResponderRelease: () => {
        setIsScrubbing(false);
        setScrubTime(current => {
          if (current !== null) seekTo(current);
          return null;
        });
      },
      onPanResponderTerminate: () => {
        setIsScrubbing(false);
        setScrubTime(null);
      },
    }),
  ).current;

  function skipBy(deltaSeconds: number) {
    seekTo(currentTimeRef.current + deltaSeconds);
    bumpControls();
  }

  function formatClock(seconds: number) {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function handleLoad(data: OnLoadData) {
    // A partially downloaded video is only as long as the segments on disk -- a 57-minute
    // lesson cached up to 1:04 opens as a 1:04 file. The duration recorded when caching
    // started is the lesson's real length, so it is what the timeline should show.
    const cached = cachedDurationRef.current;
    if (cached && cached > 0) {
      setVideoDuration(cached);
    } else if (!isNaN(data.duration) && isFinite(data.duration)) {
      setVideoDuration(data.duration);
    }
    const resumeAt = resumeTimeRef.current;
    if (resumeAt > 0) {
      videoRef.current?.seek(resumeAt);
      setCurrentTime(resumeAt);
      resumeTimeRef.current = 0;
    }
  }

  function handleProgress(data: OnProgressData) {
    const current = data.currentTime;

    // Drop the stale positions a seek leaves in its wake: the player reports where it still
    // is for a few ticks before it arrives, and honouring those rewinds the bar to the old
    // spot. Once a report lands near the target the seek is considered settled.
    const pendingSeek = pendingSeekRef.current;
    if (pendingSeek !== null) {
      const settled = Math.abs(current - pendingSeek) <= 1.5;
      // Give up waiting after a while so a seek the player silently refused (into an
      // unbuffered stretch, say) cannot freeze the bar for good.
      const timedOut = Date.now() - seekStartedAtRef.current > 4000;
      if (!settled && !timedOut) return;
      pendingSeekRef.current = null;
      lastTimeRef.current = current;
    }

    setCurrentTime(current);
    currentTimeRef.current = current;
    if (typeof data.playableDuration === 'number' && isFinite(data.playableDuration)) {
      setPlayableDuration(data.playableDuration);
    }
    // A gap only means the user seeked if it is bigger than normal playback could produce
    // between two progress ticks. At 2x each tick advances twice as far, so a fixed threshold
    // would read fast playback as a seek and chop the watched range into pieces.
    const jumpThreshold = Math.max(2, playbackRate * 2);
    const jumped = Math.abs(current - lastTimeRef.current) > jumpThreshold;
    lastTimeRef.current = current;

    if (jumped || !currentRangeRef.current) {
      closeCurrentRange();
      currentRangeRef.current = { start: current, end: current };
      lastSavedEndRef.current = 0;
    } else {
      currentRangeRef.current.end = current;
    }

    // The percentage is advisory UI (the progress modal recomputes its own from the
    // segments), and merging the ranges is a sort on every call -- running it on each
    // 500ms tick is pure waste on a low-end phone. Every 2s is plenty for a percent label.
    const inProgress = currentRangeRef.current;
    const liveSegment = { startSec: Math.floor(inProgress.start), endSec: Math.ceil(inProgress.end) };
    if (videoDuration && videoDuration > 0 && Date.now() - lastPercentCalcRef.current >= 2000) {
      lastPercentCalcRef.current = Date.now();
      const totalCovered = computeTotalWatchedSeconds(watchedSegmentsRef.current, liveSegment);
      setWatchedPercent(Math.min(100, Math.round((totalCovered / videoDuration) * 100)));
    }
  }

  useEffect(() => {
    return () => closeCurrentRange();
  }, [closeCurrentRange]);

  // Backgrounding the app does not unmount the player, so a watched range could otherwise
  // sit open for the whole background session before it is ever reported. Close (and thus
  // save) it as the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        closeCurrentRange();
      }
    });
    return () => sub.remove();
  }, [closeCurrentRange]);

  // Active Subtitle Cue
  const activeCue = captionsOn
    ? subtitleCues.find(cue => currentTime >= cue.start && currentTime <= cue.end)
    : null;

  const dynamicPercent =
    videoDuration !== null && videoDuration > 0
      ? Math.min(100, Math.round((computeTotalWatchedSeconds(watchedSegments, null) / videoDuration) * 100))
      : watchedPercent;

  const mediaSurface = (
    <>
      {error ? (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center p-6 bg-black z-30">
          <Text className="text-xs font-semibold text-white/90 mb-1 text-center">
            Internetga ulanmagansiz
          </Text>
          <Text className="text-[11px] text-white/50 mb-4 text-center">
            Ushbu video hali xotiraga keshlanmagan. Ko‘rish uchun internetni yoqing.
          </Text>
          <Pressable
            onPress={() => void loadPlayback()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 active:opacity-80">
            <Text className="text-xs font-bold text-white">Qayta urinish</Text>
          </Pressable>
        </View>
      ) : !manifestUrl ? (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center">
          <ActivityIndicator color="white" />
        </View>
      ) : (
        <Video
          ref={videoRef}
          source={
            manifestUrl.startsWith('file://')
              ? { uri: manifestUrl }
              : { uri: manifestUrl, headers: token ? { Authorization: `Bearer ${token}` } : undefined }
          }
          style={StyleSheet.absoluteFill}
          paused={paused}
          rate={playbackRate}
          resizeMode="contain"
          // 250ms re-rendered this (large) component four times a second throughout playback,
          // which costs real smoothness on a low-end phone. 500ms still updates the clock
          // often enough to look continuous, since it only displays whole seconds.
          progressUpdateInterval={500}
          preventsDisplaySleepDuringVideoPlayback
          ignoreSilentSwitch="ignore"
          // Keep audio running when the screen locks or the user switches apps, so a lesson
          // can be listened to like a podcast instead of stopping dead.
          playInBackground
          playWhenInactive
          // Required for playInBackground to survive on iOS, and drives the lock-screen
          // controls Android shows for background audio.
          showNotificationControls
          bufferConfig={{
            minBufferMs: 15000,
            maxBufferMs: 50000,
            // How much must buffer before playback STARTS. 2.5s was tuned for stability, but
            // it is time the student spends staring at a still frame every single time. 1s is
            // enough to begin; minBufferMs still governs how far ahead it keeps reading.
            bufferForPlaybackMs: 1000,
            // After a stall, buffering a little more before resuming avoids stuttering
            // straight back into the same gap.
            bufferForPlaybackAfterRebufferMs: 2500,
          }}
          onBuffer={({ isBuffering: buffering }) => setIsBuffering(buffering)}
          onLoad={handleLoad}
          onProgress={handleProgress}
          onError={() => {
            if (isOfflineMode) {
              // Try online fallback if network allows
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
        />
      )}

      {/* Smooth buffering spinner */}
      {isBuffering && !paused ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
          <ActivityIndicator color="white" size="small" />
        </View>
      ) : null}

      {/* Watermark, always rendered above every other layer (zIndex 30 beats the controls'
          25): one that vanishes whenever controls appear is trivially dodged by keeping a
          thumb on the screen. Its position zones sit clear of the button rows, so it reads
          as deliberate rather than as a glitch. */}
      {watermarkText ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${renderedMarkPosition.left}%`,
            top: `${renderedMarkPosition.top}%`,
            opacity: markVisible ? 1 : 0,
            zIndex: 30,
          }}>
          <Text className="text-[10px] font-bold tracking-wide text-white/70 shadow-sm">{watermarkText}</Text>
        </View>
      ) : null}

      {/* Custom Native-Style Subtitle Overlay */}
      {captionsOn && activeCue ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: controlsVisible
              ? (isFullscreen ? Math.max(75, insets.bottom + 65) : 44)
              : (isFullscreen ? Math.max(25, insets.bottom + 12) : 6),
            left: isFullscreen ? Math.max(24, insets.left + 16) : 12,
            right: isFullscreen ? Math.max(24, insets.right + 16) : 12,
            alignItems: 'center',
            zIndex: 25,
          }}>
          <View className="rounded-md bg-black/80 px-2.5 py-1 shadow-md border border-white/10">
            <Text className="text-center text-[11px] sm:text-[13px] font-medium text-white leading-4">
              {activeCue.text}
            </Text>
          </View>
        </View>
      ) : null}

      {/* PiP is just the bare video -- no controls fit usefully in a 160x90dp box, and the
          whole box instead acts as a single "tap to expand" target (see the PiP Pressable
          wrapping this component in the return statement below). */}
      {manifestUrl && !error && isFullscreen ? (
        <>
          {/* Tap anywhere to reveal the controls (or hide them again). */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (controlsVisible ? setControlsVisible(false) : bumpControls())}
          />

          {/* Offline-download badge, top left. Deliberately outside the controlsVisible
              block: a download runs for minutes and its progress should stay readable while
              the video plays, not vanish with the controls. Android only -- iOS cannot play
              what the downloader writes, so a badge there would just sell dead storage. */}
          {DOWNLOADS_SUPPORTED ? (
          <View
            style={{
              position: 'absolute',
              top: isFullscreen ? Math.max(16, insets.top + 8) : 12,
              left: isFullscreen ? Math.max(20, insets.left + 12) : 12,
              zIndex: 25,
            }}>
            <Pressable
              onPress={handleDownloadPress}
              className="flex-row items-center gap-2 rounded-2xl bg-black/60 px-2.5 py-2 active:opacity-80">
              {isDownloading ? (
                <View className="h-7 w-7 items-center justify-center">
                  {/* Ring of progress with a stop square inside, so one tap-target both
                      reports state and cancels. */}
                  <Svg width={28} height={28} style={{position: 'absolute'}}>
                    <Circle
                      cx={14}
                      cy={14}
                      r={12}
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth={2}
                      fill="none"
                    />
                    <Circle
                      cx={14}
                      cy={14}
                      r={12}
                      stroke="#fff"
                      strokeWidth={2}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 12}
                      strokeDashoffset={2 * Math.PI * 12 * (1 - downloadProgress / 100)}
                      transform="rotate(-90 14 14)"
                    />
                  </Svg>
                  <View className="h-2.5 w-2.5 rounded-[2px] bg-white" />
                </View>
              ) : isDownloaded ? (
                <Check size={20} color="#fff" />
              ) : (
                <DownloadCloud size={20} color="#fff" />
              )}

              <Text className="text-xs font-semibold text-white">
                {isDownloading
                  ? estimatedBytes > 0
                    ? `${formatMegabytes(downloadedBytes)} / ${formatMegabytes(estimatedBytes)}`
                    : `${downloadProgress}%`
                  : isDownloaded
                    ? (downloadedSizeLabel ?? 'Yuklangan')
                    : 'Yuklab olish'}
              </Text>
            </Pressable>
          </View>
          ) : null}

          {/* Buffering (e.g. right after a play press, before the first frame lands) shows only
              the spinner above -- surfacing play/pause/the timeline over a still-black video
              reads as broken controls for a video that isn't there yet. */}
          {controlsVisible && !(isBuffering && !paused) ? (
            <>
              {/* Scrim behind the controls: white text and a white thumb disappear over bright
                  footage (a scanned page, a slide). A smooth SVG gradient does this without the
                  banding that stacked opaque views produce. */}
              <Svg
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, zIndex: 5 }}
                width="100%"
                height="100%">
                <Defs>
                  <SvgLinearGradient id="playerScrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#000" stopOpacity="0.45" />
                    <Stop offset="0.28" stopColor="#000" stopOpacity="0.18" />
                    <Stop offset="0.62" stopColor="#000" stopOpacity="0.22" />
                    <Stop offset="1" stopColor="#000" stopOpacity="0.72" />
                  </SvgLinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#playerScrim)" />
              </Svg>

              {/* Top Right Action Bar */}
              <View
                style={{
                  position: 'absolute',
                  top: isFullscreen ? Math.max(16, insets.top + 8) : 12,
                  right: isFullscreen ? Math.max(20, insets.right + 12) : 12,
                  zIndex: 20,
                  flexDirection: 'row',
                  gap: 8,
                }}>
                {/* PiP toggle: shrinks the video to a draggable box without unmounting it. */}
                <Pressable
                  onPress={() => setMode(m => (m === 'fullscreen' ? 'pip' : 'fullscreen'))}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-black/75">
                  {isFullscreen ? <Minimize2 size={16} color="white" /> : <Maximize2 size={16} color="white" />}
                </Pressable>
                <Pressable
                  onPress={onClose}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-black/75">
                  <X size={16} color="white" />
                </Pressable>
              </View>

              <View className="absolute inset-0 z-10 flex-row items-center justify-center gap-8">
                <Pressable
                  onPress={() => skipBy(-10)}
                  className="h-11 w-11 items-center justify-center rounded-full bg-black/75">
                  <RotateCcw size={20} color="white" />
                  <Text className="absolute text-[8px] font-bold text-white">10</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const wasPaused = paused;
                    setPaused(!wasPaused);
                    bumpControls();
                  }}
                  className="h-14 w-14 items-center justify-center rounded-full bg-black/80">
                  {paused ? (
                    <Play size={26} color="white" fill="white" />
                  ) : (
                    <Pause size={26} color="white" fill="white" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => skipBy(10)}
                  className="h-11 w-11 items-center justify-center rounded-full bg-black/75">
                  <RotateCw size={20} color="white" />
                  <Text className="absolute text-[8px] font-bold text-white">10</Text>
                </Pressable>
              </View>

              {/* Compact Bottom Timeline Bar */}
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingLeft: isFullscreen ? Math.max(20, insets.left + 12) : 12,
                  paddingRight: isFullscreen ? Math.max(20, insets.right + 12) : 12,
                  paddingBottom: isFullscreen ? Math.max(16, insets.bottom + 8) : 12,
                  paddingTop: 8,
                  zIndex: 20,
                }}>
                {/* Buttons sit on their own row above the clock so they cannot collide with
                    the timestamps in a short player, where everything is cramped vertically.
                    Not font-mono for the clock: the monospace face renders thin and washed
                    out on Android and barely responds to a bold weight. */}
                <View className="mb-1 flex-row items-center justify-end gap-2 pr-0.5">
                  {/* Playback speed: cycles through the usual lesson-watching rates. */}
                  <Pressable
                    onPress={() => {
                      setPlaybackRate(current => {
                        const next = PLAYBACK_RATES[
                          (PLAYBACK_RATES.indexOf(current) + 1) % PLAYBACK_RATES.length
                        ];
                        return next;
                      });
                      bumpControls();
                    }}
                    className={`h-7 items-center justify-center rounded-md px-2 ${playbackRate === 1 ? 'bg-black/70' : 'bg-indigo-600'
                      }`}>
                    <Text className="text-[11px] font-bold text-white">{playbackRate}x</Text>
                  </Pressable>

                  {/* Subtitle Icon Button */}
                  {subtitleUrl ? (
                    <Pressable
                      onPress={() => setCaptionsOn(v => !v)}
                      className={`h-7 w-7 items-center justify-center rounded-md ${captionsOn ? 'bg-indigo-600' : 'bg-black/70'
                        }`}>
                      <Captions size={14} color="#fff" />
                    </Pressable>
                  ) : null}
                </View>

                <View className="flex-row items-center justify-between pr-0.5">
                  <Text
                    className="text-sm font-bold text-white"
                    style={{ fontVariant: ['tabular-nums'] }}>
                    {formatClock(scrubTime ?? currentTime)}
                  </Text>
                  <Text
                    className="text-sm font-bold text-white/85"
                    style={{ fontVariant: ['tabular-nums'] }}>
                    {formatClock(videoDuration ?? 0)}
                  </Text>
                </View>

                {/* Timeline: a thick, easy-to-hit bar with three stacked layers -- the dim
                    track, the lighter buffered-ahead portion, and the played portion. The
                    touch target is taller than the bar itself so the thumb stays grabbable. */}
                <View
                  className="justify-center"
                  style={{ height: 28 }}
                  onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
                  {...scrubResponder.panHandlers}>
                  {/* The unplayed track is darkened rather than lightened so the bar reads as
                      a groove over bright footage instead of vanishing into it. */}
                  <View
                    className="w-full overflow-hidden rounded-full"
                    style={{ height: isScrubbing ? 8 : 6, backgroundColor: 'rgba(0,0,0,0.45)' }}>
                    <View
                      className="absolute left-0 top-0 h-full rounded-full bg-white/50"
                      style={{
                        width: videoDuration
                          ? `${Math.min(100, (playableDuration / videoDuration) * 100)}%`
                          : '0%',
                      }}
                    />
                    <View
                      className="absolute left-0 top-0 h-full rounded-full bg-white"
                      style={{
                        width: videoDuration
                          ? `${Math.min(100, ((scrubTime ?? currentTime) / videoDuration) * 100)}%`
                          : '0%',
                      }}
                    />
                  </View>
                  <View
                    pointerEvents="none"
                    className="absolute rounded-full bg-white"
                    style={{
                      height: isScrubbing ? 18 : 14,
                      width: isScrubbing ? 18 : 14,
                      // A dark ring keeps the white thumb visible against white footage,
                      // where a shadow alone washes out.
                      borderWidth: 1.5,
                      borderColor: 'rgba(0,0,0,0.45)',
                      shadowColor: '#000',
                      shadowOpacity: 0.45,
                      shadowRadius: 3,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: 4,
                      left: videoDuration
                        ? Math.max(
                          0,
                          Math.min(
                            barWidth - (isScrubbing ? 18 : 14),
                            ((scrubTime ?? currentTime) / videoDuration) * barWidth -
                            (isScrubbing ? 9 : 7),
                          ),
                        )
                        : 0,
                    }}
                  />
                </View>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );

  const pipStyle = {
    transform: pipPan.getTranslateTransform(),
  };

  return (
    // Not a Modal: a Modal is a separate native window, and touches never reach whatever
    // sits behind a separate native window -- PiP's whole point is that the lesson stays
    // usable (scrollable) behind the small video box, which only works when both are the
    // same window. CourseScreen renders this directly (position: absolute, high zIndex)
    // alongside the lesson's own ScrollView instead.
    //
    // A single, always-mounted <Video> (inside mediaSurface): switching mode used to pick
    // between two separate JSX branches, each rendering mediaSurface under a different
    // parent chain -- React treated that as a different component and remounted <Video> on
    // every fullscreen<->PiP transition (observed: playback jumping back to 0:00). The tree
    // here never branches; only the wrapping Animated.View's style/handlers, and which
    // control overlay renders alongside it, change with mode.
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'black', opacity: mode === 'fullscreen' ? dismissOpacity : 0 },
        ]}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View
          {...(mode === 'fullscreen' ? dismissResponder.panHandlers : pipPanResponder.panHandlers)}
          style={
            mode === 'fullscreen'
              ? [
                  StyleSheet.absoluteFill,
                  { opacity: dismissOpacity, transform: [{ translateY: dismissDrag }] },
                ]
              : [
                  {
                    position: 'absolute',
                    width: pipSize.width,
                    height: pipSize.height,
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: 'black',
                    elevation: 8,
                    shadowColor: '#000',
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                  },
                  pipStyle,
                ]
          }>
          {mediaSurface}
          {mode === 'pip' && (
            <>
              {/* Expand back to fullscreen. A dedicated tap target rather than the whole
                  box, so dragging (the PanResponder above) and expanding don't fight over
                  the same gesture. */}
              <Pressable
                onPress={() => setMode('fullscreen')}
                style={{ position: 'absolute', top: 4, right: 4, zIndex: 10 }}
                className="h-7 w-7 items-center justify-center rounded-md bg-black/70">
                <Maximize2 size={14} color="white" />
              </Pressable>
              {/* Compact transport: play/pause and +/-5s, the minimum a viewer needs
                  without the full control bar (timeline/speed/subtitles/download), which
                  don't fit usefully at this size. Sized to just wrap its buttons (not
                  absolute inset-0) so it only occupies the middle of the box -- covering
                  the full box with a "box-none" View still intercepted drags meant for the
                  PanResponder on the box itself, even over the transparent gaps between
                  buttons. */}
              <View
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: [{ translateX: -60 }, { translateY: -20 }],
                }}
                className="flex-row items-center justify-center gap-3">
                <Pressable
                  onPress={() => skipBy(-5)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-black/60">
                  <RotateCcw size={15} color="white" />
                </Pressable>
                <Pressable
                  onPress={() => setPaused(!paused)}
                  className="h-10 w-10 items-center justify-center rounded-full bg-black/70">
                  {paused ? (
                    <Play size={18} color="white" fill="white" />
                  ) : (
                    <Pause size={18} color="white" fill="white" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => skipBy(5)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-black/60">
                  <RotateCw size={15} color="white" />
                </Pressable>
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </>
  );
}
