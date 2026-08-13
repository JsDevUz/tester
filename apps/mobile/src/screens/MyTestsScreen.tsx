import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, useColorScheme as useRNColorScheme, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FolderPlus, Pencil, Trash2 } from 'lucide-react-native';
import {
  apiCreateStudentFolder,
  apiDeleteStudentFolder,
  apiFetchStudentFolders,
  apiUpdateStudentFolder,
  type StudentFolder,
} from '../api/student-tests';
import { NewFolderModal } from '../components/NewFolderModal';
import { Empty, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyTests'>;

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + (255 - ((n >> 8) & 0xff)) * amount));
  const b = Math.min(255, Math.round((n & 0xff) + (255 - (n & 0xff)) * amount));
  return `rgb(${r},${g},${b})`;
}

function MacFolderSvg({ id, color }: { id: string; color?: string }) {
  const base = color ?? '#5B6A8A';
  const light = lighten(base, 0.28);
  const tabLight1 = lighten(base, 0.18);
  const tabLight2 = lighten(base, 0.05);

  return (
    <Svg width={110} height={88} viewBox="0 0 120 96">
      <Defs>
        <LinearGradient id={`body-${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={light} />
          <Stop offset="100%" stopColor={base} />
        </LinearGradient>
        <LinearGradient id={`tab-${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={tabLight1} />
          <Stop offset="100%" stopColor={tabLight2} />
        </LinearGradient>
      </Defs>
      <Path
        d="M6 28C6 24.686 8.686 22 12 22H42C44.5 22 46.8 23.3 48.1 25.4L52 32H108C111.314 32 114 34.686 114 38V84C114 87.314 111.314 90 108 90H12C8.686 90 6 87.314 6 84V28Z"
        fill={`url(#tab-${id})`}
      />
      <Path
        d="M6 38C6 34.686 8.686 32 12 32H108C111.314 32 114 34.686 114 38V84C114 87.314 111.314 90 108 90H12C8.686 90 6 87.314 6 84V38Z"
        fill={`url(#body-${id})`}
      />
      <Path
        d="M6 38C6 34.686 8.686 32 12 32H108C111.314 32 114 34.686 114 38V46H6V38Z"
        fill="white"
        fillOpacity={0.12}
      />
      <Path
        d="M6 78H114V84C114 87.314 111.314 90 108 90H12C8.686 90 6 87.314 6 84V78Z"
        fill="black"
        fillOpacity={0.06}
      />
      <Ellipse cx="60" cy="60" rx="38" ry="18" fill="white" fillOpacity={0.04} />
    </Svg>
  );
}

export function MyTestsScreen({ navigation }: Props) {
  const scheme = useRNColorScheme();
  const isDark = scheme === 'dark';
  const [folders, setFolders] = useState<StudentFolder[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingFolder, setEditingFolder] = useState<StudentFolder | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setCreating(true)}
          className="p-1 active:opacity-60"
        >
          <FolderPlus size={24} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    try {
      setFolders(await apiFetchStudentFolders());
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Papkalarni yuklab bo'lmadi"));
      setFolders([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function handleCreate(name: string, color: string) {
    try {
      await apiCreateStudentFolder(name, color);
      setCreating(false);
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Papka yaratib bo'lmadi"));
    }
  }

  async function handleUpdate(name: string, color: string) {
    if (!editingFolder) return;
    try {
      await apiUpdateStudentFolder(editingFolder.id, { name, color });
      setEditingFolder(null);
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Papkani yangilab bo'lmadi"));
    }
  }

  function confirmDelete(folder: StudentFolder) {
    Alert.alert('Papkani o\'chirish', `"${folder.name}" o'chirilsinmi? Ichidagi barcha testlar ham o'chadi.`, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteStudentFolder(folder.id);
            void load();
          } catch (error) {
            Alert.alert('Xatolik', getApiErrorMessage(error, "Papkani o'chirib bo'lmadi"));
          }
        },
      },
    ]);
  }

  if (folders === null) return <Loading />;

  return (
    <Screen>
      <NewFolderModal
        visible={creating}
        title="Yangi papka"
        onSubmit={handleCreate}
        onClose={() => setCreating(false)}
      />

      <NewFolderModal
        visible={!!editingFolder}
        initial={editingFolder ? { name: editingFolder.name, color: editingFolder.color } : null}
        title="Papkani tahrirlash"
        onSubmit={handleUpdate}
        onClose={() => setEditingFolder(null)}
      />

      {folders.length === 0 ? (
        <Empty text="Hali papka yo'q. Yangisini yarating!" />
      ) : (
        <ScrollView contentContainerClassName="flex-row flex-wrap justify-start gap-4 p-4">
          {folders.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => navigation.navigate('MyTestFolder', { folderId: item.id, folderName: item.name })}
              style={{ width: '47%' }}
              className="flex-col items-center gap-1.5 py-2 active:opacity-70"
            >
              <View className="relative items-center justify-center">
                <MacFolderSvg id={item.id} color={item.color} />

                <View className="absolute -top-2 -right-3 flex-row gap-1.5 z-10">
                  <Pressable
                    onPress={() => setEditingFolder(item)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm border border-gray-200 active:bg-gray-100 dark:bg-dark-surface dark:border-dark-border dark:active:bg-dark-canvas"
                  >
                    <Pencil size={15} color={isDark ? '#f8fafc' : '#334155'} />
                  </Pressable>

                  <Pressable
                    onPress={() => confirmDelete(item)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm border border-gray-200 active:bg-rose-50 dark:bg-dark-surface dark:border-dark-border dark:active:bg-rose-950/40"
                  >
                    <Trash2 size={15} color="#ef4444" />
                  </Pressable>
                </View>
              </View>

              <View className="items-center w-full px-1 mt-0.5">
                <Text className="text-sm font-bold text-center text-ink dark:text-dark-ink" numberOfLines={2}>
                  {item.name}
                </Text>

                <Text className="mt-0.5 text-xs text-gray-400">
                  {item.testCount ?? 0} ta test
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
