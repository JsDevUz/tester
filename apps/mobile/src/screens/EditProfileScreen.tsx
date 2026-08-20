import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {launchImageLibrary} from 'react-native-image-picker';
import {UserRound} from 'lucide-react-native';
import {Input, Screen} from '../components/Ui';
import {CachedImage} from '../components/common/CachedImage';
import {useAuthStore} from '../store/authStore';
import {apiChangePassword, apiUpdateProfile, apiUploadMedia} from '../api/auth';
import {getApiErrorMessage} from '../lib/errors';
import type {RootStackParamList} from '../navigation/types';

/**
 * Everything that edits the account lives here rather than in the profile sheet, which is
 * now a read-only overview that links out to it.
 */
export function EditProfileScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);

  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const nameChanged = name.trim() !== (user?.name ?? '').trim();

  async function saveName() {
    if (!nameChanged) return;
    setSavingName(true);
    try {
      const updated = await apiUpdateProfile({name: name.trim()});
      await setUser(updated);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Ismni saqlab bo'lmadi."));
    } finally {
      setSavingName(false);
    }
  }

  async function changeAvatar() {
    const result = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setUploadingAvatar(true);
    try {
      const uploaded = await apiUploadMedia(
        {uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? 'avatar.jpg'},
        'avatars',
      );
      const updated = await apiUpdateProfile({avatarUrl: uploaded.url});
      await setUser(updated);
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Avatarni yangilab bo'lmadi."));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      Alert.alert('Parol qisqa', "Parol kamida 8 ta belgidan iborat bo'lishi kerak.");
      return;
    }
    setSavingPassword(true);
    try {
      await apiChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Saqlandi', 'Parol muvaffaqiyatli yangilandi.');
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Parolni yangilab bo'lmadi."));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="px-4 pb-10 pt-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => void changeAvatar()}
          className="mb-8 items-center gap-3 self-center">
          <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-indigo-100 dark:bg-dark-surface-2">
            {user?.avatarUrl ? (
              <CachedImage
                source={{uri: user.avatarUrl}}
                category="avatars"
                className="h-full w-full"
                resizeMode="cover"
              />
            ) : (
              <UserRound size={40} color="#6366f1" />
            )}
          </View>
          <Text className="text-xs font-semibold text-brand">
            {uploadingAvatar ? 'Yuklanmoqda...' : 'Rasmni almashtirish'}
          </Text>
        </Pressable>

        <Text className="mb-1.5 text-xs font-bold text-slate-500 dark:text-dark-muted">Ism</Text>
        <Input value={name} onChangeText={setName} containerClassName="mb-3" />
        <Pressable
          onPress={() => void saveName()}
          disabled={!nameChanged || savingName}
          className={`mb-8 items-center rounded-xl py-3 ${
            nameChanged ? 'bg-brand' : 'bg-slate-100 dark:bg-dark-surface-2'
          }`}>
          <Text
            className={`text-sm font-bold ${
              nameChanged ? 'text-white' : 'text-slate-400 dark:text-dark-muted'
            }`}>
            {savingName ? 'Saqlanmoqda...' : 'Ismni saqlash'}
          </Text>
        </Pressable>

        <Text className="mb-3 text-sm font-bold text-ink dark:text-dark-ink">
          Parolni o'zgartirish
        </Text>
        <Text className="mb-1.5 text-xs font-bold text-slate-500 dark:text-dark-muted">
          Joriy parol
        </Text>
        <Input
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          containerClassName="mb-3"
        />
        <Text className="mb-1.5 text-xs font-bold text-slate-500 dark:text-dark-muted">
          Yangi parol
        </Text>
        <Input
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          containerClassName="mb-3"
        />
        <Pressable
          onPress={() => void savePassword()}
          disabled={!currentPassword || !newPassword || savingPassword}
          className="items-center rounded-xl bg-slate-900 py-3 dark:bg-dark-surface-2">
          <Text className="text-sm font-bold text-white dark:text-dark-ink">
            {savingPassword ? 'Saqlanmoqda...' : 'Parolni yangilash'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
