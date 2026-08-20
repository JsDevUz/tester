import React, {useEffect, useState} from 'react';
import {
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
import {launchImageLibrary} from 'react-native-image-picker';
import {ChevronRight, HardDrive, LogOut, Moon, Phone, Smartphone, Sun, UserRound, X} from 'lucide-react-native';
import {Input} from './Ui';
import {useAuthStore} from '../store/authStore';
import {useThemeStore, type ThemePreference} from '../store/themeStore';
import {apiChangePassword, apiUpdateProfile, apiUploadMedia} from '../api/auth';
import {getApiErrorMessage} from '../lib/errors';
import {CachedImage} from './common/CachedImage';
import {StorageUsageModal} from './StorageUsageModal';

const ROLE_LABELS: Record<string, string> = {
  student: "O'quvchi",
  teacher: "O'qituvchi",
  curator: 'Kurator',
  super: 'Super admin',
};

const SPRING = {damping: 22, stiffness: 260, mass: 0.7};

export function ProfileSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  if (!mounted) return null;

  return (
    <ProfileSheetContent
      visible={visible}
      onClose={onClose}
      onClosed={() => setMounted(false)}
    />
  );
}

function ProfileSheetContent({
  visible,
  onClose,
  onClosed,
}: {
  visible: boolean;
  onClose: () => void;
  onClosed: () => void;
}) {
  const {height: windowHeight} = useWindowDimensions();
  const translateY = useSharedValue(windowHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, {duration: 220});
      translateY.value = withSpring(0, SPRING);
    } else {
      backdropOpacity.value = withTiming(0, {duration: 180});
      translateY.value = withSpring(windowHeight, SPRING, finished => {
        if (finished) runOnJS(onClosed)();
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
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const setUser = useAuthStore(s => s.setUser);
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [storageModalVisible, setStorageModalVisible] = useState(false);

  const nameChanged = name.trim() !== (user?.name ?? '').trim();

  async function saveName() {
    if (!nameChanged) return;
    setSavingName(true);
    try {
      const updated = await apiUpdateProfile({name: name.trim()});
      await setUser(updated);
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

  const themePreference = useThemeStore(s => s.preference);
  const setThemePreference = useThemeStore(s => s.setPreference);

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>
        <Animated.View style={sheetStyle} className="max-h-[88%] rounded-t-3xl bg-white flex-col dark:bg-dark-surface">
          <GestureDetector gesture={pan}>
            <View className="items-center pb-2 pt-3">
              <View className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-dark-border" />
            </View>
          </GestureDetector>
          <View className="flex-col px-5 pb-4">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-ink dark:text-dark-ink">Sozlamalar</Text>
              <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-surface-2">
                <X size={16} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => void changeAvatar()}
                className="mb-6 items-center gap-3 self-center">
                <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-indigo-100 dark:bg-dark-surface-2">
                  {user?.avatarUrl ? (
                    <CachedImage source={{uri: user.avatarUrl}} category="avatars" className="h-full w-full" resizeMode="cover" />
                  ) : (
                    <UserRound size={34} color="#6366f1" />
                  )}
                </View>
                <Text className="text-xs font-semibold text-brand">
                  {uploadingAvatar ? 'Yuklanmoqda...' : 'Rasmni almashtirish'}
                </Text>
              </Pressable>

              <View className="mb-2 flex-row items-center gap-1.5">
                <Phone size={11} color="#94a3b8" />
                <Text className="text-xs text-slate-400 dark:text-dark-muted">{user?.phone}</Text>
              </View>
              {user?.role && (
                <Text className="mb-4 text-xs text-slate-400 dark:text-dark-muted">{ROLE_LABELS[user.role]}</Text>
              )}

              <Text className="mb-1.5 text-xs font-bold text-slate-500 dark:text-dark-muted">Ism</Text>
              <Input value={name} onChangeText={setName} containerClassName="mb-2" />
              <Pressable
                onPress={() => void saveName()}
                disabled={!nameChanged || savingName}
                className={`mb-6 items-center rounded-xl py-2.5 ${nameChanged ? 'bg-brand' : 'bg-slate-100 dark:bg-dark-surface-2'}`}>
                <Text className={`text-xs font-bold ${nameChanged ? 'text-white' : 'text-slate-400 dark:text-dark-muted'}`}>
                  {savingName ? 'Saqlanmoqda...' : 'Ismni saqlash'}
                </Text>
              </Pressable>

              <Text className="mb-1.5 text-xs font-bold text-slate-500 dark:text-dark-muted">Mavzu</Text>
              <ThemeToggle value={themePreference} onChange={p => void setThemePreference(p)} />

              <Text className="mb-1.5 mt-6 text-xs font-bold text-slate-500 dark:text-dark-muted">Xotira</Text>
              <Pressable
                onPress={() => setStorageModalVisible(true)}
                className="mb-6 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-dark-border dark:bg-dark-surface-2/70 active:opacity-80">
                <View className="flex-row items-center gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
                    <HardDrive size={18} color="#6366f1" />
                  </View>
                  <View>
                    <Text className="text-xs font-bold text-ink dark:text-dark-ink">
                      Xotiradan foydalanish
                    </Text>
                    <Text className="text-[11px] text-slate-400 dark:text-dark-muted">
                      Kesh va yuklangan rasmlar
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#94a3b8" />
              </Pressable>

              <Text className="mb-1.5 text-xs font-bold text-slate-500 dark:text-dark-muted">Joriy parol</Text>
              <Input value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry containerClassName="mb-2" />

              <Text className="mb-1.5 text-xs font-bold text-slate-500 dark:text-dark-muted">Yangi parol</Text>
              <Input value={newPassword} onChangeText={setNewPassword} secureTextEntry containerClassName="mb-2" />
              <Pressable
                onPress={() => void savePassword()}
                disabled={!currentPassword || !newPassword || savingPassword}
                className="mb-8 items-center rounded-xl bg-slate-900 py-2.5 dark:bg-dark-surface-2">
                <Text className="text-xs font-bold text-white dark:text-dark-ink">
                  {savingPassword ? 'Saqlanmoqda...' : 'Parolni yangilash'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  Alert.alert('Chiqish', 'Hisobdan chiqmoqchimisiz?', [
                    {text: 'Bekor qilish'},
                    {
                      text: 'Chiqish',
                      style: 'destructive',
                      onPress: () => {
                        onClose();
                        void logout();
                      },
                    },
                  ])
                }
                className="flex-row items-center justify-center gap-2 rounded-xl bg-red-50 py-3 dark:bg-red-500/10">
                <LogOut size={16} color="#ef4444" />
                <Text className="text-sm font-bold text-red-500">Chiqish</Text>
              </Pressable>
            </ScrollView>
          </View>
        </Animated.View>
      </View>
      <StorageUsageModal visible={storageModalVisible} onClose={() => setStorageModalVisible(false)} />
    </Modal>
  );
}

const THEME_OPTIONS: Array<{value: ThemePreference; label: string; icon: typeof Sun}> = [
  {value: 'light', label: "Yorug'", icon: Sun},
  {value: 'dark', label: 'Qorong\'u', icon: Moon},
  {value: 'system', label: 'Tizim', icon: Smartphone},
];

function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (preference: ThemePreference) => void;
}) {
  return (
    <View className="flex-row gap-2">
      {THEME_OPTIONS.map(opt => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={`flex-1 items-center gap-1.5 rounded-xl border py-2.5 ${
              active
                ? 'border-brand bg-brand/10'
                : 'border-slate-200 dark:border-dark-border'
            }`}>
            <Icon size={16} color={active ? '#6366f1' : '#94a3b8'} />
            <Text
              className={`text-[11px] font-semibold ${
                active ? 'text-brand' : 'text-slate-400 dark:text-dark-muted'
              }`}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
