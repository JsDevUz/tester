import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  Check,
  Layers3,
  ListChecks,
  RotateCcw,
  Trophy,
  X,
} from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  apiListMyChallengeWords,
  apiSetChallengeWordProgress,
} from '../api/challenge-words';
import { Loading, Screen } from '../components/Ui';
import type { RootStackParamList } from '../navigation/types';
import type { ApiStudentChallengeWord } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'ChallengeWordPractice'>;
type Mode = 'flashcard' | 'test';
type Direction = 'wordToTranslation' | 'translationToWord';

export function ChallengeWordPracticeScreen({ route }: Props) {
  const { challengeId } = route.params;
  const [words, setWords] = useState<ApiStudentChallengeWord[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [direction, setDirection] = useState<Direction>('wordToTranslation');

  useEffect(() => {
    void apiListMyChallengeWords(challengeId)
      .then(setWords)
      .catch(() => Alert.alert('Xatolik', "So'zlarni yuklab bo'lmadi"));
  }, [challengeId]);

  if (!words) return <Loading />;

  if (!mode)
    return (
      <Screen>
        <View className="flex-1 gap-6 p-5">
          <Text className="text-2xl font-black text-ink dark:text-dark-ink">
            Mashq turi
          </Text>
          <View>
            <Text className="mb-2 text-xs font-bold uppercase text-gray-400">
              Yo'nalish
            </Text>
            <View className="h-[42px] w-full flex-row rounded-2xl bg-gray-200 p-[3px] dark:bg-dark-surface">
              <DirectionButton
                active={direction === 'wordToTranslation'}
                label="So'z"
                onPress={() => setDirection('wordToTranslation')}
              />
              <DirectionButton
                active={direction === 'translationToWord'}
                label="Tarjima"
                onPress={() => setDirection('translationToWord')}
              />
            </View>
          </View>
          <View>
            <Text className="mb-2 text-xs font-bold uppercase text-gray-400">
              Rejim
            </Text>
            <View className="flex-row gap-3">
              <SelectCard
                selected={mode === 'flashcard'}
                title="Flashcard"
                icon={
                  <Layers3
                    size={20}
                    color={mode === 'flashcard' ? '#ffffff' : '#4f46e5'}
                  />
                }
                onPress={() => setMode('flashcard')}
              />
              <SelectCard
                selected={mode === 'test'}
                title="Test"
                icon={
                  <ListChecks
                    size={20}
                    color={mode === 'test' ? '#ffffff' : '#4f46e5'}
                  />
                }
                onPress={() => setMode('test')}
              />
            </View>
          </View>
        </View>
      </Screen>
    );

  return mode === 'flashcard' ? (
    <Flashcards
      challengeId={challengeId}
      words={words}
      direction={direction}
      setWords={setWords}
    />
  ) : (
    <Test
      challengeId={challengeId}
      words={words}
      direction={direction}
      setWords={setWords}
    />
  );
}

function SelectCard({
  selected,
  title,
  icon,
  onPress,
}: {
  selected: boolean;
  title: string;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row items-center gap-3 rounded-2xl p-4 ${
        selected ? 'bg-indigo-600' : 'bg-white dark:bg-dark-surface'
      }`}
    >
      {icon}
      <Text
        className={`font-bold ${
          selected ? 'text-white' : 'text-ink dark:text-dark-ink'
        }`}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function DirectionButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center justify-center rounded-xl ${
        active ? 'bg-indigo-600' : ''
      }`}
    >
      <Text
        className={`text-[11px] font-bold ${
          active ? 'text-white' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Flashcards({
  challengeId,
  words,
  direction,
  setWords,
}: {
  challengeId: string;
  words: ApiStudentChallengeWord[];
  direction: Direction;
  setWords: (words: ApiStudentChallengeWord[]) => void;
}) {
  const [deck, setDeck] = useState(() => words.filter((word) => !word.known));
  const [revealed, setRevealed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [exiting, setExiting] = useState<'again' | 'known' | null>(null);
  const [dragX, setDragX] = useState(0);

  const [repeatCount, setRepeatCount] = useState(0);

  const animatedDragX = useRef(new Animated.Value(0)).current;
  const repeatY = useRef(new Animated.Value(0)).current;
  const repeatScale = useRef(new Animated.Value(1)).current;
  const repeatOpacity = useRef(new Animated.Value(1)).current;

  const currentRef = useRef(deck[0]);
  const wordsRef = useRef(words);

  useEffect(() => {
    currentRef.current = deck[0];
  }, [deck]);

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  const commit = useCallback(
    (known: boolean) => {
      const swiped = currentRef.current;
      if (!swiped || exiting) return;
      const previousKnown = swiped.known;

      if (!known) {
        setRepeatCount((count) => count + 1);
      }

      setExiting(known ? 'known' : 'again');
      setWords(
        wordsRef.current.map((word) =>
          word.id === swiped.id ? { ...word, known } : word,
        ),
      );

      setTimeout(() => {
        setDeck((oldDeck) => {
          const rest = oldDeck.filter((word) => word.id !== swiped.id);
          return known ? rest : [...rest, { ...swiped, known: false }];
        });
        setDragX(0);
        setRevealed(false);
        setExiting(null);
        animatedDragX.setValue(0);
        repeatY.setValue(0);
        repeatScale.setValue(1);
        repeatOpacity.setValue(1);
      }, 320);

      void apiSetChallengeWordProgress(challengeId, swiped.id, known).catch(
        () => {
          setWords(
            wordsRef.current.map((word) =>
              word.id === swiped.id ? { ...word, known: previousKnown } : word,
            ),
          );
          if (known)
            setDeck((oldDeck) =>
              oldDeck.some((word) => word.id === swiped.id)
                ? oldDeck
                : [{ ...swiped, known: previousKnown }, ...oldDeck],
            );
          Alert.alert('Xatolik', "Natijani saqlab bo'lmadi");
        },
      );
    },
    [challengeId, exiting, animatedDragX, repeatOpacity, repeatScale, repeatY, setWords],
  );

  useEffect(() => {
    if (exiting === 'again') {
      Animated.parallel([
        Animated.timing(animatedDragX, {
          toValue: 0,
          duration: 320,
          useNativeDriver: false,
        }),
        Animated.timing(repeatY, {
          toValue: 90,
          duration: 320,
          useNativeDriver: false,
        }),
        Animated.timing(repeatScale, {
          toValue: 0.6,
          duration: 320,
          useNativeDriver: false,
        }),
        Animated.timing(repeatOpacity, {
          toValue: 0,
          duration: 320,
          useNativeDriver: false,
        }),
      ]).start();
    } else if (exiting === 'known') {
      Animated.parallel([
        Animated.timing(animatedDragX, {
          toValue: 560,
          duration: 320,
          useNativeDriver: false,
        }),
        Animated.timing(repeatOpacity, {
          toValue: 0,
          duration: 320,
          useNativeDriver: false,
        }),
      ]).start();
    } else if (!exiting) {
      animatedDragX.setValue(dragX);
      repeatY.setValue(0);
      repeatScale.setValue(1);
      repeatOpacity.setValue(1);
    }
  }, [exiting, dragX, animatedDragX, repeatOpacity, repeatScale, repeatY]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !exiting && Math.abs(gesture.dx) > 5,
        onPanResponderMove: (_, gesture) => {
          if (!exiting) setDragX(gesture.dx);
        },
        onPanResponderRelease: (_, gesture) => {
          if (exiting) return;
          if (Math.abs(gesture.dx) < 35) {
            setDragX(0);
          } else {
            commit(gesture.dx > 0);
          }
        },
      }),
    [commit, exiting],
  );

  function resetDeck() {
    if (resetting) return;
    Alert.alert(
      'Flashcardni reset qilish',
      "Barcha so'zlar qayta takrorlashga o'tkaziladi.",
      [
        { text: 'Bekor', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await Promise.all(
                words.map((word) =>
                  apiSetChallengeWordProgress(challengeId, word.id, false),
                ),
              );
              const resetWords = words.map((word) => ({
                ...word,
                known: false,
              }));
              setWords(resetWords);
              setDeck(resetWords);
              setRevealed(false);
              setDragX(0);
              setExiting(null);
              setRepeatCount(0);
            } catch {
              Alert.alert('Xatolik', "Flashcardni reset qilib bo'lmadi");
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  }

  const current = deck[0];
  if (!current)
    return (
      <Screen>
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-3xl font-black text-ink dark:text-dark-ink">
            🎉 Tugadi!
          </Text>
          <Text className="mt-2 text-sm font-semibold text-gray-400">
            Barcha so'zlar yodlandi
          </Text>
          <Pressable
            disabled={resetting}
            onPress={resetDeck}
            className="mt-6 flex-row items-center gap-2 rounded-full bg-indigo-600 px-6 py-3.5"
          >
            <RotateCcw size={18} color="#ffffff" />
            <Text className="font-bold text-white">Qayta boshlash</Text>
          </Pressable>
        </View>
      </Screen>
    );

  const rotate = animatedDragX.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-14deg', '0deg', '14deg'],
  });

  const bilamanOpacity = animatedDragX.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const yanaOpacity = animatedDragX.interpolate({
    inputRange: [-80, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Screen>
      <View className="flex-1 items-center px-4 pt-6">
        <View className="w-full items-center">
          <Text className="text-[20px] font-extrabold tracking-[2px] text-ink dark:text-dark-ink">
            ✦ So'z yodlash
          </Text>
          <Text className="mt-1 text-[11px] font-semibold text-gray-400">
            CHAPGA - TAKRORLASH · O'NGGA - BILAMAN
          </Text>
        </View>
        <View className="mb-6 mt-4 w-[250px] flex-row justify-between">
          <Stat label="TAKRORLASH" value={repeatCount} color="#ef4444" />
          <Stat label="QOLGAN" value={deck.length} color="#6366f1" />
          <Stat
            label="BILAMAN"
            value={words.filter((word) => word.known).length}
            color="#10b981"
          />
        </View>
        <View className="relative h-[340px] w-[280px]">
          {deck
            .slice(1, 6)
            .reverse()
            .map((word, reverseIndex, stack) => {
              const depth = stack.length - reverseIndex;
              const uid = words.findIndex((item) => item.id === word.id);
              const seed = (uid * 137 + depth * 53) % 20;
              const opacity =
                depth <= 1 ? 1 : Math.max(1 - (depth - 1) * 0.16, 0.15);
              return (
                <View
                  key={`stack-${word.id}-${depth}`}
                  className="absolute inset-0 rounded-3xl border-2 border-gray-200 bg-white dark:border-zinc-700 dark:bg-dark-surface"
                  style={{
                    transform: [
                      { translateY: -depth * 6 },
                      { scale: 1 - depth * 0.05 },
                      { rotate: `${seed - 10}deg` },
                    ],
                    opacity,
                    zIndex: 100 - depth,
                  }}
                />
              );
            })}
          <Animated.View
            {...responder.panHandlers}
            className="absolute inset-0 rounded-3xl border-2 border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-dark-surface overflow-hidden"
            style={{
              zIndex: exiting === 'again' ? 1 : 100,
              opacity: repeatOpacity,
              transform: [
                { translateX: animatedDragX },
                { translateY: repeatY },
                { scale: repeatScale },
                { rotate },
              ],
            }}
          >
            <Animated.View
              style={{ opacity: bilamanOpacity }}
              className="absolute top-4 right-4 rotate-[-10deg] rounded-xl border-2 border-emerald-500 bg-white/90 px-3 py-1 dark:bg-zinc-800/90 z-20"
              pointerEvents="none"
            >
              <Text className="text-xs font-black tracking-wider text-emerald-600">
                BILAMAN ✓
              </Text>
            </Animated.View>

            <Animated.View
              style={{ opacity: yanaOpacity }}
              className="absolute top-4 left-4 rotate-[10deg] rounded-xl border-2 border-rose-500 bg-white/90 px-3 py-1 dark:bg-zinc-800/90 z-20"
              pointerEvents="none"
            >
              <Text className="text-xs font-black tracking-wider text-rose-600">
                YANA ✗
              </Text>
            </Animated.View>

            <Pressable
              onPress={() => !exiting && Math.abs(dragX) < 5 && setRevealed(r => !r)}
              className="flex-1 w-full h-full items-center justify-center p-6"
            >
              <Text className="text-center text-3xl font-extrabold text-ink dark:text-dark-ink">
                {direction === 'wordToTranslation'
                  ? current.word
                  : current.translation}
              </Text>
              {revealed ? (
                <Text className="mt-4 text-center text-lg font-semibold text-gray-700 dark:text-zinc-200">
                  {direction === 'wordToTranslation'
                    ? current.translation
                    : current.word}
                </Text>
              ) : (
                <Text className="mt-4 text-[10px] font-bold tracking-[1px] text-gray-400">
                  JAVOBNI KO'RSATISH
                </Text>
              )}
            </Pressable>
          </Animated.View>
        </View>
        <Pressable
          disabled={resetting}
          onPress={resetDeck}
          className="mt-6 flex-row items-center gap-2 rounded-full bg-white px-5 py-3 border border-gray-200 dark:bg-dark-surface dark:border-zinc-700"
        >
          <RotateCcw size={16} color="#6366f1" />
          <Text className="font-bold text-gray-700 dark:text-dark-ink">
            Yangilash
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View className="items-center">
      <Text style={{ color }} className="text-2xl font-extrabold">
        {value}
      </Text>
      <Text className="text-[10px] font-bold tracking-[1px] text-gray-400">
        {label}
      </Text>
    </View>
  );
}

function Test({
  challengeId,
  words,
  direction,
  setWords,
}: {
  challengeId: string;
  words: ApiStudentChallengeWord[];
  direction: Direction;
  setWords: (words: ApiStudentChallengeWord[]) => void;
}) {
  const [queue] = useState(() =>
    [...words].sort((a, b) => a.id.localeCompare(b.id)),
  );
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const current = queue[index];

  const options = useMemo(() => {
    if (!current) return [];
    const answer =
      direction === 'wordToTranslation'
        ? current.translation
        : current.word;
    const pool = words
      .filter((word) => word.id !== current.id)
      .map((word) =>
        direction === 'wordToTranslation' ? word.translation : word.word,
      )
      .filter(
        (value, position, all) =>
          value !== answer && all.indexOf(value) === position,
      );
    const sortedPool = [...pool].sort((a, b) =>
      `${current.id}:${a}`.localeCompare(`${current.id}:${b}`),
    );
    const distractors = sortedPool.slice(0, 3);
    return [answer, ...distractors].sort((a, b) =>
      `${current.id}:${a}`.localeCompare(`${current.id}:${b}`),
    );
  }, [current, direction, words]);

  function restart() {
    setIndex(0);
    setSelected(null);
    setChecked(false);
    setCorrectCount(0);
    setResults([]);
  }

  if (!current) {
    const percentage = queue.length
      ? Math.round((correctCount / queue.length) * 100)
      : 0;
    return (
      <Screen>
        <View className="flex-1 items-center justify-center p-6 text-center">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/60">
            <Trophy size={38} color="#6366f1" />
          </View>
          <Text className="mt-5 text-xs font-bold uppercase tracking-wider text-gray-400">
            TEST YAKUNLANDI
          </Text>
          <Text className="mt-1 text-3xl font-black text-ink dark:text-dark-ink">
            Natijangiz
          </Text>
          <Text className="mt-2 text-5xl font-black text-indigo-600">
            {percentage}%
          </Text>
          <View className="mt-6 flex-row gap-3 w-full max-w-xs">
            <View className="flex-1 items-center rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
              <Text className="text-2xl font-black text-emerald-600">
                {correctCount}
              </Text>
              <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                To'g'ri
              </Text>
            </View>
            <View className="flex-1 items-center rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/40">
              <Text className="text-2xl font-black text-rose-600">
                {queue.length - correctCount}
              </Text>
              <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                Noto'g'ri
              </Text>
            </View>
          </View>
          <Pressable
            onPress={restart}
            className="mt-7 flex-row items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3.5"
          >
            <RotateCcw size={17} color="#ffffff" />
            <Text className="font-bold text-white">Qayta ishlash</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const question =
    direction === 'wordToTranslation' ? current.word : current.translation;
  const answer =
    direction === 'wordToTranslation' ? current.translation : current.word;

  async function checkAnswer() {
    if (!selected || checked || checking) return;
    setChecking(true);
    const known = selected === answer;
    if (known) setCorrectCount((count) => count + 1);
    setResults((oldResults) => [...oldResults, known]);
    setChecked(true);
    try {
      await apiSetChallengeWordProgress(challengeId, current.id, known);
      setWords(
        words.map((word) =>
          word.id === current.id ? { ...word, known } : word,
        ),
      );
    } catch {
      Alert.alert('Xatolik', "Natijani saqlab bo'lmadi");
    } finally {
      setChecking(false);
    }
  }

  function nextQuestion() {
    setSelected(null);
    setChecked(false);
    setIndex((value) => value + 1);
  }

  const optionLabels = ['A', 'B', 'C', 'D'];
  const progress = ((index + 1) / queue.length) * 100;

  return (
    <Screen>
      <ScrollView contentContainerClassName="p-4 gap-4">
        {/* Header card with progress bar and question pills */}
        <View className="rounded-3xl bg-white p-4 dark:bg-dark-surface shadow-xs">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs font-bold text-gray-400">
              Savol {index + 1}/{queue.length}
            </Text>
            <Text className="text-xs font-bold text-indigo-600">
              {correctCount} to'g'ri
            </Text>
          </View>
          <View className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-canvas">
            <View
              className="h-full rounded-full bg-indigo-600"
              style={{ width: `${progress}%` }}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-1.5 py-1">
              {queue.map((word, questionIndex) => {
                const isCurrent = questionIndex === index;
                const result = results[questionIndex];
                let pillStyle =
                  'bg-gray-100 text-gray-400 dark:bg-dark-canvas dark:text-zinc-500';
                if (isCurrent) {
                  pillStyle = 'bg-indigo-600 text-white font-bold';
                } else if (result === true) {
                  pillStyle =
                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
                } else if (result === false) {
                  pillStyle =
                    'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300';
                }
                return (
                  <View
                    key={word.id}
                    className={`h-8 w-8 items-center justify-center rounded-xl ${pillStyle}`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isCurrent
                          ? 'text-white'
                          : result === true
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : result === false
                          ? 'text-rose-600 dark:text-rose-300'
                          : 'text-gray-400 dark:text-zinc-500'
                      }`}
                    >
                      {questionIndex + 1}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Question & options container */}
        <View className="rounded-3xl bg-white p-5 dark:bg-dark-surface shadow-xs gap-4">
          <View>
            <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink leading-snug">
              {question}
            </Text>
            <Text className="mt-1 text-xs text-gray-400">
              {direction === 'wordToTranslation'
                ? "To'g'ri tarjimani tanlang"
                : "To'g'ri so'zni tanlang"}
            </Text>
          </View>

          <View className="gap-2.5">
            {options.map((option, optionIndex) => {
              const correct = option === answer;
              const chosen = option === selected;

              let btnBg = 'bg-white dark:bg-dark-canvas border-gray-200 dark:border-zinc-700';
              let textColor = 'text-ink dark:text-dark-ink';
              let badgeBg = 'bg-gray-100 dark:bg-zinc-800 text-gray-500';

              if (checked) {
                if (correct) {
                  btnBg = 'bg-emerald-500 border-emerald-500';
                  textColor = 'text-white font-bold';
                  badgeBg = 'bg-white/20 text-white';
                } else if (chosen && !correct) {
                  btnBg = 'bg-rose-500 border-rose-500';
                  textColor = 'text-white font-bold';
                  badgeBg = 'bg-white/20 text-white';
                }
              } else if (chosen) {
                btnBg = 'bg-indigo-600 border-indigo-600';
                textColor = 'text-white font-bold';
                badgeBg = 'bg-white/20 text-white';
              }

              return (
                <Pressable
                  key={`${option}-${optionIndex}`}
                  disabled={checked}
                  onPress={() => setSelected(option)}
                  className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 ${btnBg}`}
                >
                  <View
                    className={`h-7 w-7 items-center justify-center rounded-xl ${badgeBg}`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        chosen || (checked && correct)
                          ? 'text-white'
                          : 'text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {optionLabels[optionIndex]}
                    </Text>
                  </View>

                  <Text className={`flex-1 text-sm font-semibold ${textColor}`}>
                    {option}
                  </Text>

                  {checked && correct && (
                    <Check size={18} color="#ffffff" />
                  )}
                  {checked && chosen && !correct && (
                    <X size={18} color="#ffffff" />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Action button */}
          <View className="mt-2">
            {checked ? (
              <Pressable
                disabled={checking}
                onPress={nextQuestion}
                className="items-center justify-center rounded-2xl bg-indigo-600 py-3.5"
              >
                <Text className="font-bold text-white text-sm">
                  {index < queue.length - 1 ? 'Keyingi savol' : 'Natijani ko\'rish'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={!selected || checking}
                onPress={() => void checkAnswer()}
                className={`items-center justify-center rounded-2xl py-3.5 ${
                  selected ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-zinc-800'
                }`}
              >
                <Text
                  className={`font-bold text-sm ${
                    selected ? 'text-white' : 'text-gray-400'
                  }`}
                >
                  Tekshirish
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
