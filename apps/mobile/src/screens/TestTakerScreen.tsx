import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type AppStateStatus,
  type LayoutChangeEvent,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Check, ChevronLeft, ChevronRight, Clock, Moon, Sun, Volume2, VolumeX, X} from 'lucide-react-native';
import type {RootStackParamList} from '../navigation/types';
import {
  apiCheckAnswer,
  apiGetPublicTest,
  apiGetSubmission,
  apiStartSubmission,
  apiSubmitAnswers,
  mediaUrl,
} from '../api/delivery';
import {useAuthStore} from '../store/authStore';
import {useThemeStore} from '../store/themeStore';
import {storage} from '../lib/storage';
import {draftKey, formatTime, seededShuffle, TYPE_BADGES} from '../lib/testTaker';
import {getApiErrorMessage} from '../lib/errors';
import {Input, Loading} from '../components/Ui';
import {ReorderQuestion} from '../components/testTaker/ReorderQuestion';
import {MatchingQuestion} from '../components/testTaker/MatchingQuestion';
import {SliderQuestion} from '../components/testTaker/SliderQuestion';
import {DropPinQuestion} from '../components/testTaker/DropPinQuestion';
import {TestResultView} from '../components/testTaker/TestResultView';
import type {AnswerPayload, PublicQuestion, PublicTest, QuestionFeedback, SubmissionResult} from '../types/delivery';

type Phase = 'checking' | 'entry' | 'starting' | 'answering' | 'result';
type Props = NativeStackScreenProps<RootStackParamList, 'TestTaker'>;

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function TestTakerScreen({route, navigation}: Props) {
  const {slug, practiceMode, submissionId: initialSubmissionId} = route.params;
  const [phase, setPhase] = useState<Phase>(initialSubmissionId ? 'checking' : 'entry');
  const [resolvedSubmissionId, setResolvedSubmissionId] = useState<string | null>(initialSubmissionId ?? null);
  const [startError, setStartError] = useState<string | null>(null);
  const [freshResult, setFreshResult] = useState<SubmissionResult | null>(null);
  const user = useAuthStore(s => s.user);

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



  const insets = useSafeAreaInsets();
  const [fontSize, setFontSize] = useState(16);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [enteredName, setEnteredName] = useState(user?.name ?? '');
  const themePreference = useThemeStore(s => s.preference);
  const setThemePreference = useThemeStore(s => s.setPreference);
  const numbersScrollRef = useRef<ScrollView>(null);
  const [sliderWidth, setSliderWidth] = useState(0);

  function goToResult(sid: string, result?: SubmissionResult) {
    setResolvedSubmissionId(sid);
    if (result) setFreshResult(result);
    setPhase('result');
  }

  // Step 1: if a submissionId was passed in (resuming, or opened via a
  // /t/:slug/result-style deep link), check its status first.
  useEffect(() => {
    if (!initialSubmissionId) {
      setPhase('entry');
      return;
    }
    let cancelled = false;
    apiGetSubmission(initialSubmissionId, practiceMode)
      .then(sub => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubmissionId]);

  // Step 2: auto-start a submission (no visible name-entry form — student
  // identity comes from the logged-in account, mirroring practice mode on web).
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
        const {submissionId: newId} = await apiStartSubmission(slug, name, practiceMode);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Step 3: load + shuffle the test once a submission id exists.
  useEffect(() => {
    if (!resolvedSubmissionId) return;
    let cancelled = false;
    apiGetPublicTest(slug, practiceMode).then(async t => {
      if (cancelled) return;
      setTest(t);
      const qs = t.shuffleQuestions ? seededShuffle(t.questions, resolvedSubmissionId) : [...t.questions];
      const qsWithOpts = qs.map(q => ({
        ...q,
        options:
          t.shuffleOptions && q.type !== 'matching'
            ? seededShuffle(q.options, resolvedSubmissionId + q.id)
            : q.options,
      }));
      setOrderedQuestions(qsWithOpts);
      const initSelected: Record<string, string[]> = {};
      for (const q of qsWithOpts) {
        if (q.type === 'reorder') initSelected[q.id] = q.options.map(o => o.id);
      }

      const savedDraft = await storage.get<{
        selectedMap?: Record<string, string[]>;
        textMap?: Record<string, string>;
        currentIdx?: number;
      }>(draftKey(resolvedSubmissionId));
      if (cancelled) return;
      if (savedDraft) {
        const questionIds = new Set(qsWithOpts.map(q => q.id));
        const restoredSelected = Object.fromEntries(
          Object.entries(savedDraft.selectedMap ?? {}).filter(([id]) => questionIds.has(id)),
        );
        const restoredText = Object.fromEntries(
          Object.entries(savedDraft.textMap ?? {}).filter(([id]) => questionIds.has(id)),
        );
        setSelectedMap({...initSelected, ...restoredSelected});
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

  // Draft autosave.
  useEffect(() => {
    if (!resolvedSubmissionId || orderedQuestions.length === 0 || submittingRef.current) return;
    void storage.set(draftKey(resolvedSubmissionId), {
      selectedMap,
      textMap,
      currentIdx,
      updatedAt: Date.now(),
    });
  }, [resolvedSubmissionId, orderedQuestions.length, selectedMap, textMap, currentIdx]);

  // Timer.
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft === null]);

  useEffect(() => {
    if (timeLeft === 0) void handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // Anti-cheat: web detects tab-switch/close via visibilitychange/beforeunload
  // and auto-submits with mode "violation". There's no native equivalent of a
  // browser tab, but backgrounding the app (home button, app switcher, lock
  // screen) is the closest analogue: if the student backgrounds the app while
  // a timed/auto-complete test is in progress, auto-submit as a violation the
  // same way the web app does. Foregrounding again just re-checks status
  // (covers the case where the submit succeeded and the result is ready).
  useEffect(() => {
    if (!resolvedSubmissionId || test?.autoCompleteOnLeave === false) return;
    const submissionId = resolvedSubmissionId;
    let backgroundedAt: number | null = null;

    async function sendViolationSubmit() {
      if (submittingRef.current || autoSubmitDoneRef.current || orderedQuestionsRef.current.length === 0) return;
      autoSubmitDoneRef.current = true;
      const answers: AnswerPayload[] = orderedQuestionsRef.current.map(q => ({
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
      if (state === 'background' || state === 'inactive') {
        backgroundedAt = Date.now();
        void sendViolationSubmit();
      } else if (state === 'active' && backgroundedAt !== null) {
        backgroundedAt = null;
        if (autoSubmitDoneRef.current) {
          apiGetSubmission(submissionId, practiceMode)
            .then(sub2 => {
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
    const answers: AnswerPayload[] = orderedQuestionsRef.current.map(q => ({
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

  async function handleSubmit() {
    if (submittingRef.current || !test || !resolvedSubmissionId) return;
    submittingRef.current = true;
    setSubmitting(true);
    const answers: AnswerPayload[] = orderedQuestionsRef.current.map(q => ({
      questionId: q.id,
      selectedOptionIds: selectedMapRef.current[q.id] ?? [],
      textAnswer: textMapRef.current[q.id] ?? null,
    }));
    try {
      const result = await apiSubmitAnswers(resolvedSubmissionId, answers, 'normal', undefined, practiceMode);
      await storage.remove(draftKey(resolvedSubmissionId));
      goToResult(resolvedSubmissionId, result);
    } catch (error) {
      submittingRef.current = false;
      setSubmitting(false);
      Alert.alert('Xatolik', getApiErrorMessage(error, "Topshirib bo'lmadi."));
    }
  }

  async function handleCheck() {
    if (!test || checking || !resolvedSubmissionId) return;
    const q = orderedQuestions[currentIdx];
    if (!q) return;
    setChecking(true);
    try {
      const {isCorrect, correctAnswer, correctOptionIds} = await apiCheckAnswer(
        resolvedSubmissionId,
        q.id,
        selectedMap[q.id] ?? [],
        textMap[q.id] ?? null,
        practiceMode,
      );
      setFeedbackMap(prev => ({...prev, [q.id]: {isCorrect, correctAnswer, correctOptionIds}}));
    } finally {
      setChecking(false);
    }
  }

  function toggleOption(questionId: string, optionId: string, type: 'single' | 'multi') {
    if (feedbackMap[questionId]) return;
    setSelectedMap(prev => {
      const current = prev[questionId] ?? [];
      if (type === 'single') return {...prev, [questionId]: [optionId]};
      return current.includes(optionId)
        ? {...prev, [questionId]: current.filter(id => id !== optionId)}
        : {...prev, [questionId]: [...current, optionId]};
    });
  }

  function arrangeAdd(questionId: string, optionId: string) {
    if (feedbackMap[questionId]) return;
    setSelectedMap(prev => {
      const current = prev[questionId] ?? [];
      if (current.includes(optionId)) return prev;
      return {...prev, [questionId]: [...current, optionId]};
    });
  }

  function arrangeRemove(questionId: string, optionId: string) {
    if (feedbackMap[questionId]) return;
    setSelectedMap(prev => ({...prev, [questionId]: (prev[questionId] ?? []).filter(id => id !== optionId)}));
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
            <Pressable
              onPress={() => setSoundEnabled(v => !v)}
              hitSlop={8}
              className="h-8 w-8 items-center justify-center rounded-xl active:bg-slate-100 dark:bg-dark-surface-2">
              {soundEnabled ? <Volume2 size={16} color="#94a3b8" /> : <VolumeX size={16} color="#94a3b8" />}
            </Pressable>
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
    soundEnabled,
    setThemePreference,
    handleExitWhileAnswering,
  ]);

  useEffect(() => {
    if (!numbersScrollRef.current || !sliderWidth || !isOneByOne) return;
    const ITEM_SIZE = 44; // 36px (w-9) + 8px (gap-2)
    const PADDING_LEFT = 16;
    const itemCenter = PADDING_LEFT + currentIdx * ITEM_SIZE + 18;
    const targetX = Math.max(0, itemCenter - sliderWidth / 2);
    numbersScrollRef.current.scrollTo({x: targetX, animated: true});
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

  function renderQuestionBody(q: PublicQuestion) {
    const selected = selectedMap[q.id] ?? [];
    const feedback = feedbackMap[q.id];
    const locked = isPerQuestion && !!feedback;
    const correctIds = new Set(feedback?.correctOptionIds ?? []);

    if (q.type === 'slider') {
      return (
        <SliderQuestion
          options={q.options}
          value={textMap[q.id] ?? ''}
          onChange={v => {
            if (!locked) setTextMap(p => ({...p, [q.id]: v}));
          }}
          locked={locked}
          feedback={feedback}
        />
      );
    }

    if (q.type === 'droppin') {
      return (
        <DropPinQuestion
          imageUrl={q.imageUrl ? mediaUrl(q.imageUrl) : ''}
          value={textMap[q.id] ?? ''}
          onChange={v => {
            if (!locked) setTextMap(p => ({...p, [q.id]: v}));
          }}
          locked={locked}
          feedback={feedback}
        />
      );
    }

    if (q.type === 'fillblank' || q.type === 'open') {
      const isCorrect = feedback?.isCorrect;
      return (
        <View className="flex flex-col gap-2">
          {q.type === 'fillblank' && <Text className="text-xs text-slate-400 dark:text-dark-muted">Bo'sh joyni to'ldiring:</Text>}
          <TextInput
            value={textMap[q.id] ?? ''}
            onChangeText={t => {
              if (!locked) setTextMap(p => ({...p, [q.id]: t}));
            }}
            placeholder="Javobingizni yozing..."
            placeholderTextColor="#94a3b8"
            editable={!locked}
            multiline={q.type === 'open'}
            numberOfLines={q.type === 'open' ? 4 : 1}
            className={`w-full rounded-2xl border px-4 py-3.5 text-base ${
              isCorrect === true
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : isCorrect === false
                  ? 'border-rose-500 bg-rose-500 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
            }`}
          />
          {isCorrect === false && feedback?.correctAnswer && (
            <View className="flex-row items-center gap-2 rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3.5">
              <Text className="flex-1 text-white">{feedback.correctAnswer}</Text>
              <Check size={17} color="white" />
            </View>
          )}
        </View>
      );
    }

    if (q.type === 'matching') {
      return (
        <MatchingQuestion
          questionId={q.id}
          options={q.options}
          selected={selected}
          onSelect={ids => setSelectedMap(p => ({...p, [q.id]: ids}))}
          locked={locked}
          feedback={feedback}
        />
      );
    }

    if (q.type === 'truefalse') {
      return (
        <View className="flex-row gap-3">
          {q.options.map(opt => {
            const checked = selected.includes(opt.id);
            const isTrue = opt.text === "To'g'ri";
            const isCorrectOption = correctIds.has(opt.id);
            const bg = feedback
              ? isCorrectOption
                ? 'border-emerald-500 bg-emerald-500'
                : checked
                  ? 'border-rose-500 bg-rose-500'
                  : 'border-slate-200 bg-white'
              : checked
                ? 'border-slate-900 bg-slate-900'
                : 'border-slate-200 bg-white';
            const fg = feedback ? (isCorrectOption || checked ? 'text-white' : 'text-slate-400') : checked ? 'text-white' : 'text-slate-700';
            return (
              <Pressable
                key={opt.id}
                disabled={locked}
                onPress={() => toggleOption(q.id, opt.id, 'single')}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-4 ${bg}`}>
                <Text className={`text-lg ${fg}`}>{isTrue ? '✓' : '✗'}</Text>
                <Text className={`font-semibold ${fg}`} style={{fontSize}}>{opt.text}</Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    if (q.type === 'reorder') {
      return (
        <View className="flex flex-col gap-2">
          <Text className="mb-1 text-xs text-slate-400 dark:text-dark-muted">Tugmalar bilan to'g'ri tartibga soling</Text>
          <ReorderQuestion
            optionIds={selected}
            options={q.options}
            onChange={ids => setSelectedMap(p => ({...p, [q.id]: ids}))}
            locked={locked}
            feedback={feedback}
          />
        </View>
      );
    }

    if (q.type === 'arrange') {
      const correctSeq = feedback?.correctOptionIds ?? [];
      return (
        <View className="flex flex-col gap-3">
          <View className="min-h-14 flex-row flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 dark:bg-dark-surface-2 dark:border-dark-border">
            {selected.length === 0 && <Text className="px-1 text-xs text-slate-300 dark:text-dark-muted">Bo'laklarni bosib joylashtiring...</Text>}
            {selected.map((id, pos) => {
              const opt = q.options.find(o => o.id === id);
              const result = feedback ? (correctSeq[pos] === id ? 'correct' : 'incorrect') : undefined;
              if (!opt) return null;
              return (
                <Pressable
                  key={id}
                  onPress={() => arrangeRemove(q.id, id)}
                  className={`rounded-xl px-3.5 py-2 ${
                    result === 'correct' ? 'bg-emerald-500' : result === 'incorrect' ? 'bg-rose-500' : 'bg-slate-900'
                  }`}>
                  <Text className="text-white" style={{fontSize}}>{opt.text}</Text>
                </Pressable>
              );
            })}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {q.options
              .filter(o => !selected.includes(o.id))
              .map(opt => (
                <Pressable key={opt.id} onPress={() => arrangeAdd(q.id, opt.id)} className="rounded-xl bg-white px-3.5 py-2 dark:bg-dark-canvas">
                  <Text className="text-slate-700 dark:text-dark-ink" style={{fontSize}}>{opt.text}</Text>
                </Pressable>
              ))}
          </View>
          {selected.length > 0 && !locked && (
            <Pressable onPress={() => setSelectedMap(p => ({...p, [q.id]: []}))} className="self-start">
              <Text className="text-xs text-slate-400 dark:text-dark-muted">Tozalash</Text>
            </Pressable>
          )}
          {feedback?.isCorrect === false && correctSeq.length > 0 && (
            <View className="flex flex-col gap-1.5">
              <Text className="text-xs font-medium text-emerald-700">To'g'ri javob</Text>
              <View className="flex-row flex-wrap gap-2">
                {correctSeq.map(id => {
                  const opt = q.options.find(o => o.id === id);
                  if (!opt) return null;
                  return (
                    <View key={`correct-${id}`} className="rounded-xl bg-emerald-500 px-3.5 py-2">
                      <Text className="text-white" style={{fontSize}}>{opt.text}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      );
    }

    // single / multi
    return (
      <View className="flex flex-col gap-2.5">
        {q.options.map((opt, i) => {
          const checkedOpt = selected.includes(opt.id);
          const label = OPTION_LABELS[i] ?? String(i + 1);
          const isCorrectOption = correctIds.has(opt.id);
          const unselectedButCorrect = isCorrectOption && !checkedOpt;
          const missedCorrect = unselectedButCorrect && q.type === 'multi';
          const cardClass = feedback
            ? checkedOpt && isCorrectOption
              ? 'bg-emerald-500 border-emerald-500'
              : checkedOpt && !isCorrectOption
                ? 'bg-rose-500 border-rose-500'
                : unselectedButCorrect
                  ? 'bg-white border-emerald-500 border-2 dark:bg-dark-card'
                  : 'bg-white border-slate-200 dark:bg-dark-card dark:border-dark-border'
            : checkedOpt
              ? 'bg-slate-900 border-slate-900 dark:bg-dark-focus dark:border-dark-focus'
              : 'bg-white border-slate-200 dark:bg-dark-card dark:border-dark-border';
          const textClass = feedback
            ? checkedOpt || unselectedButCorrect
              ? 'text-white'
              : 'text-slate-400 dark:text-dark-muted'
            : checkedOpt
              ? 'text-white'
              : 'text-slate-800 dark:text-dark-ink';
          const badgeClass = checkedOpt ? 'bg-white/20' : unselectedButCorrect ? 'bg-emerald-100' : 'bg-slate-100 dark:bg-dark-surface-2';
          const badgeTextClass = checkedOpt ? 'text-white' : unselectedButCorrect ? 'text-emerald-700' : 'text-slate-500 dark:text-dark-muted';
          return (
            <Pressable
              key={opt.id}
              disabled={locked}
              onPress={() => toggleOption(q.id, opt.id, q.type as 'single' | 'multi')}
              className={`w-full flex-row items-center gap-3 rounded-2xl border px-3 py-3.5 ${cardClass}`}>
              <View className={`h-7 w-7 items-center justify-center rounded-xl ${badgeClass}`}>
                <Text className={`text-xs font-bold ${badgeTextClass}`}>{label}</Text>
              </View>
              <Text className={`flex-1 leading-snug ${textClass}`} style={{fontSize}}>{opt.text}</Text>
              {feedback && checkedOpt && isCorrectOption && <Check size={18} color="white" />}
              {feedback && checkedOpt && !isCorrectOption && <X size={18} color="white" />}
              {feedback && unselectedButCorrect && !missedCorrect && <Check size={18} color="#059669" />}
              {feedback && missedCorrect && (
                <Text className="text-xs font-medium text-emerald-600">O'tkazib yubordingiz</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  // Entry screen — mirrors apps/frontend's TakeTestEntryPage: the student
  // confirms/edits their name and can flip the colour theme before the timer
  // starts, instead of the test beginning the instant the screen opens.
  if (phase === 'entry') {
    return (
      <View className="flex-1 bg-white dark:bg-dark-canvas">
        <ScrollView contentContainerClassName="px-5 pb-6 pt-4">
          <Text className="text-2xl font-bold leading-tight text-ink dark:text-dark-ink">
            {route.params.title}
          </Text>

          <View className="my-6 h-px bg-slate-100 dark:bg-dark-border" />

          <Text className="mb-2 text-sm font-semibold text-slate-700 dark:text-dark-ink">Ismingiz</Text>
          <Input
            value={enteredName}
            onChangeText={setEnteredName}
            placeholder="Ism va familiyangiz"
          />
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
      <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-dark-border">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => setFontSize(s => Math.max(12, s - 2))}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-xl active:bg-slate-100 dark:bg-dark-surface-2">
            <Text className="text-xs font-bold text-slate-400 dark:text-dark-muted">A-</Text>
          </Pressable>
          <Pressable
            onPress={() => setFontSize(s => Math.min(24, s + 2))}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-xl active:bg-slate-100 dark:bg-dark-surface-2">
            <Text className="text-sm font-bold text-slate-400 dark:text-dark-muted">A+</Text>
          </Pressable>
        </View>
        {timeLeft !== null && (
          <View className="flex-row items-center gap-1">
            <Clock size={12} color={timeLeft < 60 ? '#ef4444' : '#64748b'} />
            <Text className={`font-mono text-sm ${timeLeft < 60 ? 'text-red-500' : 'text-slate-500'}`}>
              {formatTime(timeLeft)}
            </Text>
          </View>
        )}
      </View>

      {isOneByOne && (
        <View className="h-1.5 overflow-hidden rounded-full bg-slate-100 mx-4 mt-3 dark:bg-dark-surface-2">
          <View
            className="h-full rounded-full bg-indigo-500"
            style={{width: `${((currentIdx + 1) / orderedQuestions.length) * 100}%`}}
          />
        </View>
      )}

      {isOneByOne && (
        <ScrollView
          ref={numbersScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-none"
          style={{flexGrow: 0, flexShrink: 0}}
          onLayout={(e: LayoutChangeEvent) => setSliderWidth(e.nativeEvent.layout.width)}
          contentContainerClassName="gap-2 px-4 py-3">
          {orderedQuestions.map((q, i) => {
            const answered = isQuestionAnswered(q);
            const isCurrent = i === currentIdx;
            const jumpable = canJumpTo(i);
            const checkedQ = isPerQuestion && !!feedbackMap[q.id];
            const bg = isCurrent
              ? 'bg-slate-900'
              : checkedQ
                ? feedbackMap[q.id].isCorrect
                  ? 'bg-green-100'
                  : 'bg-red-100'
                : answered
                  ? 'bg-slate-200'
                  : jumpable
                    ? 'bg-white border border-slate-200'
                    : 'bg-slate-100';
            const fg = isCurrent
              ? 'text-white'
              : checkedQ
                ? feedbackMap[q.id].isCorrect
                  ? 'text-green-700'
                  : 'text-red-600'
                : jumpable
                  ? 'text-slate-700'
                  : 'text-slate-300';
            return (
              <Pressable
                key={q.id}
                disabled={!jumpable}
                onPress={() => jumpable && setCurrentIdx(i)}
                className={`h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
                <Text className={`text-sm font-semibold ${fg}`}>{i + 1}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ScrollView className="flex-1" contentContainerClassName="px-2.5 pb-4">
        {isOneByOne
          ? currentQ && (
              <View className="pt-2">
                {badge && (
                  <View className="mb-2 self-start rounded-full px-2 py-0.5" style={{backgroundColor: badge.bg}}>
                    <Text className="text-[10px] font-medium" style={{color: badge.fg}}>
                      {badge.label}
                    </Text>
                  </View>
                )}
                <Text className="font-bold leading-snug text-ink dark:text-dark-ink" style={{fontSize: fontSize + 2}}>
                  {currentQ.text}
                </Text>
                {currentQ.imageUrl && currentQ.type !== 'droppin' && (
                  <Image
                    source={{uri: mediaUrl(currentQ.imageUrl)}}
                    className="mt-4 w-full rounded-2xl"
                    style={{height: 200}}
                    resizeMode="cover"
                  />
                )}
                <View className="my-5 h-px bg-slate-100 dark:bg-dark-surface-2" />
                {renderQuestionBody(currentQ)}
              </View>
            )
          : orderedQuestions.map((q, i) => {
              const qBadge = TYPE_BADGES[q.type];
              return (
                <View key={q.id} className="mb-4 rounded-2xl bg-white p-4 dark:bg-dark-canvas">
                  <View className="mb-3 flex-row items-center gap-2">
                    <View className="h-7 w-7 items-center justify-center rounded-xl bg-slate-100 dark:bg-dark-surface-2">
                      <Text className="text-xs font-bold text-slate-700 dark:text-dark-ink">{i + 1}</Text>
                    </View>
                    {qBadge && (
                      <View className="rounded-full px-2 py-0.5" style={{backgroundColor: qBadge.bg}}>
                        <Text className="text-[10px] font-medium" style={{color: qBadge.fg}}>
                          {qBadge.label}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="mb-4 font-semibold leading-snug text-ink dark:text-dark-ink" style={{fontSize}}>
                    {q.text}
                  </Text>
                  {q.imageUrl && q.type !== 'droppin' && (
                    <Image
                      source={{uri: mediaUrl(q.imageUrl)}}
                      className="mb-4 w-full rounded-xl"
                      style={{height: 180}}
                      resizeMode="cover"
                    />
                  )}
                  {renderQuestionBody(q)}
                </View>
              );
            })}
      </ScrollView>

      <View className="flex-row gap-3 border-t border-slate-100 px-4 pb-6 pt-3 dark:border-dark-border">
        {isOneByOne ? (
          isPerQuestion ? (
            isChecked ? (
              isLast ? (
                <Pressable
                  onPress={() => void handleSubmit()}
                  disabled={submitting}
                  className="flex-1 items-center rounded-2xl bg-green-500 py-4 disabled:opacity-40">
                  <Text className="text-base font-semibold text-white">
                    {submitting ? 'Topshirilmoqda...' : 'Yakunlash'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setCurrentIdx(i => i + 1)}
                  className="flex-1 items-center rounded-2xl bg-indigo-500 py-4">
                  <Text className="text-base font-semibold text-white">Keyingi →</Text>
                </Pressable>
              )
            ) : (
              <Pressable
                onPress={() => void handleCheck()}
                disabled={checking}
                className="flex-1 items-center rounded-2xl bg-indigo-500 py-4 disabled:opacity-50">
                <Text className="text-base font-semibold text-white">
                  {checking ? 'Tekshirilmoqda...' : 'Tekshirish'}
                </Text>
              </Pressable>
            )
          ) : (
            <>
              {currentIdx > 0 && (
                <Pressable onPress={() => setCurrentIdx(i => i - 1)} className="items-center rounded-2xl bg-white px-5 py-4 dark:bg-dark-canvas">
                  <Text className="text-base font-medium text-slate-600 dark:text-dark-muted">← Oldingi</Text>
                </Pressable>
              )}
              {!isLast ? (
                <Pressable
                  onPress={() => setCurrentIdx(i => i + 1)}
                  className="flex-1 items-center rounded-2xl bg-indigo-500 py-4">
                  <Text className="text-base font-semibold text-white">Keyingi →</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void handleSubmit()}
                  disabled={submitting}
                  className="flex-1 items-center rounded-2xl bg-green-500 py-4 disabled:opacity-40">
                  <Text className="text-base font-semibold text-white">
                    {submitting ? 'Topshirilmoqda...' : 'Topshirish ✓'}
                  </Text>
                </Pressable>
              )}
            </>
          )
        ) : (
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={submitting}
            className="flex-1 items-center rounded-2xl bg-green-500 py-4 disabled:opacity-40">
            <Text className="text-base font-semibold text-white">
              {submitting ? 'Topshirilmoqda...' : 'Topshirish'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
