import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, Text, View, Pressable} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import axios from 'axios';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Film,
  Layers3,
  Lock,
  Star,
} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';
import type {RootStackParamList} from '../navigation/types';
import type {ApiMyCourseDetail, ApiMyLesson} from '../types/api';
import {apiGetMyCourseDetail} from '../api/groups';
import {storage} from '../lib/storage';
import {computeCourseStars, computeUnlockedLessonIds} from '../lib/lessons';
import {getApiErrorMessage} from '../lib/errors';
import {Loading, OfflineBanner, Screen, StaleNote} from '../components/Ui';
import {useOfflineVideoStore} from '../store/offlineVideoStore';
import {isOfflineVideoComplete} from '../lib/offlineVideoService';

type Props = NativeStackScreenProps<RootStackParamList, 'LessonsList'>;

function videoDurationLabel(lesson: ApiMyLesson): string | null {
  const videoBlock = lesson.blocks.find(b => b.type === 'video');
  if (!videoBlock?.durationSec) return null;
  const total = videoBlock.durationSec;
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

/**
 * The course's lesson roster -- what used to be CourseScreen's own default state (before it
 * auto-selected a lesson) and, separately, its "Darslar Tartibi" bottom sheet. Splitting it
 * out into its own screen means opening a course always lands here first (a real stack entry
 * a viewer can navigate back to, not a state a lesson screen happened to fall back to), and
 * the Android back button/gesture from a lesson naturally lands here without any custom
 * back-handling.
 */
export function LessonsListScreen({route, navigation}: Props) {
  const {courseId, schoolId} = route.params;
  const [course, setCourse] = useState<ApiMyCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';
  const offlineRegistry = useOfflineVideoStore(s => s.registry);

  const load = useCallback(async () => {
    const cachedCourse = await storage.get<{data: ApiMyCourseDetail; savedAt: number}>(
      `cache:course:${courseId}`,
    );
    if (cachedCourse) {
      setCourse(cachedCourse.data);
      setStale(true);
      setLoading(false);
    }

    try {
      const data = await apiGetMyCourseDetail(courseId);
      setCourse(data);
      setStale(false);
      setAccessError(null);
      await storage.set(`cache:course:${courseId}`, {data, savedAt: Date.now()});
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setCourse(null);
        setStale(false);
        await storage.remove(`cache:course:${courseId}`);
        setAccessError(getApiErrorMessage(err, "To'lov muddati kelgan, lekin to'lanmagan"));
      } else {
        const snapshot = await storage.get<{data: ApiMyCourseDetail; savedAt: number}>(`cache:course:${courseId}`);
        if (snapshot) {
          setCourse(snapshot.data);
          setStale(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const lessons = useMemo(
    () => course?.modules.flatMap(module => module.lessons.map(lesson => ({module, lesson}))) ?? [],
    [course],
  );
  const unlockedLessonIds = useMemo(() => computeUnlockedLessonIds(course?.modules ?? []), [course]);
  const progressCount = lessons.filter(item => item.lesson.completed).length;
  const courseStars = useMemo(() => computeCourseStars(lessons), [lessons]);

  function openLesson(lessonId: string) {
    navigation.navigate('Course', {
      courseId,
      title: route.params.title,
      schoolId,
      initialLessonId: lessonId,
    });
  }

  if (loading) return <Loading />;

  if (accessError) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-8">
          <Lock size={32} color="#cbd5e1" />
          <Text className="mt-3 text-center text-sm font-semibold text-slate-400">{accessError}</Text>
        </View>
      </Screen>
    );
  }

  if (!course || lessons.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-8">
          <BookOpen size={32} color="#cbd5e1" />
          <Text className="mt-3 text-center text-sm font-semibold text-slate-400">
            Bu kursda hozircha ochiq dars yo'q
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <OfflineBanner />
      <StaleNote stale={stale} />
      <ScrollView contentContainerClassName="p-4 pb-10">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="rounded-full bg-slate-900 px-2.5 py-1 dark:bg-dark-surface-2">
            <Text className="text-[11px] font-bold text-white dark:text-dark-ink">
              {progressCount} / {lessons.length}
            </Text>
          </View>
          {courseStars.max > 0 && (
            <View className="flex-row items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5 dark:bg-amber-500/15">
              <Star size={13} color="#f59e0b" fill="#f59e0b" />
              <Text className="text-xs font-bold text-amber-500">
                {courseStars.earned} / {courseStars.max}
              </Text>
            </View>
          )}
        </View>
        {course.modules.map((module, moduleIndex) => (
          <View key={module.id} className="mb-5">
            <View className="mb-2 flex-row items-center gap-1.5 px-1">
              <Layers3 size={13} color={isDark ? '#a4a7b2' : '#94a3b8'} />
              <Text className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-dark-muted">
                {module.title || `Modul ${moduleIndex + 1}`}
              </Text>
            </View>
            {module.lessons.map(lesson => {
              const locked = !unlockedLessonIds.has(lesson.id);
              const hasVideo = lesson.blocks.some(b => b.type === 'video');
              const hasOfflineVideo = lesson.blocks.some(
                b => b.type === 'video' && isOfflineVideoComplete(offlineRegistry[b.id]),
              );
              const totalStars =
                lesson.practiceBlocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0) +
                (lesson.completionScore ?? 0);
              const duration = videoDurationLabel(lesson);
              return (
                <Pressable
                  key={lesson.id}
                  disabled={locked}
                  onPress={() => openLesson(lesson.id)}
                  className="mb-2 flex-row items-center rounded-2xl border border-transparent bg-white p-4 dark:bg-dark-surface">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-dark-surface-2">
                    {locked ? (
                      <Lock size={18} color={isDark ? '#a4a7b2' : '#94a3b8'} />
                    ) : hasVideo ? (
                      <Film size={19} color={isDark ? '#a4a7b2' : '#94a3b8'} />
                    ) : (
                      <BookOpen size={19} color={isDark ? '#a4a7b2' : '#94a3b8'} />
                    )}
                  </View>
                  <View className="ml-3 flex-1">
                    <Text
                      numberOfLines={2}
                      className={`font-bold ${locked ? 'text-slate-400 dark:text-dark-muted' : 'text-slate-800 dark:text-dark-ink'}`}>
                      {lesson.title}
                    </Text>
                    <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
                      <Text className="text-[11px] font-semibold text-slate-400 dark:text-dark-muted">
                        Modul {moduleIndex + 1}
                      </Text>
                      {hasOfflineVideo && (
                        <View className="rounded-full bg-emerald-100 px-1.5 py-0.5 dark:bg-emerald-500/15">
                          <Text className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            Offline
                          </Text>
                        </View>
                      )}
                      {duration && (
                        <View className="rounded-full bg-slate-100 px-1.5 py-0.5 dark:bg-dark-surface-2">
                          <Text className="text-[11px] font-semibold text-slate-500 dark:text-dark-muted">
                            {duration}
                          </Text>
                        </View>
                      )}
                      {lesson.practiceBlocks.length > 0 && (
                        <View className="rounded-full bg-orange-100 px-1.5 py-0.5 dark:bg-orange-500/15">
                          <Text className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                            Amaliyot
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {totalStars > 0 && (
                      <View className="flex-row items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 dark:bg-amber-500/15">
                        <Star size={11} color="#f59e0b" fill="#f59e0b" />
                        <Text className="text-[11px] font-bold text-amber-500">{totalStars}</Text>
                      </View>
                    )}
                    {locked ? (
                      <Lock size={16} color={isDark ? '#454752' : '#cbd5e1'} />
                    ) : lesson.completed ? (
                      <CheckCircle2 size={18} color="#10b981" />
                    ) : (
                      <ChevronRight size={18} color={isDark ? '#454752' : '#cbd5e1'} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
