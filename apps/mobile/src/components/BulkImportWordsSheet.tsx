import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { Button } from './Ui';

const SPRING = { damping: 22, stiffness: 260, mass: 0.7 };

export function BulkImportWordsSheet({
  visible,
  onClose,
  onSubmit,
  submitting,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  submitting: boolean;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [text, setText] = useState('');
  const translateY = useSharedValue(windowHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = windowHeight;
      backdropOpacity.value = withTiming(1, { duration: 220 });
      translateY.value = withSpring(0, SPRING);
    } else if (mounted) {
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withSpring(windowHeight, SPRING, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, windowHeight]);

  function close() {
    onClose();
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) {
        translateY.value = withSpring(windowHeight, SPRING, (finished) => {
          if (finished) runOnJS(close)();
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  if (!mounted) return null;

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 justify-end">
          <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
            <Pressable className="flex-1" onPress={onClose} />
          </Animated.View>
          <Animated.View style={[sheetStyle]} className="rounded-t-3xl bg-white p-5 dark:bg-dark-surface">
            <GestureDetector gesture={pan}>
              <View className="items-center pb-3">
                <View className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-dark-border" />
              </View>
            </GestureDetector>
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-base font-bold text-ink dark:text-dark-ink">Ommaviy import</Text>
              <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-surface-2">
                <X size={16} color="#475569" />
              </Pressable>
            </View>
            <Text className="mb-3 text-xs text-gray-400">Har qatorda: so'z - tarjima</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              numberOfLines={8}
              placeholder={'apple - olma\nbook - kitob'}
              placeholderTextColor="#94a3b8"
              className="mb-4 h-40 rounded-2xl bg-gray-100 p-3 text-sm text-ink dark:bg-dark-canvas dark:text-dark-ink"
              textAlignVertical="top"
            />
            <Button
              title="Import qilish"
              loading={submitting}
              disabled={!text.trim()}
              onPress={() => {
                onSubmit(text);
                setText('');
              }}
            />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
