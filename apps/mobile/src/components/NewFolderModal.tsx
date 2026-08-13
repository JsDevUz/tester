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

const COLORS = [
  '#6366f1',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#6B7280',
  '#1f2937',
];

interface Props {
  visible: boolean;
  initial?: { name: string; color?: string } | null;
  title?: string;
  onSubmit: (name: string, color: string) => Promise<void> | void;
  onClose: () => void;
}

export function NewFolderModal({
  visible,
  initial,
  title = 'Yangi papka',
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? COLORS[0]);
    }
  }, [visible, initial]);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(name.trim(), color);
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
              placeholder="Papka nomi"
              placeholderTextColor="#94a3b8"
              className="rounded-2xl bg-gray-100 px-4 py-3.5 text-sm font-medium text-ink dark:bg-dark-canvas dark:text-dark-ink"
            />

            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gray-400">Rang tanlang</Text>
              <View className="flex-row flex-wrap gap-2.5 pt-1">
                {COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    style={{
                      backgroundColor: c,
                      borderWidth: color === c ? 3 : 0,
                      borderColor: '#ffffff',
                    }}
                    className={`h-8 w-8 rounded-full ${
                      color === c ? 'shadow-md scale-110' : 'opacity-80'
                    }`}
                  />
                ))}
              </View>
            </View>

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
                  {title === 'Yangi papka' ? 'Yaratish' : 'Saqlash'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
