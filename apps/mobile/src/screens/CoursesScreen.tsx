import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, RefreshControl, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {BookOpen, Star, Trophy, Users} from 'lucide-react-native';
import {apiGetMyCourses} from '../api/groups';
import {cachedFirst} from '../lib/storage';
import type {ApiMyCourse} from '../types/api';
import type {RootStackParamList} from '../navigation/types';
import {Empty, Loading, OfflineBanner, Screen, StaleNote} from '../components/Ui';
import {CourseLeaderboardSheet} from '../components/CourseLeaderboardSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'Courses'>;

export function CoursesScreen({navigation, route}: Props) {
  const {schoolId} = route.params;
  const [data, setData] = useState<ApiMyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [leaderboardCourse, setLeaderboardCourse] = useState<ApiMyCourse | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await cachedFirst(`courses:${schoolId}`, () => apiGetMyCourses(schoolId), (fresh) => {
        setData(fresh);
        setStale(false);
      });
      if (r.data) setData(r.data);
      setStale(r.fromCache);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      <OfflineBanner />
      <StaleNote stale={stale} />
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data}
          keyExtractor={x => x.courseId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={<Empty text="Hali hech qanday kursga qo'shilmagansiz" />}
          contentContainerClassName="px-4 pb-6"
          renderItem={({item}) => (
            <View className="mt-3 rounded-3xl bg-white p-5 dark:bg-dark-surface">
              <Pressable
                onPress={() =>
                  navigation.navigate('Course', {courseId: item.courseId, title: item.courseTitle})
                }>
                <View className="flex-row justify-between">
                  <View className="mr-3 flex-1">
                    {item.starsMax > 0 && (
                      <View className="mb-2 flex-row items-center gap-1 self-start rounded-full bg-gray-900 px-2 py-1">
                        <Star size={12} color="white" fill="white" />
                        <Text className="text-xs font-bold text-white">
                          {item.starsEarned} / {item.starsMax}
                        </Text>
                      </View>
                    )}
                    <Text className="text-lg font-extrabold text-ink dark:text-dark-ink">{item.courseTitle}</Text>
                    <Text className="mt-1 text-sm text-slate-400 dark:text-dark-muted">{item.groupName}</Text>
                  </View>
                  <View className="h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-dark-surface-2">
                    <BookOpen size={24} color="#6366f1" />
                  </View>
                </View>
                <View className="mt-6 flex-row gap-4">
                  <View className="flex-row items-center gap-1">
                    <Star size={13} color="#f59e0b" />
                    <Text className="text-xs font-semibold text-slate-600 dark:text-dark-muted">
                      {item.starsEarned}/{item.starsMax}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Users size={13} color="#64748b" />
                    <Text className="text-xs font-semibold text-slate-600 dark:text-dark-muted">
                      {item.studentCount}
                    </Text>
                  </View>
                </View>
                <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-dark-surface-2">
                  <View
                    className="h-full rounded-full bg-brand"
                    style={{width: `${item.progressPercent}%`}}
                  />
                </View>
                <Text className="mt-2 text-xs text-slate-400 dark:text-dark-muted">
                  {item.lessonsCompleted}/{item.lessonsTotal} dars · {item.progressPercent}%
                </Text>
              </Pressable>
              <View className="mt-3 flex-row flex-wrap items-center gap-2">
                <Pressable
                  onPress={() => {
                    setLeaderboardCourse(item);
                    setLeaderboardOpen(true);
                  }}
                  className="flex-row items-center gap-1.5 self-start rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-dark-surface-2">
                  <Trophy size={14} color="#f59e0b" />
                  <Text className="text-xs font-semibold text-slate-700 dark:text-dark-ink">Peshqadamlar</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate('ChallengesList')}
                  className="flex-row items-center gap-1.5 self-start rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-dark-surface-2">
                  <BookOpen size={14} color="#6366f1" />
                  <Text className="text-xs font-semibold text-slate-700 dark:text-dark-ink">Challenge-lar</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
      {leaderboardCourse && (
        <CourseLeaderboardSheet
          visible={leaderboardOpen}
          course={leaderboardCourse}
          onClose={() => setLeaderboardOpen(false)}
        />
      )}
    </Screen>
  );
}
