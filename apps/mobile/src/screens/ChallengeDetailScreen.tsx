import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useColorScheme } from 'nativewind';
import { ChevronDown, Star } from 'lucide-react-native';
import { apiAddChallengeEvent, apiGetChallengeLeaderboard, apiGetMyChallengeDetail } from '../api/challenges';
import { apiGetMyChallengeWordLeaderboard, apiListMyChallengeWords } from '../api/challenge-words';
import { Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import { CachedImage } from '../components/common/CachedImage';
import type { RootStackParamList } from '../navigation/types';
import type { ApiChallengeLeaderboardEntry, ApiStudentChallengeWord, ApiMyChallengeDetail, ChallengeLeaderboardMetric } from '../types/api';
import {cachedFirst} from '../lib/storage';

type Props = NativeStackScreenProps<RootStackParamList, 'ChallengeDetail'>;

const TIMEFRAMES: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Umumiy' },
  { key: 'daily', label: 'Kunlik' },
  { key: 'weekly', label: 'Haftalik' },
  { key: 'monthly', label: 'Oylik' },
];

function SelectPicker({
  value,
  options,
  onSelect,
}: {
  title?: string;
  value: string;
  options: Array<{ key: string; label: string }>;
  onSelect: (key: string) => void;
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number; width: number }>({
    x: 0,
    y: 0,
    width: 0,
  });
  const triggerRef = useRef<View>(null);

  const selectedLabel = options.find((o) => o.key === value)?.label ?? value;

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      const windowWidth = Dimensions.get('window').width;
      const menuWidth = Math.max(160, width + 24);
      const adjustedX = Math.min(x, windowWidth - menuWidth - 12);
      const adjustedY = y + height + 6;
      setCoords({ x: Math.max(12, adjustedX), y: adjustedY, width });
      setOpen(true);
    });
  }

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          onPress={toggleOpen}
          className="flex-row items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 border border-gray-200/90 shadow-sm dark:bg-dark-surface dark:border-zinc-700/80 active:opacity-75"
        >
          <Text numberOfLines={1} className="text-xs font-semibold text-gray-800 dark:text-zinc-100 max-w-[120px]">
            {selectedLabel}
          </Text>
          <ChevronDown size={14} color={isDark ? '#94a3b8' : '#64748b'} />
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View
            style={{
              position: 'absolute',
              top: coords.y,
              left: coords.x,
              minWidth: Math.max(170, coords.width + 30),
              backgroundColor: isDark ? '#1e2028' : '#ffffff',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0',
              padding: 6,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: isDark ? 0.45 : 0.14,
              shadowRadius: 14,
              elevation: 12,
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.key === value;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    onSelect(opt.key);
                    setOpen(false);
                  }}
                  className={`flex-row items-center rounded-xl px-4 py-3 my-1 min-h-[44px] ${
                    isSelected
                      ? isDark
                        ? 'bg-blue-500/20'
                        : 'bg-blue-50'
                      : 'bg-transparent active:bg-slate-100 dark:active:bg-zinc-800/60'
                  }`}
                  style={{
                    minHeight: 44,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    marginVertical: 3,
                    borderRadius: 12,
                    justifyContent: 'center',
                    backgroundColor: isSelected
                      ? isDark
                        ? 'rgba(59, 130, 246, 0.22)'
                        : '#eff6ff'
                      : 'transparent',
                  }}
                >
                  <Text
                    className={`text-sm ${
                      isSelected
                        ? 'font-bold text-blue-500 dark:text-blue-400'
                        : 'font-semibold text-slate-700 dark:text-slate-100'
                    }`}
                    style={{
                      fontSize: 14,
                      fontWeight: isSelected ? '700' : '600',
                      color: isSelected
                        ? isDark
                          ? '#60a5fa'
                          : '#2563eb'
                        : isDark
                        ? '#f1f5f9'
                        : '#334155',
                      paddingVertical: 2,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}



export function ChallengeDetailScreen({ route, navigation }: Props) {
  const { challengeId } = route.params;
  const [detail, setDetail] = useState<ApiMyChallengeDetail | null>(null);
  const [tab, setTab] = useState<'books' | 'leaderboard'>('books');
  const [metric, setMetric] = useState<ChallengeLeaderboardMetric>('overall');
  const [timeframe, setTimeframe] = useState<string>('all');
  const [selectedBookId, setSelectedBookId] = useState<string>('all');
  const [entries, setEntries] = useState<ApiChallengeLeaderboardEntry[]>([]);
  const [challengeWords, setChallengeWords] = useState<ApiStudentChallengeWord[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [endPage, setEndPage] = useState('');
  const [newWords, setNewWords] = useState('');

  const load = useCallback(async () => {
    const r = await cachedFirst(
      `challenge:${challengeId}`,
      () => apiGetMyChallengeDetail(challengeId),
      setDetail,
    );
    if (r.data) setDetail(r.data);
  }, [challengeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === 'leaderboard') {
      if (detail?.type === 'soz_yodlash') {
        void apiGetMyChallengeWordLeaderboard(challengeId, timeframe).then((result) =>
          setEntries(result.entries),
        );
      } else {
        void apiGetChallengeLeaderboard(challengeId, metric, timeframe, selectedBookId).then((result) =>
          setEntries(result.entries),
        );
      }
    }
  }, [challengeId, metric, timeframe, selectedBookId, tab, detail?.type]);

  useEffect(() => {
    if (detail?.type === 'soz_yodlash') {
      void apiListMyChallengeWords(challengeId)
        .then(setChallengeWords)
        .catch(() => undefined);
    }
  }, [challengeId, detail?.type]);

  if (!detail) return <Loading />;

  async function performSave(bookId: string, pageNum: number) {
    try {
      await apiAddChallengeEvent(challengeId, bookId, {
        endPage: pageNum,
        newWordsCount: Number(newWords || 0),
      });
      await load();
      setEditing(null);
      setEndPage('');
      setNewWords('');
    } catch (error: any) {
      const slug = error?.response?.data?.requiredTestSlug;
      const testName = error?.response?.data?.requiredTestName ?? 'Test';
      if (slug) {
        Alert.alert(
          'Majburiy test mavjud',
          `Ushbu bet uchun "${testName}" testi mavjud. Testni ishlasangiz, kiritilgan bet qabul qilinadi. Testni boshlaysizmi?`,
          [
            { text: 'Bekor qilish', style: 'cancel' },
            {
              text: 'Testni boshlash',
              onPress: () => {
                navigation.navigate('TestTaker', {
                  slug,
                  title: testName,
                  practiceMode: false,
                });
              },
            },
          ],
        );
      } else {
        Alert.alert('Xatolik', getApiErrorMessage(error));
      }
    }
  }

  async function save(bookId: string) {
    const book = detail?.books?.find((b) => b.id === bookId);
    const parsed = Number(endPage);
    if (!Number.isInteger(parsed) || parsed < 0) return Alert.alert('Xatolik', 'Tugagan betni kiriting');
    if (book?.totalPages && parsed > book.totalPages) {
      return Alert.alert('Xatolik', `Tugagan bet kitobning jami sahifalaridan (${book.totalPages}) oshmasligi kerak`);
    }
    if (book && parsed <= book.lastPageRead) {
      Alert.alert(
        'Ogohlantirish',
        `Siz kitobni ${parsed}-betga qaytarmoqchimisiz?`,
        [
          { text: 'Bekor qilish', style: 'cancel' },
          {
            text: 'Ha',
            onPress: () => void performSave(bookId, parsed),
          },
        ],
      );
      return;
    }
    await performSave(bookId, parsed);
  }

  const isWords = detail.type === 'soz_yodlash';
  const knownCount = challengeWords.filter((w) => w.known).length;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-3 p-4">
        <View className="h-[42px] flex-row rounded-2xl bg-white p-[3px] dark:bg-dark-surface">
          <TabButton
            active={tab === 'books'}
            label={isWords ? "So'zlar" : 'Kitoblar'}
            onPress={() => setTab('books')}
          />
          <TabButton
            active={tab === 'leaderboard'}
            label="Reyting"
            onPress={() => setTab('leaderboard')}
          />
        </View>

        {tab === 'books' ? (
          isWords ? (
            <View className="rounded-2xl bg-white p-4 dark:bg-dark-surface">
              <View className="mb-4 flex-row items-center justify-between">
                <View>
                  <Text className="font-bold text-ink dark:text-dark-ink">
                    So'zlar
                  </Text>
                  <Text className="text-xs text-gray-400">
                    {knownCount}/{challengeWords.length} yodlangan
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    navigation.navigate('ChallengeWordPractice', {
                      challengeId,
                      title: detail.name,
                    })
                  }
                  className="rounded-xl bg-indigo-600 px-4 py-2.5"
                >
                  <Text className="text-xs font-bold text-white">
                    Mashq qilish
                  </Text>
                </Pressable>
              </View>

              {challengeWords.length > 0 ? (
                <View className="gap-2">
                  <View className="flex-row items-center px-3 py-1">
                    <Text className="flex-1 text-[10px] font-bold uppercase text-gray-400">
                      So'z
                    </Text>
                    <Text className="flex-1 text-[10px] font-bold uppercase text-gray-400">
                      Tarjima
                    </Text>
                    <Text className="w-16 text-right text-[10px] font-bold uppercase text-gray-400">
                      Holat
                    </Text>
                  </View>
                  {challengeWords.map((word) => (
                    <View
                      key={word.id}
                      className="flex-row items-center rounded-xl bg-gray-50 p-3 dark:bg-dark-canvas"
                    >
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-sm font-semibold text-ink dark:text-dark-ink"
                      >
                        {word.word}
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-sm text-gray-500 dark:text-gray-400"
                      >
                        {word.translation}
                      </Text>
                      <Text
                        className={`w-16 text-right text-xs font-bold ${
                          word.known ? 'text-emerald-600' : 'text-gray-300'
                        }`}
                      >
                        {word.known ? 'Bilaman' : '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="py-8 text-center text-xs text-gray-400">
                  Hali so'z yo'q
                </Text>
              )}
            </View>
          ) : (
            detail.books.map((book) => (
              <View
                key={book.id}
                className="rounded-2xl bg-white p-4 dark:bg-dark-surface"
              >
                <View className="flex-row justify-between">
                  <Text className="font-bold text-ink dark:text-dark-ink">
                    {book.title}
                  </Text>
                  <Text className="text-xs text-gray-400">
                    {book.lastPageRead}/{book.totalPages} bet
                  </Text>
                </View>
                <View className="my-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-canvas">
                  <View
                    className="h-full bg-indigo-500"
                    style={{
                      width: `${Math.min(
                        100,
                        (book.lastPageRead / Math.max(1, book.totalPages)) *
                          100,
                      )}%`,
                    }}
                  />
                </View>
                {book.pendingTest ? (
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        'Majburiy test mavjud',
                        `Ushbu bet uchun "${book.pendingTest!.name}" testi mavjud. Testni ishlasangiz, kiritilgan bet qabul qilinadi. Testni boshlaysizmi?`,
                        [
                          { text: 'Bekor qilish', style: 'cancel' },
                          {
                            text: 'Testni boshlash',
                            onPress: () => {
                              navigation.navigate('TestTaker', {
                                slug: book.pendingTest!.slug,
                                title: book.pendingTest!.name,
                                practiceMode: false,
                              });
                            },
                          },
                        ],
                      )
                    }
                    className="rounded-xl bg-amber-50 p-3.5 border border-amber-200/60 dark:bg-amber-950/30 dark:border-amber-800/40"
                  >
                    <Text className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      Test ishlash talab etiladi
                    </Text>
                    <Text className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                      "{book.pendingTest.name}" testini yakunlash uchun bosing
                    </Text>
                  </Pressable>
                ) : editing === book.id ? (
                  <View className="gap-2.5">
                    <View className="flex-row items-center gap-2">
                      <View className="flex-1 items-center justify-center rounded-xl bg-gray-100/80 py-3 px-3 dark:bg-dark-canvas/80 border border-gray-200/60 dark:border-zinc-800">
                        <Text className="text-xs font-bold text-gray-500 dark:text-gray-400">
                          {book.lastPageRead} - bet
                        </Text>
                      </View>
                      <Text className="text-base font-extrabold text-gray-400 dark:text-zinc-500">-</Text>
                      <TextInput
                        value={endPage}
                        onChangeText={(val) => {
                          const clean = val.replace(/[^0-9]/g, '');
                          if (!clean) {
                            setEndPage('');
                            return;
                          }
                          const num = parseInt(clean, 10);
                          if (book.totalPages && num > book.totalPages) {
                            setEndPage(String(book.totalPages));
                          } else {
                            setEndPage(clean);
                          }
                        }}
                        keyboardType="number-pad"
                        placeholder="Tugagan bet"
                        placeholderTextColor="#94a3b8"
                        className="flex-1 rounded-xl bg-gray-100 px-3 py-3 text-center text-sm font-semibold text-ink dark:bg-dark-canvas dark:text-dark-ink"
                      />
                    </View>
                    <TextInput
                      value={newWords}
                      onChangeText={setNewWords}
                      keyboardType="number-pad"
                      placeholder="Yangi lug'at soni"
                      placeholderTextColor="#94a3b8"
                      className="rounded-xl bg-gray-100 px-3 py-3 text-sm font-semibold text-ink dark:bg-dark-canvas dark:text-dark-ink"
                    />
                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() => {
                          setEditing(null);
                          setEndPage('');
                          setNewWords('');
                        }}
                        className="items-center rounded-xl bg-gray-100 px-4 py-3 dark:bg-dark-canvas"
                      >
                        <Text className="text-xs font-bold text-gray-500 dark:text-dark-muted">Bekor qilish</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void save(book.id)}
                        className="flex-1 items-center rounded-xl bg-indigo-600 py-3"
                      >
                        <Text className="font-bold text-white">Saqlash</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setEditing(book.id)}
                    className="items-center rounded-xl bg-gray-100 py-3 dark:bg-dark-canvas"
                  >
                    <Text className="font-bold text-gray-600 dark:text-dark-ink">
                      + Yangi yozuv
                    </Text>
                  </Pressable>
                )}
              </View>
            ))
          )
        ) : (
          <View className="gap-3">
            {/* Single row filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
            >
              {!isWords && (
                <SelectPicker
                  title="Turi"
                  value={metric}
                  options={[
                    { key: 'overall', label: 'Umumiy' },
                    { key: 'books', label: 'Kitob' },
                    { key: 'words', label: "Lug'at" },
                  ]}
                  onSelect={(k) => setMetric(k as ChallengeLeaderboardMetric)}
                />
              )}

              <SelectPicker
                title="Vaqt oralig'i"
                value={timeframe}
                options={TIMEFRAMES}
                onSelect={setTimeframe}
              />

              {!isWords && detail.books.length > 0 && (
                <SelectPicker
                  title="Kitob nomi"
                  value={selectedBookId}
                  options={[
                    { key: 'all', label: 'Barcha kitoblar' },
                    ...detail.books.map((b) => ({ key: b.id, label: b.title })),
                  ]}
                  onSelect={setSelectedBookId}
                />
              )}
            </ScrollView>


            {entries.length === 0 ? (
              <View className="rounded-2xl bg-white p-8 dark:bg-dark-surface">
                <Text className="text-center text-xs font-bold text-gray-400">
                  Hali reyting yo'q
                </Text>
              </View>
            ) : (
              (() => {
                const topThree = entries.slice(0, 3);
                const remaining = entries.slice(3);
                const podiumOrder =
                  topThree.length > 1
                    ? [topThree[1], topThree[0], topThree[2]].filter(Boolean)
                    : topThree;

                const rankStyles: Record<
                  number,
                  {
                    podiumHeight: string;
                    podiumBg: string;
                    podiumText: string;
                    avatarBg: string;
                  }
                > = {
                  1: {
                    podiumHeight: 'h-28',
                    podiumBg: 'bg-amber-400',
                    podiumText: 'text-2xl font-black text-white',
                    avatarBg: 'bg-amber-400',
                  },
                  2: {
                    podiumHeight: 'h-20',
                    podiumBg: 'bg-slate-300',
                    podiumText: 'text-xl font-black text-white',
                    avatarBg: 'bg-slate-400',
                  },
                  3: {
                    podiumHeight: 'h-16',
                    podiumBg: 'bg-orange-300',
                    podiumText: 'text-lg font-black text-white',
                    avatarBg: 'bg-orange-400',
                  },
                };

                return (
                  <View className="gap-3">
                    {/* Top 3 Podium Card */}
                    <View className="rounded-3xl bg-indigo-700 p-4 dark:bg-indigo-950">
                      <View className="mt-2 flex-row items-end justify-center gap-3">
                        {podiumOrder.map((entry) => {
                          const style =
                            rankStyles[entry.rank] ?? rankStyles[3];
                          const size =
                            entry.rank === 1 ? 52 : entry.rank === 2 ? 44 : 40;
                          return (
                            <View
                              key={entry.studentId}
                              className="flex-1 items-center max-w-[110px]"
                            >
                              <View className="relative mb-1">
                                {entry.studentAvatarUrl ? (
                                  <CachedImage
                                    source={{ uri: entry.studentAvatarUrl }}
                                    category="avatars"
                                    style={{
                                      width: size,
                                      height: size,
                                      borderRadius: size / 2,
                                    }}
                                    className="border-2 border-white"
                                  />
                                ) : (
                                  <View
                                    style={{
                                      width: size,
                                      height: size,
                                      borderRadius: size / 2,
                                    }}
                                    className={`items-center justify-center border-2 border-white ${style.avatarBg}`}
                                  >
                                    <Text className="font-extrabold text-white text-xs">
                                      {entry.studentName.charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                <View className="absolute -bottom-1 -right-1 h-4 w-4 items-center justify-center rounded-full bg-white shadow-xs">
                                  <Text className="text-[9px] font-black text-gray-900">
                                    {entry.rank}
                                  </Text>
                                </View>
                              </View>
                              <Text
                                numberOfLines={1}
                                className="w-full text-center text-[11px] font-bold text-white"
                              >
                                {entry.studentName}
                              </Text>
                              <View className="mt-1 flex-row items-center gap-1 rounded-full bg-white/20 px-2 py-0.5">
                                <Star size={10} color="#fcd34d" fill="#fcd34d" />
                                <Text className="text-[10px] font-black text-amber-200">
                                  {entry.value}
                                </Text>
                              </View>
                              <View
                                className={`mt-2 w-full items-center justify-center rounded-t-2xl ${style.podiumHeight} ${style.podiumBg}`}
                              >
                                <Text className={style.podiumText}>
                                  {entry.rank}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    {/* Ranks 4+ List */}
                    {remaining.length > 0 && (
                      <View className="rounded-2xl bg-white p-3 gap-2 dark:bg-dark-surface">
                        {remaining.map((entry) => (
                          <View
                            key={entry.studentId}
                            className={`flex-row items-center gap-3 rounded-xl p-3 ${
                              entry.isCurrentStudent
                                ? 'bg-indigo-50 dark:bg-indigo-950/40'
                                : 'bg-gray-50 dark:bg-dark-canvas'
                            }`}
                          >
                            <Text className="w-5 text-center text-xs font-bold text-gray-500">
                              {entry.rank}
                            </Text>
                            {entry.studentAvatarUrl ? (
                              <CachedImage
                                source={{ uri: entry.studentAvatarUrl }}
                                category="avatars"
                                className="h-8 w-8 rounded-full"
                              />
                            ) : (
                              <View className="h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-zinc-700">
                                <Text className="text-xs font-bold text-indigo-700 dark:text-zinc-200">
                                  {entry.studentName.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}
                            <Text
                              numberOfLines={1}
                              className="flex-1 font-bold text-ink dark:text-dark-ink"
                            >
                              {entry.studentName}
                            </Text>
                            <View className="flex-row items-center gap-1">
                              <Star size={12} color="#f59e0b" fill="#f59e0b" />
                              <Text className="font-black text-amber-600 text-xs">
                                {entry.value}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })()
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function TabButton({
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
      <Text className={`font-bold ${active ? 'text-white' : 'text-gray-500'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
