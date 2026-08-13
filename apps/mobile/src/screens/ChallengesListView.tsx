import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookOpen } from 'lucide-react-native';
import { apiJoinChallenge, apiListMyChallenges } from '../api/challenges';
import { Empty, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import { CachedImage } from '../components/common/CachedImage';
import type { RootStackParamList } from '../navigation/types';
import type { ApiStudentChallenge } from '../types/api';

export function ChallengesListView({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [items, setItems] = useState<ApiStudentChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setItems(await apiListMyChallenges());
    } catch (error) {
      Alert.alert(
        'Xatolik',
        getApiErrorMessage(
          error,
          "Challenge-larni yuklab bo'lmadi. Keyinroq qayta urinib ko'ring.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function open(item: ApiStudentChallenge) {
    if (!item.joined) {
      setJoining(item.id);
      try {
        await apiJoinChallenge(item.id);
        setItems(current =>
          current.map(value =>
            value.id === item.id ? { ...value, joined: true } : value,
          ),
        );
      } catch (error) {
        Alert.alert('Xatolik', getApiErrorMessage(error, "Qo'shilib bo'lmadi"));
        return;
      } finally {
        setJoining(null);
      }
    }
    navigation.navigate('ChallengeDetail', {
      challengeId: item.id,
      title: item.name,
    });
  }
  if (loading) return <Loading />;
  return (
    <Screen>
      {items.length === 0 ? (
        <Empty text="Hozircha challenge yo'q" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          contentContainerClassName="gap-3 p-4"
          renderItem={({ item }) => (
            <Pressable
              disabled={joining === item.id}
              onPress={() => void open(item)}
              className="flex-row items-center gap-3 rounded-2xl bg-white p-3 dark:bg-dark-surface"
            >
              {item.imageUrl ? (
                <CachedImage
                  source={{ uri: item.imageUrl }}
                  category="challenges"
                  className="h-12 w-12 rounded-xl"
                />
              ) : (
                <View className="h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
                  <BookOpen size={20} color="#94a3b8" />
                </View>
              )}
              <View className="flex-1">
                <Text numberOfLines={1} className="text-xs text-gray-400">
                  {item.courseTitle}
                </Text>
                <Text
                  numberOfLines={1}
                  className="font-bold text-ink dark:text-dark-ink"
                >
                  {item.name}
                </Text>
                <Text className="mt-0.5 text-[10px] text-indigo-500">
                  {item.type === 'soz_yodlash' ? "So'z yodlash" : 'Kitobxonlik'}
                </Text>
              </View>
              {!item.joined && (
                <Text className="rounded-full bg-gray-900 px-3 py-2 text-xs font-bold text-white">
                  Qo'shilish
                </Text>
              )}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
