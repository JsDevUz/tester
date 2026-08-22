import React, { useEffect } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { DownloadCloud, Play, Square, Video as VideoIcon, X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOfflineVideoStore, type ActiveDownloadState } from '../store/offlineVideoStore';
import { formatBytes } from '../lib/imageCache';

const SPRING = { damping: 22, stiffness: 260, mass: 0.7 };

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  filterSchoolId?: string;
  filterCourseId?: string;
  onOpenLesson?: (download: ActiveDownloadState) => void;
}

export function DownloadsBottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  filterSchoolId,
  filterCourseId,
  onOpenLesson,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const activeDownloads = useOfflineVideoStore(s => s.activeDownloads);
  const cancelDownload = useOfflineVideoStore(s => s.cancelDownload);
  const cancelDownloadsForSchool = useOfflineVideoStore(s => s.cancelDownloadsForSchool);
  const cancelDownloadsForCourse = useOfflineVideoStore(s => s.cancelDownloadsForCourse);

  // Filter downloads matching this school or course
  const downloadsList: ActiveDownloadState[] = Object.values(activeDownloads).filter(d => {
    if (filterSchoolId && d.schoolId !== filterSchoolId) return false;
    if (filterCourseId && d.courseId !== filterCourseId) return false;
    return true;
  });

  const translateY = useSharedValue(windowHeight);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, SPRING);
    } else {
      translateY.value = windowHeight;
    }
  }, [visible, windowHeight, translateY]);

  function handleClose() {
    translateY.value = withTiming(windowHeight, { duration: 200 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 600) {
        translateY.value = withTiming(windowHeight, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleStopAll = () => {
    Alert.alert(
      'Barchasini to‘xtatish',
      'Hozir yuklanayotgan barcha videolarni to‘xtatmoqchimisiz?',
      [
        { text: 'Bekor qilish', style: 'cancel' },
        {
          text: 'To‘xtatish',
          style: 'destructive',
          onPress: () => {
            if (filterCourseId) {
              cancelDownloadsForCourse(filterCourseId);
            } else if (filterSchoolId) {
              cancelDownloadsForSchool(filterSchoolId);
            }
          },
        },
      ],
    );
  };

  const handleStopSingle = (blockId: string, itemTitle?: string) => {
    Alert.alert(
      'Yuklashni to‘xtatish',
      `"${itemTitle || 'Video'}" yuklanishini to‘xtatmoqchimisiz?`,
      [
        { text: 'Yo‘q', style: 'cancel' },
        {
          text: 'To‘xtatish',
          style: 'destructive',
          onPress: () => cancelDownload(blockId),
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="flex-1" onPress={handleClose} />
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              sheetStyle,
              {
                maxHeight: windowHeight * 0.82,
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
            className="rounded-t-3xl bg-white dark:bg-dark-surface">
            {/* Drag Handle */}
            <View className="items-center py-2.5">
              <View className="h-1 w-10 rounded-full bg-slate-300 dark:bg-dark-surface-2" />
            </View>

            {/* Header */}
            <View className="flex-row items-center justify-between px-5 pb-3 pt-1 border-b border-slate-100 dark:border-dark-surface-2">
              <View className="flex-1 mr-3">
                <Text
                  numberOfLines={1}
                  className="text-lg font-black text-ink dark:text-dark-ink">
                  {title}
                </Text>
                {subtitle ? (
                  <Text numberOfLines={1} className="text-xs font-semibold text-slate-400 dark:text-dark-muted">
                    {subtitle}
                  </Text>
                ) : null}
              </View>

              <View className="flex-row items-center gap-2">
                {downloadsList.length > 1 && (
                  <Pressable
                    onPress={handleStopAll}
                    className="rounded-xl bg-rose-50 px-2.5 py-1.5 dark:bg-rose-500/10 active:opacity-75">
                    <Text className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                      Barchasini to‘xtatish
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleClose}
                  hitSlop={8}
                  className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-surface-2">
                  <X size={16} color={isDark ? '#a4a7b2' : '#64748b'} />
                </Pressable>
              </View>
            </View>

            {/* Downloads List */}
            {downloadsList.length === 0 ? (
              <View className="items-center justify-center py-14 px-6">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-500/10 mb-3">
                  <DownloadCloud size={28} color="#6366f1" />
                </View>
                <Text className="text-sm font-bold text-ink dark:text-dark-ink text-center">
                  Hozirda yuklanayotgan video yo‘q
                </Text>
                <Text className="text-xs text-slate-400 dark:text-dark-muted text-center mt-1">
                  Barcha videolar to‘liq yuklab bo‘lingan yoki to‘xtatilgan.
                </Text>
              </View>
            ) : (
              <FlatList
                data={downloadsList}
                keyExtractor={(item) => item.blockId}
                contentContainerClassName="p-4 gap-3"
                renderItem={({ item }) => {
                  const percent = Math.round(item.progress);
                  const bytesLabel =
                    item.downloadedBytes != null && item.totalBytes != null && item.totalBytes > 0
                      ? `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`
                      : null;

                  return (
                    <Pressable
                      onPress={() => {
                        handleClose();
                        onOpenLesson?.(item);
                      }}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-transparent dark:bg-dark-surface-2 active:opacity-85">
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20">
                          <VideoIcon size={20} color="#6366f1" />
                        </View>

                        <View className="flex-1 min-w-0">
                          <Text
                            numberOfLines={1}
                            className="text-sm font-bold text-ink dark:text-dark-ink">
                            {item.lessonTitle || item.title || 'Video dars'}
                          </Text>
                          {item.courseTitle ? (
                            <Text
                              numberOfLines={1}
                              className="text-xs font-semibold text-slate-400 dark:text-dark-muted mt-0.5">
                              {item.courseTitle}
                            </Text>
                          ) : null}

                          <View className="mt-1 flex-row items-center justify-between">
                            <Text className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                              {item.stageText || 'Yuklanmoqda...'}
                            </Text>
                            <Text className="text-[11px] font-bold text-slate-500 dark:text-dark-muted">
                              {percent}% {bytesLabel ? `· ${bytesLabel}` : ''}
                            </Text>
                          </View>

                          {/* Progress bar */}
                          <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-dark-surface">
                            <View
                              className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500"
                              style={{ width: `${Math.max(3, percent)}%` }}
                            />
                          </View>
                        </View>

                        {/* Stop single button */}
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleStopSingle(item.blockId, item.lessonTitle || item.title);
                          }}
                          hitSlop={8}
                          className="h-8 w-8 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10 active:opacity-75">
                          <Square size={13} color="#ef4444" fill="#ef4444" />
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}
