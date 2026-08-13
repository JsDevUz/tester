import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, Layers3, ListChecks, RotateCcw, Trophy, X } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiGetDeckBySlug } from '../api/word-decks';
import { Loading, Screen } from '../components/Ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DeckPractice'>;
type Mode = 'flashcard' | 'test';
type Direction = 'wordToTranslation' | 'translationToWord';
type PracticeWord = { id: string; word: string; translation: string; known: boolean };

export function pickDistractors(pool: string[], answer: string, seedKey: string): string[] {
  const deduped = pool.filter((v, i, all) => v !== answer && all.indexOf(v) === i);
  const sorted = [...deduped].sort((a, b) => `${seedKey}:${a}`.localeCompare(`${seedKey}:${b}`));
  return sorted.slice(0, 3);
}

export function buildOptions(answer: string, distractors: string[], seedKey: string): string[] {
  return [answer, ...distractors].sort((a, b) => `${seedKey}:${a}`.localeCompare(`${seedKey}:${b}`));
}

export function DeckPracticeScreen({ route }: Props) {
  const { slug, deckName: paramDeckName } = route.params;
  const [deckName, setDeckName] = useState(paramDeckName ?? '');
  const [words, setWords] = useState<PracticeWord[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [direction, setDirection] = useState<Direction>('wordToTranslation');

  useEffect(() => {
    void apiGetDeckBySlug(slug)
      .then((deck) => {
        setDeckName(deck.name);
        setWords(deck.words.map((w) => ({ ...w, known: false })));
      })
      .catch(() => Alert.alert('Xatolik', "Lug'atni yuklab bo'lmadi"));
  }, [slug]);

  if (!words) return <Loading />;

  if (!mode)
    return (
      <Screen>
        <View className="flex-1 gap-6 p-5">
          <Text className="text-2xl font-black text-ink dark:text-dark-ink">{deckName}</Text>
          <View>
            <Text className="mb-2 text-xs font-bold uppercase text-gray-400">Yo'nalish</Text>
            <View className="h-[42px] w-full flex-row rounded-2xl bg-gray-200 p-[3px] dark:bg-dark-surface">
              <DirectionButton active={direction === 'wordToTranslation'} label="So'z" onPress={() => setDirection('wordToTranslation')} />
              <DirectionButton active={direction === 'translationToWord'} label="Tarjima" onPress={() => setDirection('translationToWord')} />
            </View>
          </View>
          <View>
            <Text className="mb-2 text-xs font-bold uppercase text-gray-400">Rejim</Text>
            <View className="flex-row gap-3">
              <SelectCard selected={mode === 'flashcard'} title="Flashcard" icon={<Layers3 size={20} color={mode === 'flashcard' ? '#ffffff' : '#4f46e5'} />} onPress={() => setMode('flashcard')} />
              <SelectCard selected={mode === 'test'} title="Test" icon={<ListChecks size={20} color={mode === 'test' ? '#ffffff' : '#4f46e5'} />} onPress={() => setMode('test')} />
            </View>
          </View>
        </View>
      </Screen>
    );

  return mode === 'flashcard' ? (
    <Flashcards words={words} direction={direction} setWords={setWords} deckName={deckName} />
  ) : (
    <Test words={words} direction={direction} setWords={setWords} />
  );
}

function SelectCard({ selected, title, icon, onPress }: { selected: boolean; title: string; icon?: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`flex-1 flex-row items-center gap-3 rounded-2xl p-4 ${selected ? 'bg-indigo-600' : 'bg-white dark:bg-dark-surface'}`}>
      {icon}
      <Text className={`font-bold ${selected ? 'text-white' : 'text-ink dark:text-dark-ink'}`}>{title}</Text>
    </Pressable>
  );
}

function DirectionButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`flex-1 items-center justify-center rounded-xl ${active ? 'bg-indigo-600' : ''}`}>
      <Text className={`text-[11px] font-bold ${active ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`}>{label}</Text>
    </Pressable>
  );
}

function Flashcards({ words, direction, setWords, deckName }: { words: PracticeWord[]; direction: Direction; setWords: (w: PracticeWord[]) => void; deckName: string }) {
  const [deck, setDeck] = useState(() => words.filter((w) => !w.known));
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

  useEffect(() => { currentRef.current = deck[0]; }, [deck]);
  useEffect(() => { wordsRef.current = words; }, [words]);

  const commit = useCallback((known: boolean) => {
    const swiped = currentRef.current;
    if (!swiped || exiting) return;

    if (!known) setRepeatCount((count) => count + 1);

    setExiting(known ? 'known' : 'again');
    setWords(wordsRef.current.map((w) => (w.id === swiped.id ? { ...w, known } : w)));

    setTimeout(() => {
      setDeck((oldDeck) => {
        const rest = oldDeck.filter((w) => w.id !== swiped.id);
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
  }, [exiting, animatedDragX, repeatOpacity, repeatScale, repeatY, setWords]);

  useEffect(() => {
    if (exiting === 'again') {
      Animated.parallel([
        Animated.timing(animatedDragX, { toValue: 0, duration: 320, useNativeDriver: false }),
        Animated.timing(repeatY, { toValue: 90, duration: 320, useNativeDriver: false }),
        Animated.timing(repeatScale, { toValue: 0.6, duration: 320, useNativeDriver: false }),
        Animated.timing(repeatOpacity, { toValue: 0, duration: 320, useNativeDriver: false }),
      ]).start();
    } else if (exiting === 'known') {
      Animated.parallel([
        Animated.timing(animatedDragX, { toValue: 560, duration: 320, useNativeDriver: false }),
        Animated.timing(repeatOpacity, { toValue: 0, duration: 320, useNativeDriver: false }),
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
        onMoveShouldSetPanResponder: (_, gesture) => !exiting && Math.abs(gesture.dx) > 5,
        onPanResponderMove: (_, gesture) => { if (!exiting) setDragX(gesture.dx); },
        onPanResponderRelease: (_, gesture) => {
          if (exiting) return;
          if (Math.abs(gesture.dx) < 35) setDragX(0);
          else commit(gesture.dx > 0);
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
          onPress: () => {
            setResetting(true);
            const resetWords = words.map((w) => ({ ...w, known: false }));
            setWords(resetWords);
            setDeck(resetWords);
            setRevealed(false);
            setDragX(0);
            setExiting(null);
            setRepeatCount(0);
            setResetting(false);
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
          <Text className="text-3xl font-black text-ink dark:text-dark-ink">🎉 Tugadi!</Text>
          <Text className="mt-2 text-sm font-semibold text-gray-400">Barcha so'zlar yodlandi</Text>
          <Pressable disabled={resetting} onPress={resetDeck} className="mt-6 flex-row items-center gap-2 rounded-full bg-indigo-600 px-6 py-3.5">
            <RotateCcw size={18} color="#ffffff" />
            <Text className="font-bold text-white">Qayta boshlash</Text>
          </Pressable>
        </View>
      </Screen>
    );

  const rotate = animatedDragX.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-14deg', '0deg', '14deg'] });
  const bilamanOpacity = animatedDragX.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });
  const yanaOpacity = animatedDragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Screen>
      <View className="flex-1 items-center px-4 pt-6">
        <View className="w-full items-center">
          <Text className="text-[20px] font-extrabold tracking-[2px] text-ink dark:text-dark-ink">✦ {deckName}</Text>
          <Text className="mt-1 text-[11px] font-semibold text-gray-400">CHAPGA - TAKRORLASH · O'NGGA - BILAMAN</Text>
        </View>
        <View className="mb-6 mt-4 w-[250px] flex-row justify-between">
          <Stat label="TAKRORLASH" value={repeatCount} color="#ef4444" />
          <Stat label="QOLGAN" value={deck.length} color="#6366f1" />
          <Stat label="BILAMAN" value={words.filter((w) => w.known).length} color="#10b981" />
        </View>
        <View className="relative h-[340px] w-[280px]">
          {deck.slice(1, 6).reverse().map((w, reverseIndex, stack) => {
            const depth = stack.length - reverseIndex;
            const uid = words.findIndex((item) => item.id === w.id);
            const seed = (uid * 137 + depth * 53) % 20;
            const opacity = depth <= 1 ? 1 : Math.max(1 - (depth - 1) * 0.16, 0.15);
            return (
              <View
                key={`stack-${w.id}-${depth}`}
                className="absolute inset-0 rounded-3xl border-2 border-gray-200 bg-white dark:border-zinc-700 dark:bg-dark-surface"
                style={{ transform: [{ translateY: -depth * 6 }, { scale: 1 - depth * 0.05 }, { rotate: `${seed - 10}deg` }], opacity, zIndex: 100 - depth }}
              />
            );
          })}
          <Animated.View
            {...responder.panHandlers}
            className="absolute inset-0 rounded-3xl border-2 border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-dark-surface overflow-hidden"
            style={{
              zIndex: exiting === 'again' ? 1 : 100,
              opacity: repeatOpacity,
              transform: [{ translateX: animatedDragX }, { translateY: repeatY }, { scale: repeatScale }, { rotate }],
            }}
          >
            <Animated.View
              style={{ opacity: bilamanOpacity }}
              className="absolute top-4 right-4 rotate-[-10deg] rounded-xl border-2 border-emerald-500 bg-white/90 px-3 py-1 dark:bg-zinc-800/90 z-20"
              pointerEvents="none"
            >
              <Text className="text-xs font-black tracking-wider text-emerald-600">BILAMAN ✓</Text>
            </Animated.View>

            <Animated.View
              style={{ opacity: yanaOpacity }}
              className="absolute top-4 left-4 rotate-[10deg] rounded-xl border-2 border-rose-500 bg-white/90 px-3 py-1 dark:bg-zinc-800/90 z-20"
              pointerEvents="none"
            >
              <Text className="text-xs font-black tracking-wider text-rose-600">YANA ✗</Text>
            </Animated.View>

            <Pressable
              onPress={() => !exiting && Math.abs(dragX) < 5 && setRevealed(r => !r)}
              className="flex-1 w-full h-full items-center justify-center p-6"
            >
              <Text className="text-center text-3xl font-extrabold text-ink dark:text-dark-ink">
                {direction === 'wordToTranslation' ? current.word : current.translation}
              </Text>
              <View className="relative mt-4 flex min-h-6 w-full items-center justify-center">
                {revealed ? (
                  <Text className="text-lg text-center font-semibold text-gray-700 dark:text-zinc-200">
                    {direction === 'wordToTranslation' ? current.translation : current.word}
                  </Text>
                ) : (
                  <Text className="text-[10px] font-bold tracking-[1px] text-gray-400">JAVOBNI KO'RSATISH</Text>
                )}
              </View>
            </Pressable>
          </Animated.View>
        </View>
        <Pressable disabled={resetting} onPress={resetDeck} className="mt-6 flex-row items-center gap-2 rounded-full bg-white px-5 py-3 border border-gray-200 dark:bg-dark-surface dark:border-zinc-700">
          <RotateCcw size={16} color="#6366f1" className={resetting ? 'animate-spin' : ''} />
          <Text className="font-bold text-gray-700 dark:text-dark-ink">Yangilash</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="items-center">
      <Text style={{ color }} className="text-2xl font-extrabold">{value}</Text>
      <Text className="text-[10px] font-bold tracking-[1px] text-gray-400">{label}</Text>
    </View>
  );
}

function Test({ words, direction, setWords }: { words: PracticeWord[]; direction: Direction; setWords: (w: PracticeWord[]) => void }) {
  const [queue] = useState(() => [...words].sort((a, b) => a.id.localeCompare(b.id)));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const current = queue[index];

  const options = useMemo(() => {
    if (!current) return [];
    const answer = direction === 'wordToTranslation' ? current.translation : current.word;
    const pool = words.filter((w) => w.id !== current.id).map((w) => (direction === 'wordToTranslation' ? w.translation : w.word));
    const distractors = pickDistractors(pool, answer, current.id);
    return buildOptions(answer, distractors, current.id);
  }, [current, direction, words]);

  function restart() {
    setIndex(0);
    setSelected(null);
    setChecked(false);
    setCorrectCount(0);
    setResults([]);
  }

  if (!current) {
    const percentage = queue.length ? Math.round((correctCount / queue.length) * 100) : 0;
    return (
      <Screen>
        <View className="flex-1 items-center justify-center p-6">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/60">
            <Trophy size={38} color="#6366f1" />
          </View>
          <Text className="mt-5 text-xs font-bold uppercase tracking-wider text-gray-400">TEST YAKUNLANDI</Text>
          <Text className="mt-1 text-3xl font-black text-ink dark:text-dark-ink">Natijangiz</Text>
          <Text className="mt-2 text-5xl font-black text-indigo-600">{percentage}%</Text>
          <View className="mt-6 flex-row gap-3 w-full max-w-xs">
            <View className="flex-1 items-center rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
              <Text className="text-2xl font-black text-emerald-600">{correctCount}</Text>
              <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">To'g'ri</Text>
            </View>
            <View className="flex-1 items-center rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/40">
              <Text className="text-2xl font-black text-rose-600">{queue.length - correctCount}</Text>
              <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">Noto'g'ri</Text>
            </View>
          </View>
          <Pressable onPress={restart} className="mt-7 flex-row items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3.5">
            <RotateCcw size={17} color="#ffffff" />
            <Text className="font-bold text-white">Qayta ishlash</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const question = direction === 'wordToTranslation' ? current.word : current.translation;
  const answer = direction === 'wordToTranslation' ? current.translation : current.word;

  function checkAnswer() {
    if (!selected || checked) return;
    const known = selected === answer;
    if (known) setCorrectCount((c) => c + 1);
    setResults((oldResults) => [...oldResults, known]);
    setChecked(true);
    setWords(words.map((w) => (w.id === current.id ? { ...w, known } : w)));
  }

  function nextQuestion() {
    setSelected(null);
    setChecked(false);
    setIndex((v) => v + 1);
  }

  const optionLabels = ['A', 'B', 'C', 'D'];
  const progress = ((index + 1) / queue.length) * 100;

  return (
    <Screen>
      <ScrollView contentContainerClassName="p-4 gap-4">
        <View className="rounded-3xl bg-white p-4 dark:bg-dark-surface shadow-xs">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs font-bold text-gray-400">Savol {index + 1}/{queue.length}</Text>
            <Text className="text-xs font-bold text-indigo-600">{correctCount} to'g'ri</Text>
          </View>
          <View className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-canvas">
            <View className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-1.5 py-1">
              {queue.map((w, questionIndex) => {
                const isCurrent = questionIndex === index;
                const result = results[questionIndex];
                let pillStyle = 'bg-gray-100 dark:bg-dark-canvas';
                if (isCurrent) pillStyle = 'bg-indigo-600';
                else if (result === true) pillStyle = 'bg-emerald-100 dark:bg-emerald-950';
                else if (result === false) pillStyle = 'bg-rose-100 dark:bg-rose-950';
                return (
                  <View key={w.id} className={`h-8 w-8 items-center justify-center rounded-xl ${pillStyle}`}>
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

        <View className="rounded-3xl bg-white p-5 dark:bg-dark-surface shadow-xs gap-4">
          <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink leading-snug">{question}</Text>
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
                <Pressable key={`${option}-${optionIndex}`} disabled={checked} onPress={() => setSelected(option)} className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 ${btnBg}`}>
                  <View className={`h-7 w-7 items-center justify-center rounded-xl ${badgeBg}`}>
                    <Text className={`text-xs font-bold ${chosen || (checked && correct) ? 'text-white' : 'text-gray-500 dark:text-zinc-400'}`}>
                      {optionLabels[optionIndex]}
                    </Text>
                  </View>
                  <Text className={`flex-1 text-sm font-semibold ${textColor}`}>{option}</Text>
                  {checked && correct && <Check size={18} color="#ffffff" />}
                  {checked && chosen && !correct && <X size={18} color="#ffffff" />}
                </Pressable>
              );
            })}
          </View>
          {checked ? (
            <Pressable onPress={nextQuestion} className="items-center justify-center rounded-2xl bg-indigo-600 py-3.5">
              <Text className="font-bold text-white text-sm">{index < queue.length - 1 ? 'Keyingi savol' : "Natijani ko'rish"}</Text>
            </Pressable>
          ) : (
            <Pressable disabled={!selected} onPress={checkAnswer} className={`items-center justify-center rounded-2xl py-3.5 ${selected ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-zinc-800'}`}>
              <Text className={`font-bold text-sm ${selected ? 'text-white' : 'text-gray-400'}`}>Tekshirish</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
