import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, Image, Pressable, RefreshControl, Text, TextInput, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {ChevronDown, ChevronUp, School, Search, Users, X} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {apiGetMySchools} from '../api/groups';
import {cachedFirst} from '../lib/storage';
import type {ApiMySchool} from '../types/api';
import type {RootStackParamList} from '../navigation/types';
import {Empty, Input, Loading, OfflineBanner, Screen, StaleNote} from '../components/Ui';
import {LiveClassBanner} from '../components/LiveClassBanner';
import {CachedImage} from '../components/common/CachedImage';
import {TAB_BAR_CLEARANCE} from '../navigation/tabBarLayout';

export function SchoolsScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [data, setData] = useState<ApiMySchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Accepts either a full /school-invite/<token> link (what a school shares)
  // or the bare token pasted on its own.
  function extractInviteToken(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/\/school-invite\/([^/?#\s]+)/);
    if (match) return match[1];
    if (/^[A-Za-z0-9-]+$/.test(trimmed)) return trimmed;
    return null;
  }

  function openInvite() {
    const inviteToken = extractInviteToken(inviteInput);
    if (!inviteToken) return;
    setInviteInput('');
    setInviteOpen(false);
    navigation.navigate('SchoolInvite', {token: inviteToken});
  }

  const load = useCallback(async () => {
    try {
      // Cache-first: paint whatever was saved last time immediately, then refresh underneath.
      // Waiting for the round trip before showing anything is what made every tap feel slow.
      const r = await cachedFirst('schools', apiGetMySchools, (fresh) => {
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

  return (
    <Screen>
      <View style={{paddingTop: insets.top + 20}} className="bg-white px-5 pb-4 dark:bg-dark-canvas">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink">
            Mening maktablarim
          </Text>
          <Pressable
            onPress={() => setInviteOpen(open => !open)}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-xl">
            {inviteOpen ? (
              <X size={19} color={isDark ? '#a4a7b2' : '#64748b'} />
            ) : (
              <Search size={19} color={isDark ? '#a4a7b2' : '#64748b'} />
            )}
          </Pressable>
        </View>
        {inviteOpen && (
          <View className="mt-4 flex-row items-center gap-2">
            <Input
              autoFocus
              value={inviteInput}
              onChangeText={setInviteInput}
              onSubmitEditing={openInvite}
              placeholder="Taklif havolasi yoki kodi"
              placeholderTextColor={isDark ? '#a4a7b2' : '#94a3b8'}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              containerClassName="flex-1"
            />
            <Pressable
              onPress={openInvite}
              disabled={!extractInviteToken(inviteInput)}
              className="h-12 w-12 items-center justify-center rounded-xl bg-brand disabled:opacity-40">
              <Search size={19} color="white" />
            </Pressable>
          </View>
        )}
      </View>
      <OfflineBanner />
      <LiveClassBanner />
      <StaleNote stale={stale} />
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
          ListEmptyComponent={<Empty text="Hali hech qanday maktabga qo'shilmagansiz" />}
          contentContainerClassName="px-4"
          contentContainerStyle={{paddingBottom: TAB_BAR_CLEARANCE}}
          renderItem={({item}) => {
            const expanded = expandedIds.has(item.id);
            return (
              <Pressable
                onPress={() => navigation.navigate('Courses', {schoolId: item.id, schoolName: item.name})}
                className="mt-3 rounded-3xl bg-white p-5 dark:bg-dark-surface">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-indigo-50 dark:bg-dark-surface-2">
                    {item.imageUrl ? (
                      <CachedImage source={{uri: item.imageUrl}} category="general" className="h-full w-full" resizeMode="cover" />
                    ) : (
                      <School size={24} color="#6366f1" />
                    )}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-lg font-extrabold text-ink dark:text-dark-ink" numberOfLines={2}>
                      {item.name}
                    </Text>
                    <View className="mt-1 flex-row items-center gap-1.5">
                      <Users size={14} color={isDark ? '#a4a7b2' : '#64748b'} />
                      <Text className="text-xs font-semibold text-slate-500 dark:text-dark-muted">
                        {item.studentCount}
                      </Text>
                    </View>
                  </View>
                </View>
                {item.description ? (
                  <>
                    <Text
                      className="mt-3 text-sm text-slate-400 dark:text-dark-muted"
                      numberOfLines={expanded ? undefined : 3}>
                      {item.description}
                    </Text>
                    <Pressable
                      onPress={() => toggleExpanded(item.id)}
                      hitSlop={8}
                      className="mt-1 flex-row items-center gap-1 self-start">
                      <Text className="text-xs font-semibold text-slate-400 dark:text-dark-muted">
                        {expanded ? 'Kamroq' : "Ko'proq"}
                      </Text>
                      {expanded ? (
                        <ChevronUp size={14} color={isDark ? '#a4a7b2' : '#94a3b8'} />
                      ) : (
                        <ChevronDown size={14} color={isDark ? '#a4a7b2' : '#94a3b8'} />
                      )}
                    </Pressable>
                  </>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
