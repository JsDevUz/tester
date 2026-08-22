import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  BookOpen,
  CheckCircle2,
  Lock,
  MessageCircle,
} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';
import {useFocusEffect} from '@react-navigation/native';
import axios from 'axios';
import type {RootStackParamList} from '../navigation/types';
import type {ApiMyCourseDetail, ApiMyPracticeBlock} from '../types/api';
import {apiGetMyCourseDetail, apiMarkLessonComplete} from '../api/groups';
import {apiGetOrCreatePracticeChatForCourse} from '../api/practiceMessenger';
import {storage} from '../lib/storage';
import {computeUnlockedLessonIds, isLessonPassing} from '../lib/lessons';
import {getApiErrorMessage} from '../lib/errors';
import {Loading, OfflineBanner, Screen, StaleNote} from '../components/Ui';
import {LessonBlock} from '../components/LessonBlock';
import {HlsVideoPlayer} from '../components/HlsVideoPlayer';
import {PracticeScreen} from '../components/PracticeScreen';
import {useActiveVideoStore} from '../store/activeVideoStore';
import {useNetwork} from '../providers/NetworkProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Course'>;

export function CourseScreen({route, navigation}: Props) {
  const {courseId, schoolId, initialLessonId} = route.params;
  const [course, setCourse] = useState<ApiMyCourseDetail | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(initialLessonId ?? null);
  const [showPractice, setShowPractice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  // A lesson's editor blocks can be long enough that RenderHTML's parse-and-layout pass
  // blocks the JS thread for a visible moment, which made picking a lesson from the sheet
  // feel like the tap itself was ignored: the sheet's own close animation runs on that same
  // thread, so it froze mid-motion until the heavy render finished. Committing the pressed
  // lesson to a separate, one-tick-deferred value lets the tap's own UI work (closing the
  // sheet, highlighting the row) paint first; the content swaps in the frame right after.
  const [renderedLessonId, setRenderedLessonId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const activeBlockId = useActiveVideoStore(s => s.activeBlockId);
  const setActiveBlockId = useActiveVideoStore(s => s.setActiveBlockId);
  const videoIsFullscreen = useActiveVideoStore(s => s.isFullscreen);

  const {online} = useNetwork();
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';

  const load = useCallback(async () => {
    // Paint the cached course first so opening one is instant; the request below still runs
    // and replaces this with fresh data (or, on an access error, clears it). Access checks are
    // unaffected: a denied response still wipes the cache in the catch block.
    const cachedCourse = await storage.get<{data: ApiMyCourseDetail; savedAt: number}>(
      `cache:course:${courseId}`,
    );
    if (cachedCourse) {
      setCourse(cachedCourse.data);
      setStale(true);
    }

    try {
      const data = await apiGetMyCourseDetail(courseId);
      setCourse(data);
      setStale(false);
      setAccessError(null);
      await storage.set(`cache:course:${courseId}`, {data, savedAt: Date.now()});
      if (!selectedLessonId) {
        const allLessons = data.modules.flatMap(m => m.lessons);
        const lastViewedId = await storage.get<string>(`course:${courseId}:lastLessonId`);
        const lastViewedLesson = allLessons.find(l => l.id === lastViewedId);
        if (lastViewedLesson) {
          setSelectedLessonId(lastViewedLesson.id);
          return;
        }
        let resumeIndex = 0;
        for (let i = 0; i < allLessons.length - 1; i++) {
          if (!allLessons[i].completed) break;
          resumeIndex = i + 1;
        }
        const resumeLesson = allLessons.length > 0 ? allLessons[resumeIndex] : undefined;
        if (resumeLesson) setSelectedLessonId(resumeLesson.id);
      }
    } catch (err) {
      // A server response (as opposed to a network failure) means the
      // backend deliberately denied access - e.g. payment_required/
      // forced_closed from studentAccessService. Falling back to the
      // locally cached snapshot in that case would let a student whose
      // payment lapsed keep watching lessons offline forever, so only
      // genuine connectivity failures (no response at all) use the cache.
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
          if (!selectedLessonId) {
            const allLessons = snapshot.data.modules.flatMap(m => m.lessons);
            const lastViewedId = await storage.get<string>(`course:${courseId}:lastLessonId`);
            const lastViewedLesson = allLessons.find(l => l.id === lastViewedId);
            if (lastViewedLesson) {
              setSelectedLessonId(lastViewedLesson.id);
            }
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [courseId, selectedLessonId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const lessons = useMemo(
    () =>
      course?.modules.flatMap(module => module.lessons.map(lesson => ({module, lesson}))) ?? [],
    [course],
  );
  const selected = lessons.find(item => item.lesson.id === selectedLessonId) ?? lessons[0];
  const selectedIndex = selected
    ? lessons.findIndex(item => item.lesson.id === selected.lesson.id)
    : -1;
  // Header, nav buttons and the sheet's own highlight use `selected` directly so they
  // update on the same tap; only the heavy block content below waits for renderedLessonId.
  const renderedLesson = lessons.find(item => item.lesson.id === renderedLessonId) ?? selected;
  const contentPending = renderedLesson?.lesson.id !== selected?.lesson.id;

  useEffect(() => {
    if (!selected) return;
    if (renderedLessonId === selected.lesson.id) return;
    setRenderedLessonId(selected.lesson.id);
  }, [selected, renderedLessonId]);
  const unlockedLessonIds = useMemo(
    () => computeUnlockedLessonIds(course?.modules ?? []),
    [course],
  );

  useEffect(() => {
    setShowPractice(false);
    setActiveBlockId(null);
  }, [selectedLessonId, setActiveBlockId]);

  useEffect(() => {
    if (!selectedLessonId) return;
    void storage.set(`course:${courseId}:lastLessonId`, selectedLessonId);
  }, [courseId, selectedLessonId]);

  const canGoPrev = selectedIndex > 0;
  const canGoNext =
    selectedIndex >= 0 &&
    selectedIndex + 1 < lessons.length &&
    unlockedLessonIds.has(lessons[selectedIndex + 1].lesson.id);

  const goToPrevLesson = useCallback(() => {
    const prev = lessons[selectedIndex - 1];
    if (prev) setSelectedLessonId(prev.lesson.id);
  }, [lessons, selectedIndex]);

  const goToNextLesson = useCallback(() => {
    const next = lessons[selectedIndex + 1];
    if (next && unlockedLessonIds.has(next.lesson.id)) setSelectedLessonId(next.lesson.id);
  }, [lessons, selectedIndex, unlockedLessonIds]);

  useLayoutEffect(() => {
    if (!selected || showPractice) {
      navigation.setOptions({title: route.params.title, headerTitle: undefined});
      return;
    }
    navigation.setOptions({
      // Hidden while a video is open fullscreen -- the video covers the header's spot, so
      // reserving room for it there would show as a gap above the video. PiP is small
      // enough that the header stays useful for navigating between lessons.
      headerShown: !(activeBlockId && videoIsFullscreen),
      // Android left-aligns header titles by default, which pushes this one against the back
      // arrow; centering matches the iOS layout and keeps it clear of the lesson counter.
      headerTitleAlign: 'center',
      // Course + lesson name, replacing the old "Darslar Tartibi" sheet-opener now that the
      // lesson roster is its own screen (LessonsListScreen) -- there's nothing left here to
      // open a sheet for.
      headerTitle: () => (
        <View className="items-center justify-center py-1">
          <Text
            numberOfLines={1}
            className="max-w-[220px] text-[11px] font-semibold text-slate-400 dark:text-dark-muted">
            {route.params.title}
          </Text>
          <Text
            numberOfLines={1}
            className="max-w-[220px] text-base font-bold text-ink dark:text-dark-ink">
            {selected.lesson.title}
          </Text>
        </View>
      ),
      headerRight: () => (
        <View className="rounded-full bg-slate-900 px-2.5 py-1 dark:bg-dark-surface-2">
          <Text className="text-[11px] font-bold text-white dark:text-dark-ink">
            {selectedIndex + 1} / {lessons.length}
          </Text>
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, showPractice, selectedIndex, lessons.length, isDark, activeBlockId, videoIsFullscreen, route.params.title]);

  async function markComplete() {
    if (!selected) return;
    await apiMarkLessonComplete(selected.lesson.id);
    setCourse(current => {
      if (!current) return current;
      return {
        ...current,
        modules: current.modules.map(module => ({
          ...module,
          lessons: module.lessons.map(lesson =>
            lesson.id === selected.lesson.id ? {...lesson, completed: true} : lesson,
          ),
        })),
      };
    });
  }

  async function openMessenger() {
    try {
      const {chatId} = await apiGetOrCreatePracticeChatForCourse(courseId);
      navigation.navigate('Chat', {chatId, title: course?.curatorName ?? 'Suhbat'});
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Suhbatni ochib bo'lmadi"));
    }
  }

  function openLiveClassReplay(classSessionId: string) {
    navigation.navigate('ClassroomReplay', {sessionId: classSessionId});
  }

  function startPractice(block: ApiMyPracticeBlock) {
    if (!online) {
      Alert.alert('Internet kerak', 'Test va topshiriq yuborish online ishlaydi.');
      return;
    }
    if (!block.testSlug) return;
    navigation.navigate('TestTaker', {
      slug: block.testSlug,
      title: block.testName ?? 'Amaliyot',
      practiceMode: true,
    });
  }

  function viewSubmission(block: ApiMyPracticeBlock, submissionId: string) {
    navigation.navigate('TestResult', {
      submissionId,
      title: block.testName ?? 'Natija',
      practiceMode: true,
    });
  }

  if (loading) return <Loading />;

  if (accessError) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-8">
          <Lock size={32} color="#cbd5e1" />
          <Text className="mt-3 text-center text-sm font-semibold text-slate-400">
            {accessError}
          </Text>
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

  if (selected && showPractice) {
    return (
      <Screen>
        <OfflineBanner />
        <PracticeScreen
          lesson={selected.lesson}
          onBack={() => setShowPractice(false)}
          onStartPractice={startPractice}
          onViewSubmission={viewSubmission}
          onImageSubmitted={() => void load()}
          hasNext={selectedIndex + 1 < lessons.length}
          canComplete={isLessonPassing(selected.lesson)}
          onNext={async () => {
            await markComplete();
            const next = lessons[selectedIndex + 1];
            if (next) setSelectedLessonId(next.lesson.id);
          }}
        />
      </Screen>
    );
  }

  if (selected) {
    const lesson = selected.lesson;
    const hasPractice = lesson.practiceBlocks.length > 0;
    return (
      <Screen>
        <OfflineBanner />
        <StaleNote stale={stale} />
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          className="flex-1">
          {selectedLessonId === null || !renderedLesson ? (
            <View className="py-20">
              <Loading />
            </View>
          ) : (
            <>
              <Text className="mb-2 text-xs font-semibold text-brand dark:text-brand-light">
                {course.title}
              </Text>
              <Text className="text-2xl font-black text-ink dark:text-dark-ink">{lesson.title}</Text>

              <Pressable
                onPress={() => void openMessenger()}
                className="mb-5 mt-5 flex-row items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 dark:border-transparent dark:bg-dark-surface-2">
                <View className="min-w-0 flex-1 flex-row items-center gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-900 dark:bg-dark-surface">
                    <MessageCircle size={16} color="white" />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-xs font-bold text-ink dark:text-dark-ink">
                      {course.curatorName
                        ? `${course.curatorName} bilan suhbatlashish`
                        : 'Ustozga murojaat'}
                    </Text>
                    <Text numberOfLines={1} className="text-[11px] font-semibold text-slate-500 dark:text-dark-muted">
                      {course.curatorName
                        ? 'Kuratorga savolingizni berishingiz mumkin'
                        : "Ustozingizga yozishingiz mumkin"}
                    </Text>
                  </View>
                </View>
                <MessageCircle size={18} color={isDark ? '#a4a7b2' : '#334155'} />
              </Pressable>

              {renderedLesson.lesson.blocks.length === 0 ? (
                <View className="rounded-2xl border border-slate-100 bg-white py-16 dark:border-transparent dark:bg-dark-surface-2">
                  <Text className="text-center text-sm font-semibold text-slate-400 dark:text-dark-muted">
                    Dars kontenti hozircha tayyor emas
                  </Text>
                </View>
              ) : (
                renderedLesson.lesson.blocks.map(block => (
                  <LessonBlock
                    key={block.id}
                    block={block}
                    onOpenLiveClassReplay={openLiveClassReplay}
                    lessonId={lesson.id}
                    lessonTitle={lesson.title}
                    courseId={courseId}
                    courseTitle={course.title}
                    schoolId={schoolId}
                  />
                ))
              )}

              {
                !hasPractice ? (
                  lesson.completed ? (
                    <>
                      <View className="mt-7 flex-row items-center justify-center gap-2 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
                        <CheckCircle2 size={20} color="#10b981" />
                        <Text className="font-bold text-emerald-700 dark:text-emerald-400">Dars tugatilgan</Text>
                      </View>
                      <View className="mt-3 flex-row gap-3">
                        {canGoPrev && (
                          <Pressable
                            onPress={goToPrevLesson}
                            className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 dark:bg-dark-surface-2">
                            <Text className="font-bold text-ink dark:text-dark-ink">Oldingi dars</Text>
                          </Pressable>
                        )}
                        {canGoNext && (
                          <Pressable onPress={goToNextLesson} className="flex-1 items-center rounded-2xl bg-brand py-3.5">
                            <Text className="font-bold text-white">Keyingi dars</Text>
                          </Pressable>
                        )}
                      </View>
                    </>
                  ) : (
                    <>
                      <Pressable
                        onPress={async () => {
                          if (!online) {
                            Alert.alert('Internet kerak', "Darsni tugatish uchun internet kerak.");
                            return;
                          }
                          try {
                            await markComplete();
                          } catch (error) {
                            Alert.alert('Xatolik', getApiErrorMessage(error, "Darsni tugatib bo'lmadi."));
                          }
                        }}
                        className="mt-7 items-center rounded-2xl bg-brand py-3.5">
                        <Text className="font-bold text-white">
                          {selectedIndex + 1 >= lessons.length ? 'Yakunlash' : 'Keyingi dars'}
                        </Text>
                      </Pressable>
                      {canGoPrev && (
                        <Pressable
                          onPress={goToPrevLesson}
                          className="mt-3 items-center rounded-2xl bg-slate-100 py-3.5 dark:bg-dark-surface-2">
                          <Text className="font-bold text-ink dark:text-dark-ink">Oldingi dars</Text>
                        </Pressable>
                      )}
                    </>
                  )
                ) : (
                  <>
                    <Pressable onPress={() => setShowPractice(true)} className="mt-7 items-center rounded-2xl bg-brand py-3.5">
                      <Text className="font-bold text-white">Amaliyot</Text>
                    </Pressable>
                    {canGoPrev && (
                      <Pressable
                        onPress={goToPrevLesson}
                        className="mt-3 items-center rounded-2xl bg-slate-100 py-3.5 dark:bg-dark-surface-2">
                        <Text className="font-bold text-ink dark:text-dark-ink">Oldingi dars</Text>
                      </Pressable>
                    )}
                  </>
                )
              }
            </>
          )}
        </ScrollView>
        {activeBlockId && lesson.blocks.some(b => b.id === activeBlockId) && (
          <HlsVideoPlayer
            blockId={activeBlockId}
            title={
              lesson.blocks.find(b => b.id === activeBlockId)?.label ||
              lesson.blocks.find(b => b.id === activeBlockId)?.fileName ||
              lesson.title
            }
            lessonId={lesson.id}
            lessonTitle={lesson.title}
            courseId={courseId}
            courseTitle={course.title}
            schoolId={schoolId}
            watermark
            onClose={() => setActiveBlockId(null)}
          />
        )}
      </Screen>
    );
  }

  // lessons.length > 0 here (the earlier guard above returned otherwise), and `selected`
  // always falls back to lessons[0], so this is unreachable -- kept only because a
  // component must return a value on every path.
  return null;
}
