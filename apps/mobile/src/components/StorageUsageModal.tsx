import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
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
import {
  BookOpen,
  Check,
  HardDrive,
  Sparkles,
  Trash2,
  Trophy,
  User,
  X,
} from 'lucide-react-native';
import {
  CacheCategory,
  clearCategoryCache,
  formatBytes,
  getStorageUsageBreakdown,
  StorageBreakdown,
} from '../lib/imageCache';

const SPRING = {damping: 22, stiffness: 260, mass: 0.7};

interface CategoryItem {
  key: CacheCategory;
  title: string;
  description: string;
  icon: typeof BookOpen;
  color: string;
  bgColor: string;
  darkBgColor: string;
}

const CATEGORIES: CategoryItem[] = [
  {
    key: 'classroom',
    title: 'Dars materiallari',
    description: 'Jonli darslar va PDF sahifalari',
    icon: BookOpen,
    color: '#6366f1',
    bgColor: 'bg-indigo-50',
    darkBgColor: 'dark:bg-indigo-950/40',
  },
  {
    key: 'avatars',
    title: 'Profil & avatarlar',
    description: 'Foydalanuvchi va ustozlar rasmlari',
    icon: User,
    color: '#0ea5e9',
    bgColor: 'bg-sky-50',
    darkBgColor: 'dark:bg-sky-950/40',
  },
  {
    key: 'challenges',
    title: 'Mashq & challenge rasmlari',
    description: 'So‘z mashqlari va bellashuv bannerlari',
    icon: Trophy,
    color: '#f59e0b',
    bgColor: 'bg-amber-50',
    darkBgColor: 'dark:bg-amber-950/40',
  },
  {
    key: 'general',
    title: 'Umumiy kesh',
    description: 'Boshqa yuklangan vaqtinchalik fayllar',
    icon: Sparkles,
    color: '#10b981',
    bgColor: 'bg-emerald-50',
    darkBgColor: 'dark:bg-emerald-950/40',
  },
];

export function StorageUsageModal({
  visible,
  onClose,
}: {
  visible: boolean;
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
    <StorageUsageContent
      onClose={close}
      pan={pan}
      sheetStyle={sheetStyle}
      backdropStyle={backdropStyle}
    />
  );
}

function StorageUsageContent({
  onClose,
  pan,
  sheetStyle,
  backdropStyle,
}: {
  onClose: () => void;
  pan: ReturnType<typeof Gesture.Pan>;
  sheetStyle: ReturnType<typeof useAnimatedStyle>;
  backdropStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  const [loading, setLoading] = useState(true);
  const [clearingKey, setClearingKey] = useState<string | null>(null);
  const [clearedSuccessKey, setClearedSuccessKey] = useState<string | null>(null);
  const [stats, setStats] = useState<StorageBreakdown>({
    classroom: 0,
    avatars: 0,
    challenges: 0,
    general: 0,
    total: 0,
  });

  const loadStats = useCallback(async () => {
    try {
      const data = await getStorageUsageBreakdown();
      setStats(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadStats();
  }, [loadStats]);

  const handleClear = async (category: CacheCategory | 'all', label: string) => {
    Alert.alert(
      'Keshni tozalash',
      `${label} keshini tozalashni tasdiqlaysizmi? Keyingi safar fayllar qaytadan yuklanadi.`,
      [
        {text: 'Bekor qilish', style: 'cancel'},
        {
          text: 'Tozalash',
          style: 'destructive',
          onPress: async () => {
            setClearingKey(category);
            try {
              await clearCategoryCache(category);
              await loadStats();
              setClearedSuccessKey(category);
              setTimeout(() => setClearedSuccessKey(null), 2000);
            } catch {
              Alert.alert('Xatolik', "Keshni tozalab bo'lmadi.");
            } finally {
              setClearingKey(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>
        <Animated.View style={sheetStyle} className="max-h-[90%] rounded-t-3xl bg-white dark:bg-dark-surface">
          {/* Pan handle */}
          <GestureDetector gesture={pan}>
            <View className="items-center pb-2 pt-3">
              <View className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-dark-border" />
            </View>
          </GestureDetector>

          <View className="px-5">
            {/* Title bar */}
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <View className="h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50">
                  <HardDrive size={16} color="#6366f1" />
                </View>
                <View>
                  <Text className="text-base font-bold text-ink dark:text-dark-ink">
                    Xotiradan foydalanish
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-surface-2">
                <X size={16} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView contentContainerClassName="pb-8" showsVerticalScrollIndicator={false}>
              {/* Total Storage Card */}
              <View className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/30 dark:bg-indigo-950/20">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-dark-muted">
                      Jami egallangan joy
                    </Text>
                    {loading ? (
                      <ActivityIndicator size="small" color="#6366f1" style={{marginTop: 6, alignSelf: 'flex-start'}} />
                    ) : (
                      <Text className="mt-1 text-2xl font-black text-ink dark:text-dark-ink">
                        {formatBytes(stats.total)}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => void handleClear('all', 'Barcha')}
                    disabled={loading || stats.total === 0 || clearingKey === 'all'}
                    className={`flex-row items-center gap-1.5 rounded-xl px-3.5 py-2.5 ${
                      stats.total > 0
                        ? 'bg-red-50 active:bg-red-100 dark:bg-red-500/10'
                        : 'bg-slate-100 opacity-50 dark:bg-dark-surface-2'
                    }`}>
                    {clearingKey === 'all' ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <>
                        <Trash2 size={14} color={stats.total > 0 ? '#ef4444' : '#94a3b8'} />
                        <Text
                          className={`text-xs font-bold ${
                            stats.total > 0 ? 'text-red-500' : 'text-slate-400 dark:text-dark-muted'
                          }`}>
                          Hammasini tozalash
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {/* Storage breakdown progress bar */}
                <View className="mt-3.5 h-2 w-full flex-row overflow-hidden rounded-full bg-slate-200/70 dark:bg-dark-surface-2">
                  {stats.total > 0 ? (
                    CATEGORIES.map(cat => {
                      const size = stats[cat.key];
                      const pct = (size / stats.total) * 100;
                      if (pct <= 0) return null;
                      return (
                        <View
                          key={cat.key}
                          style={{
                            width: `${pct}%`,
                            backgroundColor: cat.color,
                          }}
                        />
                      );
                    })
                  ) : (
                    <View className="h-full w-full bg-slate-200 dark:bg-dark-border" />
                  )}
                </View>
              </View>

              {/* Category breakdown list */}
              <Text className="mb-2.5 text-xs font-bold text-slate-500 dark:text-dark-muted">
                Fayl turlari
              </Text>

              <View className="gap-2.5">
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const size = stats[cat.key];
                  const isClearing = clearingKey === cat.key;
                  const isSuccess = clearedSuccessKey === cat.key;

                  return (
                    <View
                      key={cat.key}
                      className="flex-row items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-dark-border dark:bg-dark-surface-2/60">
                      <View className="flex-1 flex-row items-center gap-3 pr-2">
                        <View
                          className={`h-9 w-9 items-center justify-center rounded-xl ${cat.bgColor} ${cat.darkBgColor}`}>
                          <Icon size={16} color={cat.color} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-xs font-bold text-ink dark:text-dark-ink">
                            {cat.title}
                          </Text>
                          <Text className="text-[10px] text-slate-400 dark:text-dark-muted" numberOfLines={1}>
                            {cat.description}
                          </Text>
                        </View>
                      </View>

                      <View className="items-end gap-1.5">
                        <Text className="text-xs font-bold text-ink dark:text-dark-ink">
                          {loading ? '...' : formatBytes(size)}
                        </Text>
                        <Pressable
                          onPress={() => void handleClear(cat.key, cat.title)}
                          disabled={loading || size === 0 || isClearing}
                          className={`flex-row items-center gap-1 rounded-lg px-2.5 py-1 ${
                            size > 0
                              ? 'bg-white shadow-xs active:bg-slate-50 dark:bg-dark-surface'
                              : 'opacity-40'
                          }`}>
                          {isClearing ? (
                            <ActivityIndicator size="small" color="#64748b" style={{transform: [{scale: 0.7}]}} />
                          ) : isSuccess ? (
                            <Check size={12} color="#10b981" />
                          ) : (
                            <Trash2 size={12} color={size > 0 ? '#64748b' : '#94a3b8'} />
                          )}
                          <Text
                            className={`text-[10px] font-semibold ${
                              isSuccess ? 'text-emerald-500' : size > 0 ? 'text-slate-600 dark:text-dark-muted' : 'text-slate-400'
                            }`}>
                            {isSuccess ? 'Tozalandi' : 'Tozalash'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Informational tip */}
              <View className="mt-5 rounded-2xl bg-slate-50 p-3.5 dark:bg-dark-surface-2/40">
                <Text className="text-[11px] leading-relaxed text-slate-500 dark:text-dark-muted">
                  💡 <Text className="font-semibold text-slate-700 dark:text-dark-ink">Eslatma:</Text> Keshdagi fayllar darslar va rasmlarni darhol (0ms) ochish va internet trafigingizni tejash uchun saqlanadi. Kesh tozalansa, kerakli fayllar keyingi kirishingizda avtomatik qayta yuklanadi.
                </Text>
              </View>
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
