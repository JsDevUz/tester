import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Linking, Modal, NativeModules, Pressable, Text, useWindowDimensions, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {Download, ExternalLink, X} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';

const SPRING = {damping: 22, stiffness: 260, mass: 0.7};

let PdfComponent: any = null;
let RNBlobUtilModule: any = null;
let isNativePdfAvailable = false;

try {
  if (NativeModules.ReactNativeBlobUtil) {
    RNBlobUtilModule = require('react-native-blob-util').default || require('react-native-blob-util');
    PdfComponent = require('react-native-pdf').default || require('react-native-pdf');
    isNativePdfAvailable = true;
  }
} catch (e) {
  console.warn('Native PDF module unavailable:', e);
}

// react-native-pdf always downloads remote sources through react-native-blob-util's
// native streaming fetch, which truncates large responses from this CDN (observed
// cutting off at exactly 8192 bytes, silently, with no Content-Length check firing).
// Downloading via RN's own fetch + writing base64 ourselves sidesteps that bug, and
// persisting to DocumentDir (not CacheDir) means a once-opened PDF stays available
// offline instead of being evicted like a cache entry.
function hashUri(uri: string): string {
  let hash = 0;
  for (let i = 0; i < uri.length; i++) {
    hash = (hash * 31 + uri.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

async function ensureLocalPdf(uri: string): Promise<string> {
  if (!RNBlobUtilModule || !RNBlobUtilModule.fs) {
    throw new Error('RNBlobUtil native module is not available');
  }
  const localPath = `${RNBlobUtilModule.fs.dirs.DocumentDir}/pdf-${hashUri(uri)}.pdf`;
  const exists = await RNBlobUtilModule.fs.exists(localPath);
  if (exists) {
    const stats = await RNBlobUtilModule.fs.stat(localPath);
    if (Number(stats.size) > 0) return localPath;
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  await RNBlobUtilModule.fs.writeFile(localPath, base64, 'base64');
  return localPath;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    result += b1 === undefined ? '=' : chars[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    result += b2 === undefined ? '=' : chars[b2 & 63];
  }
  return result;
}

export function PdfViewerSheet({
  visible,
  uri,
  title,
  onClose,
  onDownload,
}: {
  visible: boolean;
  uri: string;
  title: string;
  onClose: () => void;
  onDownload?: () => void;
}) {
  const {height: windowHeight} = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(windowHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = windowHeight;
      backdropOpacity.value = withTiming(1, {duration: 220});
      translateY.value = withSpring(0, SPRING);
    } else if (mounted) {
      backdropOpacity.value = withTiming(0, {duration: 180});
      translateY.value = withSpring(windowHeight, SPRING, finished => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, windowHeight]);

  function close() {
    onClose();
  }

  const pan = Gesture.Pan()
    .onUpdate(e => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd(e => {
      if (e.translationY > 120 || e.velocityY > 800) {
        translateY.value = withSpring(windowHeight, SPRING, finished => {
          if (finished) runOnJS(close)();
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!mounted) return null;

  return (
    <PdfViewerSheetContent
      uri={uri}
      title={title}
      onClose={close}
      onDownload={onDownload}
      pan={pan}
      sheetStyle={sheetStyle}
      backdropStyle={backdropStyle}
    />
  );
}

function PdfViewerSheetContent({
  uri,
  title,
  onClose,
  onDownload,
  pan,
  sheetStyle,
  backdropStyle,
}: {
  uri: string;
  title: string;
  onClose: () => void;
  onDownload?: () => void;
  pan: ReturnType<typeof Gesture.Pan>;
  sheetStyle: ReturnType<typeof useAnimatedStyle>;
  backdropStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  const {height: windowHeight} = useWindowDimensions();
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    if (!isNativePdfAvailable) return;
    let cancelled = false;
    setError(false);
    setLocalPath(null);
    ensureLocalPdf(uri)
      .then(path => {
        if (!cancelled) setLocalPath(path);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const Pdf = PdfComponent;

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[sheetStyle, {height: windowHeight * 0.9}]}
          className="rounded-t-3xl bg-white dark:bg-dark-surface">
          <GestureDetector gesture={pan}>
            <View className="items-center pb-1 pt-3">
              <View className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-dark-border" />
            </View>
          </GestureDetector>
          <View className="flex-row items-center justify-between px-5 pb-3">
            <Text numberOfLines={1} className="mr-3 flex-1 text-base font-bold text-ink dark:text-dark-ink">
              {title}
            </Text>
            <View className="flex-row items-center gap-2">
              {onDownload && (
                <Pressable
                  onPress={onDownload}
                  className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-surface-2">
                  <Download size={15} color={isDark ? '#e8eaed' : '#475569'} />
                </Pressable>
              )}
              <Pressable
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-surface-2">
                <X size={16} color={isDark ? '#e8eaed' : '#475569'} />
              </Pressable>
            </View>
          </View>
          <View className="flex-1 overflow-hidden rounded-b-none">
            {!isNativePdfAvailable ? (
              <View className="flex-1 items-center justify-center px-8">
                <Text className="mb-4 text-center text-sm font-semibold text-slate-600 dark:text-dark-muted">
                  Faylni ko'rish uchun PDF moduli mavjud emas. Brauzerda ochishingiz mumkin.
                </Text>
                <Pressable
                  onPress={() => void Linking.openURL(uri)}
                  className="flex-row items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5">
                  <ExternalLink size={16} color="#ffffff" />
                  <Text className="text-sm font-bold text-white">Brauzerda ochish</Text>
                </Pressable>
              </View>
            ) : error ? (
              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-center text-sm font-semibold text-slate-400 dark:text-dark-muted">
                  Faylni ochib bo'lmadi
                </Text>
              </View>
            ) : !localPath ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#6366f1" />
              </View>
            ) : (
              <Pdf
                source={{uri: `file://${localPath}`}}
                style={{flex: 1, backgroundColor: isDark ? '#24252c' : '#f1f5f9'}}
                onError={(err: any) => {
                  console.log('PDF load error', JSON.stringify(err));
                  setError(true);
                }}
                renderActivityIndicator={() => (
                  <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color="#6366f1" />
                  </View>
                )}
              />
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

