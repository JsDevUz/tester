import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type AppStateStatus,
  type LayoutChangeEvent,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react-native';
import type { RootStackParamList } from '../navigation/types';
import {
  apiCheckAnswer,
  apiGetPublicTest,
  apiGetSubmission,
  apiStartSubmission,
  apiSubmitAnswers,
  mediaUrl,
} from '../api/delivery';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { storage } from '../lib/storage';
import { draftKey, seededShuffle, TYPE_BADGES } from '../lib/testTaker';
import { getApiErrorMessage } from '../lib/errors';
import { Input, Loading } from '../components/Ui';
import { TestResultView } from '../components/testTaker/TestResultView';
import {
  QuestionBody,
  QuestionCard,
} from '../components/testTaker/QuestionRenderer';
import { TestTakerHeader } from '../components/testTaker/TestTakerHeader';
import {
  QuestionNumbersBar,
  TestTakerActionButtons,
} from '../components/testTaker/TestTakerNavBar';
import type {
  AnswerPayload,
  PublicQuestion,
  PublicTest,
  QuestionFeedback,
  SubmissionResult,
} from '../types/delivery';

type Phase = 'checking' | 'entry' | 'starting' | 'answering' | 'result';
type Props = NativeStackScreenProps<RootStackParamList, 'TestTaker'>;

export function TestTakerScreen({ route, navigation }: Props) {
  const { slug, practiceMode, submissionId: initialSubmissionId } = route.params;
  const [phase, setPhase] = useState<Phase>(initialSubmissionId ? 'checking' : 'entry');
  const [resolvedSubmissionId, setResolvedSubmissionId] = useState<string | null>(initialSubmissionId ?? null);
  const [startError, setStartError] = useState<string | null>(null);
  const [freshResult, setFreshResult] = useState<SubmissionResult | null>(null);
  const user = useAuthStore((s) => s.user);

  const [test, setTest] = useState<PublicTest | null>(null);
  const [orderedQuestions, setOrderedQuestions] = useState<PublicQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({});
  const [textMap, setTextMap] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, QuestionFeedback>>({});
  const [checking, setChecking] = useState(false);

  const selectedMapRef = useRef(selectedMap);
  const textMapRef = useRef(textMap);
  const orderedQuestionsRef = useRef(orderedQuestions);
  const submittingRef = useRef(false);
  const autoSubmitDoneRef = useRef(false);

  useEffect(() => {
    selectedMapRef.current = selectedMap;
  }, [selectedMap]);
  useEffect(() => {
    textMapRef.current = textMap;
  }, [textMap]);
  useEffect(() => {
    orderedQuestionsRef.current = orderedQuestions;
  }, [orderedQuestions]);
  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  const [fontSize, setFontSize] = useState(16);
  const [enteredName, setEnteredName] = useState(user?.name ?? '');
  const themePreference = useThemeStore((s) => s.preference);
  const setThemePreference = useThemeStore((s) => s.setPreference);
  const numbersScrollRef = useRef<ScrollView>(null);
  const [sliderWidth, setSliderWidth] = useState(0);

  function goToResult(sid: string, result?: SubmissionResult) {
    setResolvedSubmissionId(sid);
    if (result) setFreshResult(result);
    setPhase('result');
  }

  useEffect(() => {
    if (!initialSubmissionId) {
      setPhase('entry');
      return;
    }
    let cancelled = false;
    apiGetSubmission(initialSubmissionId, practiceMode)
      .then((sub) => {
        if (cancelled) return;
        if (sub.status === 'submitted') {
          goToResult(initialSubmissionId);
        } else {
          setPhase('answering');
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('entry');
      });
    return () => {
      cancelled = true;
    };
  }, [initialSubmissionId, practiceMode]);

  useEffect(() => {
    if (phase !== 'starting') return;
    let cancelled = false;

    async function start() {
      const name = enteredName.trim();
      if (!name) {
        if (!cancelled) {
          setStartError('Ismingizni kiriting.');
          setPhase('entry');
        }
        return;
      }
      try {
        const { submissionId: newId } = await apiStartSubmission(slug, name, practiceMode);
        if (cancelled) return;
        setResolvedSubmissionId(newId);
        setPhase('answering');
      } catch {
        if (!cancelled) {
          setStartError("Xato yuz berdi. Qayta urinib ko'ring.");
          setPhase('entry');
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [phase, enteredName, slug, practiceMode]);

  useEffect(() => {
    if (!resolvedSubmissionId) return;
    let cancelled = false;
    apiGetPublicTest(slug, practiceMode).then(async (t) => {
      if (cancelled) return;
      setTest(t);
      const qs = t.shuffleQuestions ? seededShuffle(t.questions, resolvedSubmissionId) : [...t.questions];
      const qsWithOpts = qs.map((q) => ({
        ...q,
        options:
          t.shuffleOptions && q.type !== 'matching'
            ? seededShuffle(q.options, resolvedSubmissionId + q.id)
            : q.options,
      }));
      setOrderedQuestions(qsWithOpts);
      const initSelected: Record<string, string[]> = {};
      for (const q of qsWithOpts) {
        if (q.type === 'reorder') initSelected[q.id] = q.options.map((o) => o.id);
      }

      const savedDraft = await storage.get<{
        selectedMap?: Record<string, string[]>;
        textMap?: Record<string, string>;
        currentIdx?: number;
      }>(draftKey(resolvedSubmissionId));
      if (cancelled) return;
      if (savedDraft) {
        const questionIds = new Set(qsWithOpts.map((q) => q.id));
        const restoredSelected = Object.fromEntries(
          Object.entries(savedDraft.selectedMap ?? {}).filter(([id]) => questionIds.has(id)),
        );
        const restoredText = Object.fromEntries(
          Object.entries(savedDraft.textMap ?? {}).filter(([id]) => questionIds.has(id)),
        );
        setSelectedMap({ ...initSelected, ...restoredSelected });
        setTextMap(restoredText);
        if (
          typeof savedDraft.currentIdx === 'number' &&
          savedDraft.currentIdx >= 0 &&
          savedDraft.currentIdx < qsWithOpts.length
        ) {
          setCurrentIdx(savedDraft.currentIdx);
        }
      } else {
        setSelectedMap(initSelected);
      }
      if (t.timeLimit) setTimeLeft(t.timeLimit * 60);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, resolvedSubmissionId, practiceMode]);

  useEffect(() => {
    if (!resolvedSubmissionId || orderedQuestions.length === 0 || submittingRef.current) return;
    void storage.set(draftKey(resolvedSubmissionId), {
      selectedMap,
      textMap,
      currentIdx,
      updatedAt: Date.now(),
    });
  }, [resolvedSubmissionId, orderedQuestions.length, selectedMap, textMap, currentIdx]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft !== 0) return;
    // Auto-submit at zero. A flaky connection must not strand a finished attempt behind a
    // single failed request: retry with a pause, and only interrupt the user if none land.
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (cancelled) return;
        const ok = await handleSubmit(true);
        if (ok || cancelled) return;
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 2000));
      }
      if (!cancelled) {
        Alert.alert('Xatolik', "Vaqt tugadi, lekin topshirib bo'lmadi. Internetni tekshirib, «Topshirish»ni qayta bosing.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeLeft]);

  useEffect(() => {
    if (!resolvedSubmissionId || test?.autoCompleteOnLeave === false) return;
    const submissionId = resolvedSubmissionId;
    let backgroundedAt: number | null = null;

    async function sendViolationSubmit() {
      if (submittingRef.current || autoSubmitDoneRef.current || orderedQuestionsRef.current.length === 0) return;
      autoSubmitDoneRef.current = true;
      const answers: AnswerPayload[] = orderedQuestionsRef.current.map((q) => ({
        questionId: q.id,
        selectedOptionIds: selectedMapRef.current[q.id] ?? [],
        textAnswer: textMapRef.current[q.id] ?? null,
      }));
      try {
        await apiSubmitAnswers(
          submissionId,
          answers,
          'violation',
          'Taqiqlangan harakat aniqlanganligi sababli yakunlandi.',
          practiceMode,
        );
      } catch {
        autoSubmitDoneRef.current = false;
      }
    }

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      // iOS fires 'inactive' for the Control Center, a call banner or the notification shade
      // -- none of which is the student trying to cheat. Only Android's 'inactive' (screen
      // off / dialog) counts; on iOS the violation must be a real 'background'.
      const leftTheApp =
        state === 'background' || (state === 'inactive' && Platform.OS === 'android');
      if (leftTheApp) {
        backgroundedAt = Date.now();
        void sendViolationSubmit();
      } else if (state === 'active' && backgroundedAt !== null) {
        backgroundedAt = null;
        if (autoSubmitDoneRef.current) {
          apiGetSubmission(submissionId, practiceMode)
            .then((sub2) => {
              if (sub2.status === 'submitted') goToResult(submissionId);
              else autoSubmitDoneRef.current = false;
            })
            .catch(() => undefined);
        }
      }
    });
    return () => sub.remove();
  }, [resolvedSubmissionId, test?.autoCompleteOnLeave, practiceMode]);

  const handleExitWhileAnswering = useCallback(async () => {
    if (test?.autoCompleteOnLeave === false || !resolvedSubmissionId || orderedQuestionsRef.current.length === 0) {
      navigation.goBack();
      return;
    }
    if (submittingRef.current || autoSubmitDoneRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const answers: AnswerPayload[] = orderedQuestionsRef.current.map((q) => ({
      questionId: q.id,
      selectedOptionIds: selectedMapRef.current[q.id] ?? [],
      textAnswer: textMapRef.current[q.id] ?? null,
    }));
    try {
      await apiSubmitAnswers(resolvedSubmissionId, answers, 'violation', 'Chiqib ketildi.', practiceMode);
      await storage.remove(draftKey(resolvedSubmissionId));
      navigation.goBack();
    } catch {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [test?.autoCompleteOnLeave, resolvedSubmissionId, practiceMode, navigation]);

  async function handleSubmit(auto = false): Promise<boolean> {
    if (submittingRef.current || !test || !resolvedSubmissionId) return false;
    submittingRef.current = true;
    setSubmitting(true);
    const answers: AnswerPayload[] = orderedQuestionsRef.current.map((q) => ({
      questionId: q.id,
      selectedOptionIds: selectedMapRef.current[q.id] ?? [],
      textAnswer: textMapRef.current[q.id] ?? null,
    }));
    try {
      const result = await apiSubmitAnswers(resolvedSubmissionId, answers, 'normal', undefined, practiceMode);
      await storage.remove(draftKey(resolvedSubmissionId));
      goToResult(resolvedSubmissionId, result);
      return true;
    } catch (error) {
      submittingRef.current = false;
      setSubmitting(false);
      // The timer's auto-submit path stays quiet per attempt: its effect owns the retry
      // loop and the alert. A manual press gets its feedback immediately.
      if (!auto) {
        Alert.alert('Xatolik', getApiErrorMessage(error, "Topshirib bo'lmadi."));
      }
      return false;
    }
  }

  async function handleCheck() {
    if (!test || checking || !resolvedSubmissionId) return;
    const q = orderedQuestions[currentIdx];
    if (!q) return;
    setChecking(true);
    try {
      const { isCorrect, correctAnswer, correctOptionIds } = await apiCheckAnswer(
        resolvedSubmissionId,
        q.id,
        selectedMap[q.id] ?? [],
        textMap[q.id] ?? null,
        practiceMode,
      );
      setFeedbackMap((prev) => ({ ...prev, [q.id]: { isCorrect, correctAnswer, correctOptionIds } }));
    } finally {
      setChecking(false);
    }
  }

  function toggleOption(questionId: string, optionId: string, type: 'single' | 'multi') {
    if (feedbackMap[questionId]) return;
    setSelectedMap((prev) => {
      const current = prev[questionId] ?? [];
      if (type === 'single') return { ...prev, [questionId]: [optionId] };
      return current.includes(optionId)
        ? { ...prev, [questionId]: current.filter((id) => id !== optionId) }
        : { ...prev, [questionId]: [...current, optionId] };
    });
  }

  function arrangeAdd(questionId: string, optionId: string) {
    if (feedbackMap[questionId]) return;
    setSelectedMap((prev) => {
      const current = prev[questionId] ?? [];
      if (current.includes(optionId)) return prev;
      return { ...prev, [questionId]: [...current, optionId] };
    });
  }

  function arrangeRemove(questionId: string, optionId: string) {
    if (feedbackMap[questionId]) return;
    setSelectedMap((prev) => ({ ...prev, [questionId]: (prev[questionId] ?? []).filter((id) => id !== optionId) }));
  }

  const isPerQuestion = test?.showResults === 'per_question';
  const isOneByOne = !!test && (test.oneByOne || isPerQuestion);
  const isLast = currentIdx === orderedQuestions.length - 1;
  const currentQ = orderedQuestions[currentIdx];
  const currentFeedback = currentQ ? feedbackMap[currentQ.id] : undefined;
  const isChecked = !!currentFeedback;

  useEffect(() => {
    const isDarkPref = themePreference === 'dark';
    if (phase === 'entry') {
      navigation.setOptions({
        headerShown: true,
        title: '',
        headerLeft: () => (
          <Pressable
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate('Main');
            }}
            hitSlop={10}
            className="flex-row items-center gap-1 py-1 pr-2">
            <ChevronLeft size={20} color={isDarkPref ? '#a4a7b2' : '#64748b'} />
            <Text className="text-sm font-semibold text-slate-600 dark:text-dark-muted">Ortga</Text>
          </Pressable>
        ),
        headerRight: () => (
          <Pressable
            onPress={() => void setThemePreference(isDarkPref ? 'light' : 'dark')}
            className="flex-row items-center gap-1.5 px-2 py-1">
            {isDarkPref ? <Sun size={18} color="#a4a7b2" /> : <Moon size={18} color="#64748b" />}
            <Text className="text-sm font-semibold text-slate-600 dark:text-dark-muted">
              {isDarkPref ? "Yorug'" : 'Tungi'}
            </Text>
          </Pressable>
        ),
      });
    } else if (phase === 'answering' && test) {
      navigation.setOptions({
        headerShown: true,
        title: '',
        headerLeft: () => (
          <Pressable
            onPress={() => void handleExitWhileAnswering()}
            hitSlop={10}
            className="flex-row items-center gap-1 py-1 pr-2">
            <ChevronLeft size={20} color={isDarkPref ? '#a4a7b2' : '#64748b'} />
            <Text className="text-sm font-semibold text-slate-600 dark:text-dark-muted">Ortga</Text>
          </Pressable>
        ),
        headerRight: () => (
          <View className="flex-row items-center gap-2">
            {isOneByOne && (
              <View className="rounded-full bg-slate-900 px-3 py-1 dark:bg-dark-surface-2">
                <Text className="text-xs font-bold text-white dark:text-dark-ink">
                  {currentIdx + 1} / {orderedQuestions.length}
                </Text>
              </View>
            )}
          </View>
        ),
      });
    } else {
      navigation.setOptions({
        headerShown: true,
        title: '',
        headerLeft: () => (
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            className="flex-row items-center gap-1 py-1 pr-2">
            <ChevronLeft size={20} color={isDarkPref ? '#a4a7b2' : '#64748b'} />
            <Text className="text-sm font-semibold text-slate-600 dark:text-dark-muted">Ortga</Text>
          </Pressable>
        ),
        headerRight: undefined,
      });
    }
  }, [
    navigation,
    phase,
    route.params.title,
    themePreference,
    test,
    isOneByOne,
    currentIdx,
    orderedQuestions.length,
    setThemePreference,
    handleExitWhileAnswering,
  ]);

  useEffect(() => {
    if (!numbersScrollRef.current || !sliderWidth || !isOneByOne) return;
    const ITEM_SIZE = 44; // 36px (w-9) + 8px (gap-2)
    const PADDING_LEFT = 16;
    const itemCenter = PADDING_LEFT + currentIdx * ITEM_SIZE + 18;
    const targetX = Math.max(0, itemCenter - sliderWidth / 2);
    numbersScrollRef.current.scrollTo({ x: targetX, animated: true });
  }, [currentIdx, sliderWidth, isOneByOne]);

  function isQuestionAnswered(q: PublicQuestion): boolean {
    const sel = selectedMap[q.id];
    if (sel && sel.length > 0) return true;
    const txt = textMap[q.id];
    return !!txt && txt.trim().length > 0;
  }

  function canJumpTo(idx: number): boolean {
    if (!isPerQuestion) return true;
    if (idx <= currentIdx) return true;
    const q = orderedQuestions[idx];
    return !!(q && feedbackMap[q.id]);
  }

  if (phase === 'entry') {
    return (
      <View className="flex-1 bg-white dark:bg-dark-canvas">
        <ScrollView contentContainerClassName="px-5 pb-6 pt-4">
          <Text className="text-2xl font-bold leading-tight text-ink dark:text-dark-ink">
            {route.params.title}
          </Text>

          <View className="my-6 h-px bg-slate-100 dark:bg-dark-border" />

          <Text className="mb-2 text-sm font-semibold text-slate-700 dark:text-dark-ink">Ismingiz</Text>
          <Input value={enteredName} onChangeText={setEnteredName} placeholder="Ism va familiyangiz" />
          {startError && <Text className="mt-2 text-sm text-red-400">{startError}</Text>}
        </ScrollView>

        <View className="px-5 pb-8 pt-2">
          <Pressable
            onPress={() => {
              setStartError(null);
              setPhase('starting');
            }}
            disabled={!enteredName.trim()}
            className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-brand py-4 disabled:opacity-40">
            <Text className="text-base font-semibold text-white">Testni boshlash</Text>
            <ChevronRight size={18} color="white" />
          </Pressable>
        </View>
      </View>
    );
  }

  if (startError) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-red-400">{startError}</Text>
      </View>
    );
  }

  if (phase === 'starting' || phase === 'checking' || !resolvedSubmissionId) {
    return <Loading />;
  }

  if (phase === 'result') {
    return (
      <View className="flex-1 bg-white dark:bg-dark-canvas">
        <TestResultView
          submissionId={resolvedSubmissionId}
          practiceMode={practiceMode}
          cachedResult={freshResult}
          onBack={() => navigation.goBack()}
        />
      </View>
    );
  }

  if (!test) return <Loading />;

  const badge = currentQ ? TYPE_BADGES[currentQ.type] : undefined;

  return (
    <View className="flex-1 bg-white dark:bg-dark-canvas">
      <TestTakerHeader
        fontSize={fontSize}
        timeLeft={timeLeft}
        onIncreaseFontSize={() => setFontSize((s) => Math.min(24, s + 2))}
        onDecreaseFontSize={() => setFontSize((s) => Math.max(12, s - 2))}
      />

      {isOneByOne && (
        <QuestionNumbersBar
          ref={numbersScrollRef}
          questions={orderedQuestions}
          currentIdx={currentIdx}
          isPerQuestion={isPerQuestion}
          feedbackMap={feedbackMap}
          isQuestionAnswered={isQuestionAnswered}
          canJumpTo={canJumpTo}
          onSelectIndex={setCurrentIdx}
          onLayout={(e: LayoutChangeEvent) => setSliderWidth(e.nativeEvent.layout.width)}
        />
      )}

      <ScrollView className="flex-1" contentContainerClassName="px-2.5 pb-4">
        {isOneByOne
          ? currentQ && (
              <View className="pt-2">
                {badge && (
                  <View className="mb-2 self-start rounded-full px-2 py-0.5" style={{ backgroundColor: badge.bg }}>
                    <Text className="text-[10px] font-medium" style={{ color: badge.fg }}>
                      {badge.label}
                    </Text>
                  </View>
                )}
                <Text
                  className="font-bold leading-snug text-ink dark:text-dark-ink"
                  style={{ fontSize: fontSize + 2 }}>
                  {currentQ.text}
                </Text>
                {currentQ.imageUrl && currentQ.type !== 'droppin' && (
                  <Image
                    source={{ uri: mediaUrl(currentQ.imageUrl) }}
                    className="mt-4 w-full rounded-2xl"
                    style={{ height: 200 }}
                    resizeMode="cover"
                  />
                )}
                <View className="my-5 h-px bg-slate-100 dark:bg-dark-surface-2" />
                <QuestionBody
                  question={currentQ}
                  selected={selectedMap[currentQ.id] ?? []}
                  textValue={textMap[currentQ.id] ?? ''}
                  feedback={feedbackMap[currentQ.id]}
                  locked={isPerQuestion && !!feedbackMap[currentQ.id]}
                  fontSize={fontSize}
                  onToggleOption={(optId, type) => toggleOption(currentQ.id, optId, type)}
                  onTextChange={(val) => {
                    if (!isPerQuestion || !feedbackMap[currentQ.id]) {
                      setTextMap((p) => ({ ...p, [currentQ.id]: val }));
                    }
                  }}
                  onSetSelected={(ids) => setSelectedMap((p) => ({ ...p, [currentQ.id]: ids }))}
                  onArrangeAdd={(optId) => arrangeAdd(currentQ.id, optId)}
                  onArrangeRemove={(optId) => arrangeRemove(currentQ.id, optId)}
                />
              </View>
            )
          : orderedQuestions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                showIndex={true}
                selected={selectedMap[q.id] ?? []}
                textValue={textMap[q.id] ?? ''}
                feedback={feedbackMap[q.id]}
                locked={isPerQuestion && !!feedbackMap[q.id]}
                fontSize={fontSize}
                onToggleOption={(optId, type) => toggleOption(q.id, optId, type)}
                onTextChange={(val) => {
                  if (!isPerQuestion || !feedbackMap[q.id]) {
                    setTextMap((p) => ({ ...p, [q.id]: val }));
                  }
                }}
                onSetSelected={(ids) => setSelectedMap((p) => ({ ...p, [q.id]: ids }))}
                onArrangeAdd={(optId) => arrangeAdd(q.id, optId)}
                onArrangeRemove={(optId) => arrangeRemove(q.id, optId)}
              />
            ))}
      </ScrollView>

      <TestTakerActionButtons
        isOneByOne={isOneByOne}
        isPerQuestion={isPerQuestion}
        isChecked={isChecked}
        isLast={isLast}
        currentIdx={currentIdx}
        submitting={submitting}
        checking={checking}
        onPrev={() => setCurrentIdx((i) => i - 1)}
        onNext={() => setCurrentIdx((i) => i + 1)}
        onCheck={() => void handleCheck()}
        onSubmit={() => void handleSubmit()}
      />
    </View>
  );
}
