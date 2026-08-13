import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {Star, X} from 'lucide-react-native';
import {api} from '../lib/api';
import {getApiErrorMessage} from '../lib/errors';
import type {ApiMyCourse, ApiMyCourseLeaderboard, ApiMyCourseLeaderboardEntry} from '../types/api';

const SPRING = {damping: 22, stiffness: 260, mass: 0.7};

async function fetchLeaderboard(courseId: string): Promise<ApiMyCourseLeaderboard> {
  const res = await api.get(`/my/courses/${courseId}/leaderboard`);
  return res.data;
}

function RankAvatar({
  entry,
  size,
  className = 'bg-white/20',
}: {
  entry: ApiMyCourseLeaderboardEntry;
  size: number;
  className?: string;
}) {
  const initials = (entry.studentName || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();
  return (
    <View
      style={{width: size, height: size, borderRadius: size / 2}}
      className={`items-center justify-center border-2 border-white/70 ${className}`}>
      <Text className="font-bold text-white">{initials}</Text>
    </View>
  );
}

const PODIUM_STYLE: Record<number, {height: number; podiumBg: string; avatarBg: string}> = {
  1: {height: 88, podiumBg: 'bg-amber-400', avatarBg: 'bg-amber-400'},
  2: {height: 64, podiumBg: 'bg-slate-300', avatarBg: 'bg-slate-400'},
  3: {height: 52, podiumBg: 'bg-orange-300', avatarBg: 'bg-orange-400'},
};

export function CourseLeaderboardSheet({
  visible,
  course,
  onClose,
}: {
  visible: boolean;
  course: ApiMyCourse;
  onClose: () => void;
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
    <CourseLeaderboardSheetContent
      course={course}
      onClose={close}
      pan={pan}
      sheetStyle={sheetStyle}
      backdropStyle={backdropStyle}
    />
  );
}

function CourseLeaderboardSheetContent({
  course,
  onClose,
  pan,
  sheetStyle,
  backdropStyle,
}: {
  course: ApiMyCourse;
  onClose: () => void;
  pan: ReturnType<typeof Gesture.Pan>;
  sheetStyle: ReturnType<typeof useAnimatedStyle>;
  backdropStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  const [data, setData] = useState<ApiMyCourseLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchLeaderboard(course.courseId)
      .then(result => {
        if (active) setData(result);
      })
      .catch(err => {
        if (active) setError(getApiErrorMessage(err, 'Reytingni yuklab bo\'lmadi.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [course.courseId]);

  const topThree = data?.entries.slice(0, 3) ?? [];
  const remaining = data?.entries.slice(3) ?? [];

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>
        <Animated.View style={sheetStyle} className="max-h-[85%] rounded-t-3xl bg-indigo-600">
          <GestureDetector gesture={pan}>
            <View className="items-center pb-1 pt-3">
              <View className="h-1.5 w-10 rounded-full bg-white/25" />
            </View>
          </GestureDetector>
          <View className="p-5 pt-2">
            <View className="mb-4 flex-row items-start justify-between">
              <View>
                <Text className="text-xs font-medium text-white/70">{course.courseTitle}</Text>
                <Text className="mt-1 text-xl font-bold text-white">Peshqadamlar</Text>
              </View>
              <Pressable
                onPress={onClose}
                className="h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                <X size={18} color="white" />
              </Pressable>
            </View>

            {loading ? (
              <ActivityIndicator color="white" className="py-16" />
            ) : error ? (
              <Text className="py-16 text-center text-sm text-red-100">{error}</Text>
            ) : data?.entries.length === 0 ? (
              <Text className="py-16 text-center text-sm text-white/75">
                Hali reyting uchun o'quvchilar yo'q.
              </Text>
            ) : (
              <FlatList
                data={remaining}
                keyExtractor={item => item.studentId}
                ListHeaderComponent={
                  <View className="mb-5 flex-row items-end justify-center gap-2">
                    {[topThree[1], topThree[0], topThree[2]].filter(Boolean).map(entry => {
                      const style = PODIUM_STYLE[entry!.rank] ?? PODIUM_STYLE[3];
                      return (
                        <View key={entry!.studentId} className="w-24 items-center">
                          <View className="relative mb-2">
                            <RankAvatar entry={entry!} size={48} className={style.avatarBg} />
                            <View className="absolute -bottom-1 -right-1 h-5 w-5 items-center justify-center rounded-full bg-white">
                              <Text className="text-[10px] font-bold text-gray-800">
                                {entry!.rank}
                              </Text>
                            </View>
                          </View>
                          <Text
                            numberOfLines={1}
                            className="w-full text-center text-xs font-semibold text-white">
                            {entry!.studentName}
                          </Text>
                          <View className="mt-1 flex-row items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
                            <Star size={11} color="#fde68a" fill="#fde68a" />
                            <Text className="text-[11px] font-bold text-amber-100">
                              {entry!.starsEarned}
                            </Text>
                          </View>
                          <View
                            style={{height: style.height}}
                            className={`mt-2 w-full items-center justify-center rounded-t-xl ${style.podiumBg}`}>
                            <Text className="text-3xl font-black text-white/90">{entry!.rank}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                }
                renderItem={({item}) => (
                  <View
                    className={`mb-2 flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${
                      item.isCurrentStudent ? 'bg-white/25' : 'bg-white/15'
                    }`}>
                    <Text className="w-6 text-center text-sm font-bold text-white/80">
                      {item.rank}
                    </Text>
                    <RankAvatar entry={item} size={32} />
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-sm font-semibold text-white">
                        {item.studentName}
                        {item.isCurrentStudent ? ' (Siz)' : ''}
                      </Text>
                      <Text className="text-[11px] text-white/70">
                        {item.lessonsCompleted}/{item.lessonsTotal} dars
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1 rounded-full bg-amber-400/90 px-2 py-1">
                      <Star size={12} color="#78350f" fill="#78350f" />
                      <Text className="text-xs font-bold text-amber-950">{item.starsEarned}</Text>
                    </View>
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
