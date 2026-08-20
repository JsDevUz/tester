import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, RefreshControl, Text, TextInput, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {BookOpen, ChevronRight, Search, ThumbsUp, Trophy} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {api} from '../lib/api';
import {cachedFirst} from '../lib/storage';
import type {Submission} from '../types/api';
import type {RootStackParamList} from '../navigation/types';
import {Empty, Input, Loading, OfflineBanner, Screen, StaleNote} from '../components/Ui';
import {TAB_BAR_CLEARANCE} from '../navigation/tabBarLayout';

// Accepts either a bare test code or a full jamm.uz/t/<code> link (with any
// query string) - the deep link is the natural thing a curator shares, but
// the deep link itself may not resolve on this device, so this input is the
// fallback path to the same test.
function extractTestCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/t\/([^/?#\s]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

export function HistoryScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [data, setData] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      const r = await cachedFirst('submissions', async () => {
        const res = await api.get('/me/submissions', {params: {limit: 100, offset: 0}});
        return res.data as Submission[];
      }, (fresh) => {
        setData(fresh);
        setStale(false);
      });
      if (r.data) setData(r.data);
      setStale(r.fromCache);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openTestByCode() {
    const code = extractTestCode(codeInput);
    if (!code) return;
    setCodeInput('');
    navigation.navigate('TestTaker', {
      slug: code,
      title: 'Test',
      practiceMode: false,
    });
  }

  return (
    <Screen>
      <View style={{paddingTop: insets.top + 20}} className="bg-white px-5 pb-4 dark:bg-dark-canvas">
        <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink">Amaliyotlar</Text>
        <View className="mt-4 flex-row items-center gap-2">
          <Input
            value={codeInput}
            onChangeText={setCodeInput}
            onSubmitEditing={openTestByCode}
            placeholder="Test kodini kiriting"
            placeholderTextColor={isDark ? '#a4a7b2' : '#94a3b8'}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            containerClassName="flex-1"
          />
          <Pressable
            onPress={openTestByCode}
            disabled={!extractTestCode(codeInput)}
            className="h-12 w-12 items-center justify-center rounded-xl bg-brand disabled:opacity-40">
            <Search size={19} color="white" />
          </Pressable>
        </View>
      </View>
      <OfflineBanner />
      <StaleNote stale={stale} />
      <Text className="px-4 pt-4 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-dark-muted">
        Amaliyotlar tarixi
      </Text>
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data}
          keyExtractor={x => x.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={<Empty text="Hali ishlangan testlar yo'q" />}
          contentContainerClassName="px-4"
          contentContainerStyle={{paddingBottom: TAB_BAR_CLEARANCE}}
          renderItem={({item}) => {
            const pct = item.total ? Math.round(((item.score ?? 0) / item.total) * 100) : 0;
            const isGood = pct >= 70;
            const isMid = pct >= 40 && pct < 70;
            const iconBg = isGood
              ? 'bg-emerald-50 dark:bg-emerald-500/10'
              : isMid
                ? 'bg-amber-50 dark:bg-amber-500/10'
                : 'bg-red-50 dark:bg-red-500/10';
            const iconColor = isGood ? '#34d399' : isMid ? '#fbbf24' : '#fca5a5';
            const pctColor = isGood
              ? 'text-emerald-500 dark:text-emerald-400'
              : isMid
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-red-400 dark:text-red-400';
            return (
              <Pressable
                onPress={() =>
                  navigation.navigate('TestResult', {
                    submissionId: item.id,
                    title: item.testName ?? 'Natija',
                    practiceMode: false,
                  })
                }
                className="mt-3 flex-row items-center rounded-2xl bg-white p-4 dark:bg-dark-surface">
                <View className={`h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}>
                  {isGood ? (
                    <Trophy size={18} color={iconColor} />
                  ) : isMid ? (
                    <ThumbsUp size={18} color={iconColor} />
                  ) : (
                    <BookOpen size={18} color={iconColor} />
                  )}
                </View>
                <View className="ml-3 min-w-0 flex-1">
                  <Text className="font-bold text-ink dark:text-dark-ink" numberOfLines={1}>
                    {item.testName ?? 'Test'}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-400 dark:text-dark-muted">
                    {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'Topshirilmagan'}
                  </Text>
                </View>
                <View className="mr-2 shrink-0 items-end">
                  <Text className={`font-extrabold ${pctColor}`}>{pct}%</Text>
                  <Text className="text-xs text-slate-400 dark:text-dark-muted">
                    {item.score ?? 0}/{item.total ?? 0}
                  </Text>
                </View>
                <ChevronRight size={17} color="#cbd5e1" />
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
