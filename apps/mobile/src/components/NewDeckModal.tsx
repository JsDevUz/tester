import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';

interface Props {
  visible: boolean;
  initial?: { name: string } | null;
  title?: string;
  onSubmit: (name: string) => Promise<void> | void;
  onClose: () => void;
}

export function NewDeckModal({
  visible,
  initial,
  title = "Yangi lug'at",
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
    }
  }, [visible, initial]);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch {
      // Handled in parent
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center bg-black/50 p-4"
      >
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="w-full max-w-xs overflow-hidden rounded-3xl bg-white p-5 shadow-2xl dark:bg-dark-surface border border-gray-100 dark:border-dark-border">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-ink dark:text-dark-ink">{title}</Text>
            <Pressable onPress={onClose} className="p-1">
              <X size={20} color="#94a3b8" />
            </Pressable>
          </View>

          <View className="gap-4">
            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder="Lug'at nomi"
              placeholderTextColor="#94a3b8"
              className="rounded-2xl bg-gray-100 px-4 py-3.5 text-sm font-medium text-ink dark:bg-dark-canvas dark:text-dark-ink"
            />

            <View className="flex-row gap-2 pt-2">
              <Pressable
                onPress={onClose}
                className="flex-1 h-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas"
              >
                <Text className="font-bold text-gray-600 dark:text-gray-300 text-sm">Bekor qilish</Text>
              </Pressable>
              <Pressable
                disabled={!name.trim() || saving}
                onPress={() => void handleSave()}
                className="flex-1 h-11 items-center justify-center rounded-xl bg-indigo-600 active:bg-indigo-700 disabled:opacity-50"
              >
                <Text className="font-bold text-white text-sm">
                  {title === "Yangi lug'at" ? 'Yaratish' : 'Saqlash'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
