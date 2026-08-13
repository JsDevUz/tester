import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Video, {type OnLoadData, type OnProgressData, type VideoRef} from 'react-native-video';
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';
import {apiGetWatchProgress, apiSaveWatchProgress, apiStartVideoPlayback, type WatchSegment} from '../api/videos';
import {API_URL} from '../config/env';
import {disableSecureScreen, enableSecureScreen} from '../lib/secureScreen';
import {useAuthStore} from '../store/authStore';

// playback.manifestUrl is API-relative (/videos/:id/manifest.m3u8?token=...),
// so it must be appended to the full API base - stripping /api/v1 here made
// ExoPlayer fetch the SPA's HTML shell instead of the playlist, which then
// failed with "Input does not start with the #EXTM3U header".
const API_BASE = API_URL.replace(/\/$/, '');

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// React Native has no global btoa - this mirrors apps/frontend's
// extractWatermarkPhone(), which base64-encodes the phone (minus the 998
// country code) so the on-screen mark isn't plainly readable at a glance.
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

function quietWatermarkPosition() {
  const leftZones = [14 + Math.random() * 14, 72 + Math.random() * 14];
  const topZones = [18 + Math.random() * 12, 68 + Math.random() * 14];
  return {
    left: leftZones[Math.floor(Math.random() * leftZones.length)],
    top: topZones[Math.floor(Math.random() * topZones.length)],
  };
}

export function HlsVideoPlayer({blockId, watermark = true}: {blockId: string; watermark?: boolean}) {
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [markVisible, setMarkVisible] = useState(false);
  const [markPosition, setMarkPosition] = useState(() => quietWatermarkPosition());
  const [watchedSegments, setWatchedSegments] = useState<WatchSegment[]>([]);
  const [watchedPercent, setWatchedPercent] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [barWidth, setBarWidth] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef<number | null>(null);
  const barWidthRef = useRef(0);
  const currentTimeRef = useRef(0);
  const resumeTimeRef = useRef(0);
  const [progressOpen, setProgressOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  // resizeMode="contain" letterboxes the picture in portrait fullscreen mode.
  // Map percentages strictly into the active video frame (38% to 60% of screen height)
  // so the watermark text is always INSIDE the video picture, never in the black bars outside.
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
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';
  const token = useAuthStore(s => s.token);
  const userPhone = useAuthStore(s => s.user?.phone);
  const watermarkText = watermark ? extractWatermarkPhone(userPhone) : '';

  const videoRef = useRef<VideoRef>(null);
  const currentRangeRef = useRef<{start: number; end: number} | null>(null);
  const lastSavedEndRef = useRef(0);
  const lastTimeRef = useRef(0);
  const watchedSegmentsRef = useRef<WatchSegment[]>([]);

  useEffect(() => {
    enableSecureScreen();
    return () => disableSecureScreen();
  }, []);

  useEffect(() => {
    StatusBar.setHidden(isFullscreen);
    return () => StatusBar.setHidden(false);
  }, [isFullscreen]);

  useEffect(() => {
    let cancelled = false;
    setManifestUrl(null);
    setError(false);
    apiStartVideoPlayback(blockId)
      .then(playback => {
        if (!cancelled) setManifestUrl(`${API_BASE}${playback.manifestUrl}`);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [blockId]);

  useEffect(() => {
    let cancelled = false;
    apiGetWatchProgress(blockId)
      .then(data => {
        if (cancelled) return;
        setWatchedSegments(data.segments);
        setWatchedPercent(data.watchedPercent);
      })
      .catch(() => {});
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
      void apiSaveWatchProgress(blockId, Math.floor(range.start), Math.floor(range.end)).then(data => {
        setWatchedPercent(data.watchedPercent);
        setWatchedSegments(data.segments);
      });
      lastSavedEndRef.current = range.end;
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

  // Controls fade out while playing, and stay put while paused or scrubbing.
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
  }

  const scrubResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const duration = durationRef.current ?? 0;
        const width = barWidthRef.current;
        if (!duration || !width) return;
        setScrubTime(Math.max(0, Math.min(duration, (e.nativeEvent.locationX / width) * duration)));
      },
      onPanResponderMove: (_e, gesture) => {
        const duration = durationRef.current ?? 0;
        const width = barWidthRef.current;
        if (!duration || !width) return;
        setScrubTime(current => {
          const base = current ?? 0;
          const delta = (gesture.dx / width) * duration;
          return Math.max(0, Math.min(duration, base + delta * 0.06));
        });
      },
      onPanResponderRelease: () => {
        setScrubTime(current => {
          if (current !== null) seekTo(current);
          return null;
        });
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
    if (!isNaN(data.duration) && isFinite(data.duration)) setVideoDuration(data.duration);
    // Toggling fullscreen moves <Video> between the inline container and the
    // Modal, which remounts it and restarts playback from 0 - seek back to
    // where the viewer actually was.
    const resumeAt = resumeTimeRef.current;
    if (resumeAt > 0) {
      videoRef.current?.seek(resumeAt);
      setCurrentTime(resumeAt);
      resumeTimeRef.current = 0;
    }
  }

  function handleProgress(data: OnProgressData) {
    const current = data.currentTime;
    setCurrentTime(current);
    currentTimeRef.current = current;
    const jumped = Math.abs(current - lastTimeRef.current) > 2;
    lastTimeRef.current = current;

    if (jumped || !currentRangeRef.current) {
      closeCurrentRange();
      currentRangeRef.current = {start: current, end: current};
      lastSavedEndRef.current = 0;
    } else {
      currentRangeRef.current.end = current;
    }

    const inProgress = currentRangeRef.current;
    const liveSegment = {startSec: Math.floor(inProgress.start), endSec: Math.ceil(inProgress.end)};
    if (videoDuration) {
      const nonOverlapping = watchedSegmentsRef.current.filter(
        s => s.endSec < liveSegment.startSec - 2 || s.startSec > liveSegment.endSec + 2,
      );
      const totalCovered =
        nonOverlapping.reduce((sum, s) => sum + (s.endSec - s.startSec), 0) +
        (liveSegment.endSec - liveSegment.startSec);
      setWatchedPercent(Math.min(100, Math.round((totalCovered / videoDuration) * 100)));
    }
  }

  useEffect(() => {
    return () => closeCurrentRange();
  }, [closeCurrentRange]);

  // position:'absolute' resolves against the enclosing ScrollView, not the
  // screen, so fullscreen used to stay boxed inside the lesson content. A
  // Modal gives a real screen-level surface; the same <Video> element is
  // moved into it so playback isn't restarted on toggle.
  const fullscreenFillStyle = {
    width: windowWidth,
    height: windowHeight,
    backgroundColor: 'black',
  } as const;

  const mediaSurface = (
    <>
        {error ? (
          <View style={StyleSheet.absoluteFill} className="items-center justify-center">
            <Text className="text-xs font-semibold text-white/70">Video hozircha ochilmadi</Text>
          </View>
        ) : !manifestUrl ? (
          <View style={StyleSheet.absoluteFill} className="items-center justify-center">
            <ActivityIndicator color="white" />
          </View>
        ) : (
          <Video
            ref={videoRef}
            source={{uri: manifestUrl, headers: token ? {Authorization: `Bearer ${token}`} : undefined}}
            style={StyleSheet.absoluteFill}
            paused={paused}
            resizeMode="contain"
            onLoad={handleLoad}
            onProgress={handleProgress}
            onEnd={() => {
              closeCurrentRange();
              setPaused(true);
            }}
          />
        )}
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
      {manifestUrl && !error ? (
        <>
          {/* Tap anywhere to reveal the controls (or hide them again). */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (controlsVisible ? setControlsVisible(false) : bumpControls())}
          />

          {controlsVisible ? (
            <>
              <Pressable
                onPress={() => {
                  resumeTimeRef.current = currentTimeRef.current;
                  setIsFullscreen(v => !v);
                }}
                className="absolute right-3 top-3 z-20 h-9 w-9 items-center justify-center rounded-full bg-black/45">
                {isFullscreen ? <Minimize2 size={17} color="white" /> : <Maximize2 size={17} color="white" />}
              </Pressable>

              <View className="absolute inset-0 z-10 flex-row items-center justify-center gap-8">
                <Pressable
                  onPress={() => skipBy(-5)}
                  className="h-12 w-12 items-center justify-center rounded-full bg-black/50">
                  <RotateCcw size={20} color="white" />
                  <Text className="absolute text-[8px] font-bold text-white">5</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPaused(value => !value);
                    bumpControls();
                  }}
                  className="h-16 w-16 items-center justify-center rounded-full bg-black/50">
                  {paused ? (
                    <Play size={28} color="white" fill="white" />
                  ) : (
                    <Pause size={28} color="white" fill="white" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => skipBy(5)}
                  className="h-12 w-12 items-center justify-center rounded-full bg-black/50">
                  <RotateCw size={20} color="white" />
                  <Text className="absolute text-[8px] font-bold text-white">5</Text>
                </Pressable>
              </View>

              <View className="absolute inset-x-0 bottom-0 z-20 bg-black/55 px-3 pb-3 pt-3">
                <View className="flex-row items-center gap-3">
                  <Text className="font-mono text-[11px] text-white">
                    {formatClock(scrubTime ?? currentTime)}
                  </Text>
                  <View
                    className="h-8 flex-1 justify-center"
                    onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
                    {...scrubResponder.panHandlers}>
                    <View className="h-1 w-full overflow-hidden rounded-full bg-white/25">
                      <View
                        className="h-full rounded-full bg-white"
                        style={{
                          width: videoDuration
                            ? `${Math.min(100, ((scrubTime ?? currentTime) / videoDuration) * 100)}%`
                            : '0%',
                        }}
                      />
                    </View>
                    <View
                      pointerEvents="none"
                      className="absolute h-3 w-3 rounded-full bg-white"
                      style={{
                        left: videoDuration
                          ? Math.max(
                              0,
                              Math.min(barWidth - 12, ((scrubTime ?? currentTime) / videoDuration) * barWidth - 6),
                            )
                          : 0,
                      }}
                    />
                  </View>
                  <Text className="font-mono text-[11px] text-white/70">
                    {formatClock(videoDuration ?? 0)}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <View>
      {isFullscreen ? (
        <Modal
          visible
          transparent={false}
          statusBarTranslucent
          supportedOrientations={['portrait', 'landscape']}
          onRequestClose={() => setIsFullscreen(false)}>
          <View style={fullscreenFillStyle}>{mediaSurface}</View>
        </Modal>
      ) : (
        <View className="mt-3 aspect-video w-full overflow-hidden rounded-2xl bg-black">
          {mediaSurface}
        </View>
      )}
      {!isFullscreen && videoDuration !== null && videoDuration > 0 && (
        <View className="mt-2">
          <Pressable onPress={() => setProgressOpen(v => !v)} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              <Text className="text-xs font-medium text-slate-500 dark:text-dark-muted">
                Mening video ko'rishim
              </Text>
              {progressOpen ? (
                <ChevronUp size={14} color={isDark ? '#a4a7b2' : '#64748b'} />
              ) : (
                <ChevronDown size={14} color={isDark ? '#a4a7b2' : '#64748b'} />
              )}
            </View>
            {watchedPercent !== null && (
              <Text className="text-xs font-medium text-slate-500 dark:text-dark-muted">
                {watchedPercent}% ko'rilgan
              </Text>
            )}
          </Pressable>
          {progressOpen && (
            <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-dark-surface-2">
              {watchedSegments.map(seg => (
                <View
                  key={`${seg.startSec}-${seg.endSec}`}
                  className="absolute h-full rounded-full bg-brand"
                  style={{
                    left: `${(seg.startSec / videoDuration) * 100}%`,
                    width: `${((seg.endSec - seg.startSec) / videoDuration) * 100}%`,
                  }}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
