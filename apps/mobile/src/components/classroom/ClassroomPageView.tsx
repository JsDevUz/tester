import React, { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { ClassroomStrokeCanvas } from './ClassroomStrokeCanvas';
import { ClassroomNotebookBackground } from './ClassroomNotebookBackground';
import type { CsNotebookStyle, CsPointer, CsStroke } from '../../types/classroom';

import { WEB_URL } from '../../config/env';

// Matches PDF_RENDER_WIDTH=1600 from backend; fallback aspect ratio.
const DEFAULT_PDF_ASPECT_RATIO = 1600 / 2263;
// A4 notebook aspect ratio matching web (210 / 297 = 0.707)
const NOTEBOOK_ASPECT_RATIO = 210 / 297;

export const aspectCache: Record<string, number> = {};
let lastKnownDocAspectRatio: number = DEFAULT_PDF_ASPECT_RATIO;

export function getCachedDocAspectRatio(): number {
  return lastKnownDocAspectRatio;
}

export function setCachedDocAspectRatio(ratio: number) {
  if (ratio > 0 && Number.isFinite(ratio)) {
    lastKnownDocAspectRatio = ratio;
  }
}

function resolvePageUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  if (
    rawUrl.startsWith('http://') ||
    rawUrl.startsWith('https://') ||
    rawUrl.startsWith('file://') ||
    rawUrl.startsWith('data:')
  ) {
    if (Platform.OS === 'android' && (rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1'))) {
      return rawUrl.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
    }
    return rawUrl;
  }
  const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${WEB_URL}${cleanPath}`;
}

export function ClassroomPageView({
  pageUrl,
  boardMode,
  notebookStyle,
  theme = 'light',
  strokes,
  pointer,
  customWidth,
}: {
  pageUrl: string | null;
  boardMode: 'pdf' | 'notebook';
  notebookStyle: CsNotebookStyle;
  theme?: 'light' | 'dark';
  strokes: CsStroke[];
  pageIndex: number;
  pointer?: CsPointer | null;
  customWidth?: number;
}) {
  const fullPageUrl = React.useMemo(() => resolvePageUrl(pageUrl), [pageUrl]);

  const [aspectRatio, setAspectRatio] = useState<number>(() => {
    if (boardMode === 'notebook') return NOTEBOOK_ASPECT_RATIO;
    if (fullPageUrl && aspectCache[fullPageUrl]) return aspectCache[fullPageUrl];
    return lastKnownDocAspectRatio || DEFAULT_PDF_ASPECT_RATIO;
  });
  const safeAspectRatio = aspectRatio > 0 && Number.isFinite(aspectRatio) ? aspectRatio : DEFAULT_PDF_ASPECT_RATIO;
  const computedWidth = customWidth ?? 0;
  const computedHeight = computedWidth > 0 ? computedWidth / safeAspectRatio : 0;
  const size = { width: computedWidth, height: computedHeight };

  const [retryKey, setRetryKey] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const retryCountRef = React.useRef(0);

  useEffect(() => {
    retryCountRef.current = 0;
    setLoadFailed(false);
  }, [fullPageUrl]);

  const handleImageError = useCallback(() => {
    if (retryCountRef.current >= 8) {
      setLoadFailed(true);
      return;
    }
    retryCountRef.current += 1;
    const delay = Math.min(800 * 2 ** retryCountRef.current, 6000);
    setTimeout(() => {
      setRetryKey(k => k + 1);
    }, delay);
  }, []);

  const handleImageDimension = useCallback((w: number, h: number) => {
    if (w > 0 && h > 0) {
      const ratio = w / h;
      if (fullPageUrl) aspectCache[fullPageUrl] = ratio;
      setCachedDocAspectRatio(ratio);
      setAspectRatio(ratio);
    }
  }, [fullPageUrl]);

  useEffect(() => {
    if (boardMode !== 'pdf' || !fullPageUrl) return;
    if (aspectCache[fullPageUrl]) {
      setAspectRatio(aspectCache[fullPageUrl]);
      return;
    }
    let cancelled = false;
    Image.getSize(
      fullPageUrl,
      (w, h) => {
        if (!cancelled) handleImageDimension(w, h);
      },
      () => { },
    );
    return () => {
      cancelled = true;
    };
  }, [boardMode, fullPageUrl, handleImageDimension]);

  const isDark = theme === 'dark';
  const cardBg = boardMode === 'pdf' ? '#ffffff' : (isDark ? '#232733' : '#ffffff');

  return (
    <View
      style={{
        width: customWidth ? customWidth : '100%',
        maxWidth: customWidth ? undefined : 800,
        alignSelf: 'center',
        aspectRatio: safeAspectRatio,
        backgroundColor: cardBg,
        borderRadius: 4,
        overflow: 'hidden',
      }}>
      {boardMode === 'pdf' && fullPageUrl ? (
        <>
          <Image
            key={retryKey}
            source={{ uri: fullPageUrl }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
            onLoad={e => {
              setLoadFailed(false);
              const src = e.nativeEvent.source;
              if (src && src.width > 0 && src.height > 0) {
                handleImageDimension(src.width, src.height);
              }
            }}
            onError={handleImageError}
          />
          {loadFailed && (
            <Pressable
              onPress={() => {
                retryCountRef.current = 0;
                setLoadFailed(false);
                setRetryKey(k => k + 1);
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.03)',
                gap: 8,
              }}>
              <RefreshCw size={22} color="#9ca3af" />
              <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>
                Sahifani qayta yuklash
              </Text>
            </Pressable>
          )}
        </>
      ) : boardMode === 'notebook' ? (
        <ClassroomNotebookBackground
          width={size.width}
          height={size.height}
          style={notebookStyle}
          theme={theme}
        />
      ) : null}
      <ClassroomStrokeCanvas strokes={strokes} width={size.width} height={size.height} pointer={pointer} />
    </View>
  );
}
