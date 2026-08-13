import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Share, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Clock, Link2, Pencil, Plus, Settings2, Shuffle, Trash2 } from 'lucide-react-native';
import {
  apiCreateStudentTest,
  apiDeleteStudentTest,
  apiFetchStudentTests,
  apiUpdateStudentTest,
  type CreateStudentTestData,
  type StudentTest,
} from '../api/student-tests';
import { StudentTestSettingsModal } from '../components/StudentTestSettingsModal';
import { Empty, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import { WEB_URL } from '../config/env';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyTestFolder'>;

export function MyTestFolderScreen({ route, navigation }: Props) {
  const { folderId } = route.params;
  const [tests, setTests] = useState<StudentTest[] | null>(null);
  const [editingTest, setEditingTest] = useState<StudentTest | null>(null);

  const load = useCallback(async () => {
    try {
      setTests(await apiFetchStudentTests(folderId));
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Testlarni yuklab bo'lmadi"));
      setTests([]);
    }
  }, [folderId]);

  function promptCreateTest() {
    Alert.prompt?.(
      'Yangi test',
      'Test nomini kiriting:',
      async (text) => {
        if (!text?.trim()) return;
        try {
          const test = await apiCreateStudentTest({ folderId, name: text.trim() });
          navigation.navigate('MyTestQuestionEditor', { testId: test.id, testName: test.name });
        } catch (error) {
          Alert.alert('Xatolik', getApiErrorMessage(error, "Test yaratib bo'lmadi"));
        }
      },
      'plain-text',
    );
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={promptCreateTest}
          className="p-1 active:opacity-60"
        >
          <Plus size={24} color="#6366f1" />
        </Pressable>
      ),
    });
  }, [navigation, folderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function handleUpdate(data: CreateStudentTestData) {
    if (!editingTest) return;
    try {
      await apiUpdateStudentTest(editingTest.id, data);
      setEditingTest(null);
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Test sozlamalarini saqlab bo'lmadi"));
    }
  }

  function confirmDelete(test: StudentTest) {
    Alert.alert("Testni o'chirish", `"${test.name}" o'chirilsinmi?`, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteStudentTest(test.id);
            void load();
          } catch (error) {
            Alert.alert('Xatolik', getApiErrorMessage(error, "Testni o'chirib bo'lmadi"));
          }
        },
      },
    ]);
  }

  async function shareLink(test: StudentTest) {
    if (!test.slug) return;
    await Share.share({ message: `${WEB_URL}/t/${test.slug}` });
  }

  function startTest(test: StudentTest) {
    if (!test.slug) {
      Alert.alert('Xatolik', 'Test uchun havola (slug) mavjud emas');
      return;
    }
    navigation.navigate('TestTaker', {
      slug: test.slug,
      title: test.name,
      practiceMode: false,
    });
  }

  if (tests === null) return <Loading />;

  return (
    <Screen>
      <StudentTestSettingsModal
        visible={!!editingTest}
        folderId={folderId}
        initial={editingTest}
        title="Test sozlamalari"
        onSubmit={handleUpdate}
        onClose={() => setEditingTest(null)}
      />

      {tests.length === 0 ? (
        <Empty text="Hali testlar yo'q. Yangisini yarating!" />
      ) : (
        <FlatList
          data={tests}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-4 p-4"
          renderItem={({ item }) => (
            <View className="overflow-hidden rounded-3xl bg-white shadow-md border border-gray-200 dark:bg-dark-surface dark:border-dark-border">
              {/* Header section — Clicking starts the test! */}
              <Pressable onPress={() => startTest(item)} className="p-4 active:opacity-75">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  TEST
                </Text>
                <Text className="mt-1 text-base font-bold text-ink dark:text-dark-ink" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="mt-1 text-xs text-gray-400" numberOfLines={2}>
                  {item.description || " "}
                </Text>
              </Pressable>

              {/* Dark action bar */}
              <View className="h-12 bg-gray-900 dark:bg-dark-canvas px-2 flex-row items-center justify-around">
                <Pressable
                  onPress={() => navigation.navigate('MyTestQuestionEditor', { testId: item.id, testName: item.name })}
                  className="h-9 flex-1 items-center justify-center rounded-xl active:bg-white/10"
                >
                  <Pencil size={17} color="#94a3b8" />
                </Pressable>
                <Pressable
                  onPress={() => setEditingTest(item)}
                  className="h-9 flex-1 items-center justify-center rounded-xl active:bg-white/10"
                >
                  <Settings2 size={17} color="#94a3b8" />
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(item)}
                  className="h-9 flex-1 items-center justify-center rounded-xl active:bg-white/10"
                >
                  <Trash2 size={17} color="#f87171" />
                </Pressable>
              </View>

              {/* Info section — Clicking starts the test! */}
              <Pressable onPress={() => startTest(item)} className="p-4 gap-2 active:opacity-75">
                <View className="flex-row items-center gap-2">
                  <Clock size={13} color="#94a3b8" />
                  <Text className="text-xs text-gray-600 dark:text-gray-300">
                    {item.timeLimit ? `${item.timeLimit} daqiqa` : 'Vaqt cheklanmagan'}
                  </Text>
                </View>

                <View className="flex-row items-center gap-2">
                  <Shuffle size={13} color="#94a3b8" />
                  <Text className="text-xs text-gray-600 dark:text-gray-300">
                    {item.shuffleQuestions ? 'Savollar aralashtiriladi' : 'Savollar tartibli'}
                  </Text>
                </View>

                {item.slug ? (
                  <Pressable
                    onPress={() => void shareLink(item)}
                    className="flex-row items-center gap-2 active:opacity-70 mt-1"
                  >
                    <Link2 size={13} color="#94a3b8" />
                    <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      Havola nusxalash
                    </Text>
                  </Pressable>
                ) : (
                  <View className="flex-row items-center gap-2 mt-1">
                    <Link2 size={13} color="#cbd5e1" />
                    <Text className="text-xs text-gray-300 dark:text-gray-600">Havola yo'q</Text>
                  </View>
                )}
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
