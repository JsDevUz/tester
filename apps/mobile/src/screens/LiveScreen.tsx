import React, { useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Radio } from 'lucide-react-native';
import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Ui';

export function LiveScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [pin, setPin] = useState('');
  const keyboardAccessoryId = 'live-pin-keyboard-toolbar';

  function join() {
    if (pin.length !== 6) return;
    Keyboard.dismiss();
    navigation.navigate('Web', {
      path: `/live/play/${pin}`,
      title: 'Jonli musobaqa',
      onlineRequired: true,
    });
  }

  return (
    <Screen className="bg-white dark:bg-dark-canvas">
      <View className="h-1 flex-row overflow-hidden">
        <View className="flex-1 bg-gray-400" />
        <View className="flex-1 bg-purple-400" />
        <View className="flex-1 bg-pink-400" />
      </View>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View className="flex-1 items-center justify-center px-6 pb-16">
          <View className="mb-6 h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface">
            <Radio size={28} color="#6b7280" />
          </View>
          <Text className="mb-2 text-xl font-bold text-gray-900 dark:text-dark-ink">
            Jonli musobaqaga kirish
          </Text>
          <Text className="mb-8 text-center text-sm text-gray-400">
            Ustoz bergan 6 xonali PIN kodni kiriting
          </Text>
          <TextInput
            autoFocus
            value={pin}
            onChangeText={value => setPin(value.replace(/\D/g, '').slice(0, 6))}
            onSubmitEditing={join}
            keyboardType="number-pad"
            maxLength={6}
            inputAccessoryViewID={
              Platform.OS === 'ios' ? keyboardAccessoryId : undefined
            }
            placeholder="000000"
            placeholderTextColor="#cbd5e1"
            selectionColor="#6366f1"
            className="mb-6 h-20 w-full max-w-[320px] rounded-2xl border border-gray-200 bg-gray-50 px-4 text-center text-4xl font-black tracking-[10px] text-gray-900 dark:border-dark-border dark:bg-dark-surface dark:text-dark-ink"
          />
          <Pressable
            disabled={pin.length !== 6}
            onPress={join}
            className="h-14 w-full max-w-[320px] flex-row items-center justify-center gap-2 rounded-2xl bg-indigo-500 shadow-lg active:bg-indigo-600 disabled:opacity-40"
          >
            <Text className="font-semibold text-white">Kirish</Text>
            <ChevronRight size={18} color="white" />
          </Pressable>
        </View>
      </TouchableWithoutFeedback>
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={keyboardAccessoryId}>
          <View className="flex-row justify-end border-t border-gray-200 bg-gray-100 px-4 py-2">
            <Pressable onPress={Keyboard.dismiss} className="px-2 py-1">
              <Text className="text-base font-semibold text-indigo-600">
                Tayyor
              </Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </Screen>
  );
}
