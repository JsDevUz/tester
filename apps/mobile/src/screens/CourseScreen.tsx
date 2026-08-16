import React, {useCallback, useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {Alert, Modal, Pressable, ScrollView, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Film,
  Layers3,
  Lock,
  MessageCircle,
  Star,
} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import type {RootStackParamList} from '../navigation/types';
import type {ApiMyCourseDetail, ApiMyLesson, ApiMyPracticeBlock} from '../types/api';
import {apiGetMyCourseDetail, apiMarkLessonComplete} from '../api/groups';
import {apiGetOrCreatePracticeChatForCourse} from '../api/practiceMessenger';
import {cached, storage} from '../lib/storage';
import {computeCourseStars, computeUnlockedLessonIds, isLessonPassing} from '../lib/lessons';
import {getApiErrorMessage} from '../lib/errors';
import {Loading, OfflineBanner, Screen, StaleNote} from '../components/Ui';
import {LessonBlock} from '../components/LessonBlock';
import {PracticeScreen} from '../components/PracticeScreen';
import {useNetwork} from '../providers/NetworkProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Course'>;

function videoDurationLabel(lesson: ApiMyLesson): string | null {
  const videoBlock = lesson.blocks.find(b => b.type === 'video');
  if (!videoBlock?.durationSec) return null;
  const total = videoBlock.durationSec;
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export function CourseScreen({route, navigation}: Props) {
  const insets = useSafeAreaInsets();
  const {courseId} = route.params;
  const [course, setCourse] = useState<ApiMyCourseDetail | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [showPractice, setShowPractice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [lessonsListOpen, setLessonsListOpen] = useState(false);
  const {online} = useNetwork();
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';

  const load = useCallback(async () => {
    try {
      const data = await apiGetMyCourseDetail(courseId);
      setCourse(data);
      setStale(false);
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
    } catch {
      const snapshot = await storage.get<{data: ApiMyCourseDetail; savedAt: number}>(`cache:course:${courseId}`);
      if (snapshot) {
        setCourse(snapshot.data);
        setStale(true);
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
  const unlockedLessonIds = useMemo(
    () => computeUnlockedLessonIds(course?.modules ?? []),
    [course],
  );
  const progressCount = lessons.filter(item => item.lesson.completed).length;
  const courseStars = useMemo(() => computeCourseStars(lessons), [lessons]);

  useEffect(() => {
    setShowPractice(false);
  }, [selectedLessonId]);

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
      headerTitle: () => (
        <Pressable
          onPress={() => setLessonsListOpen(true)}
          className="flex-row items-center gap-1.5 py-1">
          <Text
            numberOfLines={1}
            className="max-w-[200px] text-base font-bold text-ink dark:text-dark-ink">
            Darslar Tartibi
          </Text>
          {lessonsListOpen ? (
            <ChevronUp size={18} color={isDark ? '#e8eaed' : '#111827'} />
          ) : (
            <ChevronDown size={18} color={isDark ? '#e8eaed' : '#111827'} />
          )}
        </Pressable>
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
  }, [selected, showPractice, selectedIndex, lessons.length, lessonsListOpen, isDark]);

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
        <ScrollView contentContainerClassName="p-5 pb-12">
          <Text className="mb-2 text-xs font-semibold text-slate-400 dark:text-dark-muted">
            {selected.module.title}
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
                    : "Kurator biriktirilmaguncha ustozingizga yozishingiz mumkin"}
                </Text>
              </View>
            </View>
            <MessageCircle size={18} color={isDark ? '#a4a7b2' : '#334155'} />
          </Pressable>

          {lesson.blocks.length === 0 ? (
            <View className="rounded-2xl border border-slate-100 bg-white py-16 dark:border-transparent dark:bg-dark-surface-2">
              <Text className="text-center text-sm font-semibold text-slate-400 dark:text-dark-muted">
                Dars kontenti hozircha tayyor emas
              </Text>
            </View>
          ) : (
            lesson.blocks.map(block => (
              <LessonBlock key={block.id} block={block} onOpenLiveClassReplay={openLiveClassReplay} />
            ))
          )}

          {!hasPractice ? (
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
          )}
        </ScrollView>
        <Modal
          visible={lessonsListOpen}
          animationType="slide"
          onRequestClose={() => setLessonsListOpen(false)}>
          <Screen>
            <View
              style={{paddingTop: Math.max(insets.top, 12)}}
              className="flex-row items-center justify-between border-b border-slate-100 px-3 pb-2.5 dark:border-dark-border">
              <Pressable
                onPress={() => setLessonsListOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full">
                <ArrowLeft size={21} color={isDark ? '#e8eaed' : '#475569'} />
              </Pressable>
              <Pressable
                onPress={() => setLessonsListOpen(false)}
                className="flex-row items-center gap-1.5">
                <Text className="text-base font-bold text-ink dark:text-dark-ink">Darslar Tartibi</Text>
                <ChevronUp size={20} color={isDark ? '#e8eaed' : '#111827'} />
              </Pressable>
              <View className="rounded-full bg-slate-900 px-2.5 py-1 dark:bg-dark-surface-2">
                <Text className="text-xs font-bold text-white dark:text-dark-ink">
                  {progressCount} / {lessons.length}
                </Text>
              </View>
            </View>
            <ScrollView contentContainerClassName="p-3 pb-4">
              <View className="mb-4 rounded-2xl border border-slate-100 bg-white p-3 dark:border-dark-border dark:bg-dark-surface">
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-ink dark:text-dark-ink">Jarayon</Text>
                  <Text className="text-xs font-bold text-slate-500 dark:text-dark-muted">
                    {progressCount} / {lessons.length}
                  </Text>
                </View>
                <View className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-dark-surface-2">
                  <View
                    className="h-full rounded-full bg-brand"
                    style={{width: `${lessons.length > 0 ? (progressCount / lessons.length) * 100 : 0}%`}}
                  />
                </View>
              </View>
              {renderLessonList(lessonId => {
                setSelectedLessonId(lessonId);
                setLessonsListOpen(false);
              })}
            </ScrollView>
            <View
              style={{paddingBottom: Math.max(insets.bottom, 12)}}
              className="border-t border-slate-100 p-3 dark:border-dark-border">
              <Pressable
                onPress={() => setLessonsListOpen(false)}
                className="h-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-dark-surface-2">
                <Text className="text-sm font-semibold text-slate-700 dark:text-dark-ink">Yopish</Text>
              </Pressable>
            </View>
          </Screen>
        </Modal>
      </Screen>
    );
  }

  function renderLessonList(onSelect: (lessonId: string) => void) {
    return course!.modules.map((module, moduleIndex) => (
      <View key={module.id} className="mb-5">
        <View className="mb-2 flex-row items-center gap-1.5 px-1">
          <Layers3 size={13} color={isDark ? '#a4a7b2' : '#94a3b8'} />
          <Text className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-dark-muted">
            {module.title || `Modul ${moduleIndex + 1}`}
          </Text>
        </View>
        {module.lessons.map(lesson => {
          const locked = !unlockedLessonIds.has(lesson.id);
          const active = lesson.id === selected?.lesson.id;
          const hasVideo = lesson.blocks.some(b => b.type === 'video');
          const totalStars =
            lesson.practiceBlocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0) +
            (lesson.completionScore ?? 0);
          const duration = videoDurationLabel(lesson);
          return (
            <Pressable
              key={lesson.id}
              disabled={locked}
              onPress={() => onSelect(lesson.id)}
              className={`mb-2 flex-row items-center rounded-2xl border p-4 dark:bg-dark-surface ${
                active
                  ? 'border-slate-900 bg-white dark:border-dark-ink'
                  : 'border-transparent bg-white'
              }`}>
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
    ));
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
        {renderLessonList(lessonId => setSelectedLessonId(lessonId))}
      </ScrollView>
    </Screen>
  );
}
