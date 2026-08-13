import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {CheckCircle2, School} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';
import {apiGetSchoolJoinPreview, apiJoinSchool} from '../api/groups';
import {getApiErrorMessage} from '../lib/errors';
import {storage} from '../lib/storage';
import {Loading, Screen} from '../components/Ui';
import type {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SchoolInvite'>;

// Native port of apps/frontend's SchoolInviteJoinPage: preview the school
// behind an invite token, join it, then send the student back to their
// school list (with the cached list dropped so the new school shows up).
export function SchoolInviteScreen({route, navigation}: Props) {
  const {token} = route.params;
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    let cancelled = false;
    apiGetSchoolJoinPreview(token)
      .then(preview => {
        if (!cancelled) setSchoolName(preview.schoolName);
      })
      .catch(() => {
        if (!cancelled) setError('Havola topilmadi yoki muddati tugagan.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const goBackToSchools = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await apiJoinSchool(token);
      // The list is served from cache, so it would still show the old set.
      await storage.remove('schools');
      setJoined(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Maktabga qo'shilishda xatolik yuz berdi."));
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-full max-w-[380px] items-center rounded-3xl bg-white p-6 dark:bg-dark-surface">
          {joined ? (
            <>
              <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/10">
                <CheckCircle2 size={30} color="#10b981" />
              </View>
              <Text className="mb-1 text-center text-lg font-bold text-ink dark:text-dark-ink">
                Muvaffaqiyatli qo'shildingiz!
              </Text>
              {schoolName && (
                <Text className="mb-5 text-center text-sm text-slate-500 dark:text-dark-muted">
                  {schoolName}
                </Text>
              )}
              <Pressable
                onPress={goBackToSchools}
                className="w-full items-center rounded-2xl bg-brand py-3.5">
                <Text className="text-sm font-semibold text-white">Davom etish</Text>
              </Pressable>
            </>
          ) : error ? (
            <>
              <Text className="mb-5 text-center text-sm text-red-500">{error}</Text>
              <Pressable
                onPress={goBackToSchools}
                className="w-full items-center rounded-2xl bg-slate-100 py-3.5 dark:bg-dark-surface-2">
                <Text className="text-sm font-semibold text-slate-700 dark:text-dark-ink">
                  Orqaga qaytish
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-dark-surface-2">
                <School size={30} color={isDark ? '#a5b4fc' : '#6366f1'} />
              </View>
              <Text className="mb-1 text-center text-lg font-bold text-ink dark:text-dark-ink">
                {schoolName}
              </Text>
              <Text className="mb-5 text-center text-sm text-slate-500 dark:text-dark-muted">
                Ushbu maktabga qo'shilasiz
              </Text>
              <Pressable
                onPress={() => void join()}
                disabled={joining}
                className="w-full items-center rounded-2xl bg-brand py-3.5 disabled:opacity-50">
                <Text className="text-sm font-semibold text-white">
                  {joining ? "Qo'shilmoqda..." : "Maktabga qo'shilish"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}
