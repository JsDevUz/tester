import React, {useEffect, useState} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
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
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {ChevronRight, HardDrive, LogOut, Moon, UserRound, X} from 'lucide-react-native';
import {useAuthStore} from '../store/authStore';
import {useThemeStore} from '../store/themeStore';
import {CachedImage} from './common/CachedImage';
import {StorageUsageModal} from './StorageUsageModal';
import type {RootStackParamList} from '../navigation/types';

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
  const [storageModalVisible, setStorageModalVisible] = useState(false);

  const themePreference = useThemeStore(s => s.preference);
  const setThemePreference = useThemeStore(s => s.setPreference);

  /** Closing first keeps the sheet from sitting on top of the screen it pushed. */
  function openScreen(go: () => void) {
    onClose();
    go();
  }

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={sheetStyle}
          className="max-h-[88%] flex-col rounded-t-3xl bg-slate-50 dark:bg-dark-canvas">
          <GestureDetector gesture={pan}>
            <View className="items-center pb-2 pt-3">
              <View className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-dark-border" />
            </View>
          </GestureDetector>

          <View className="flex-col px-4 pb-4">
            <View className="mb-4 flex-row items-center justify-between px-1">
              <Text className="text-lg font-bold text-ink dark:text-dark-ink">Profil</Text>
              <Pressable
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-dark-surface-2">
                <X size={16} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
              {/* Account card -- tapping it opens the editable version of everything here. */}
              <Pressable
                onPress={() => openScreen(() => navigation.navigate('EditProfile'))}
                className="mb-4 flex-row items-center gap-3 rounded-2xl bg-white p-3.5 active:opacity-80 dark:bg-dark-surface">
                <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-indigo-100 dark:bg-dark-surface-2">
                  {user?.avatarUrl ? (
                    <CachedImage
                      source={{uri: user.avatarUrl}}
                      category="avatars"
                      className="h-full w-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <UserRound size={24} color="#6366f1" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-ink dark:text-dark-ink" numberOfLines={1}>
                    {user?.name || 'Foydalanuvchi'}
                  </Text>
                  <Text className="text-xs text-slate-400 dark:text-dark-muted" numberOfLines={1}>
                    {user?.phone}
                    {user?.role ? ` · ${ROLE_LABELS[user.role]}` : ''}
                  </Text>
                </View>
                <ChevronRight size={18} color="#94a3b8" />
              </Pressable>

              <SettingsGroup>
                {/* A switch, not a three-way picker: "follow the system" is a setting people
                    rarely reach for, and the row reads as a simple on/off. */}
                <SettingsToggleRow
                  icon={<Moon size={18} color="#64748b" />}
                  label="Qorong'u rejim"
                  value={themePreference === 'dark'}
                  onValueChange={on => void setThemePreference(on ? 'dark' : 'light')}
                />
                <SettingsRow
                  icon={<HardDrive size={18} color="#64748b" />}
                  label="Xotiradan foydalanish"
                  sublabel="Kesh va yuklangan rasmlar"
                  onPress={() => setStorageModalVisible(true)}
                  isLast
                />
              </SettingsGroup>

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
                className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-white py-3.5 active:opacity-80 dark:bg-dark-surface">
                <LogOut size={16} color="#ef4444" />
                <Text className="text-sm font-bold text-red-500">Chiqish</Text>
              </Pressable>
            </ScrollView>
          </View>
        </Animated.View>
      </View>
      <StorageUsageModal
        visible={storageModalVisible}
        onClose={() => setStorageModalVisible(false)}
      />
    </Modal>
  );
}

/** A rounded card that hairlines separate its rows, like the iOS grouped list style. */
function SettingsGroup({children}: {children: React.ReactNode}) {
  return <View className="overflow-hidden rounded-2xl bg-white dark:bg-dark-surface">{children}</View>;
}

/**
 * Same row shape as SettingsRow but ending in a Switch. `trackColor` is set explicitly so
 * Android renders the iOS-style pill rather than its own Material track.
 */
function SettingsToggleRow({
  icon,
  label,
  sublabel,
  value,
  onValueChange,
  isLast = false,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 px-3.5 py-2.5 ${
        isLast ? '' : 'border-b border-slate-100 dark:border-dark-border'
      }`}>
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-dark-surface-2">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-dark-ink">{label}</Text>
        {sublabel ? (
          <Text className="text-[11px] text-slate-400 dark:text-dark-muted">{sublabel}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{false: '#e2e8f0', true: '#6366f1'}}
        thumbColor="#ffffff"
        ios_backgroundColor="#e2e8f0"
      />
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  sublabel,
  value,
  onPress,
  isLast = false,
  showChevron = true,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  value?: string;
  onPress: () => void;
  isLast?: boolean;
  showChevron?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-3.5 py-3.5 active:opacity-70 ${
        isLast ? '' : 'border-b border-slate-100 dark:border-dark-border'
      }`}>
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-dark-surface-2">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-dark-ink">{label}</Text>
        {sublabel ? (
          <Text className="text-[11px] text-slate-400 dark:text-dark-muted">{sublabel}</Text>
        ) : null}
      </View>
      {value ? (
        <Text className="text-xs text-slate-400 dark:text-dark-muted">{value}</Text>
      ) : null}
      {showChevron ? <ChevronRight size={16} color="#94a3b8" /> : null}
    </Pressable>
  );
}

