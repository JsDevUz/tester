import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import type { CreateStudentTestData, StudentTest } from '../api/student-tests';

interface Props {
  visible: boolean;
  folderId: string;
  initial?: StudentTest | null;
  title?: string;
  onSubmit: (data: CreateStudentTestData) => Promise<void>;
  onClose: () => void;
}

export function StudentTestSettingsModal({
  visible,
  folderId,
  initial,
  title = 'Yangi test',
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hasTimeLimit, setHasTimeLimit] = useState(false);
  const [timeLimit, setTimeLimit] = useState('30');
  const [showResults, setShowResults] = useState<'immediately' | 'per_question' | 'hidden'>('immediately');
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [oneByOne, setOneByOne] = useState(false);
  const [autoCompleteOnLeave, setAutoCompleteOnLeave] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setHasTimeLimit(!!initial?.timeLimit);
      setTimeLimit(initial?.timeLimit ? String(initial.timeLimit) : '30');
      setShowResults((initial?.showResults as 'immediately' | 'per_question' | 'hidden') ?? 'immediately');
      setShuffleQuestions(initial?.shuffleQuestions ?? false);
      setShuffleOptions(initial?.shuffleOptions ?? false);
      setOneByOne(initial?.oneByOne ?? false);
      setAutoCompleteOnLeave(initial?.autoCompleteOnLeave ?? true);
    }
  }, [visible, initial]);

  const isPerQuestion = showResults === 'per_question';

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        folderId,
        name: name.trim(),
        description: description.trim() || undefined,
        timeLimit: hasTimeLimit && Number(timeLimit) > 0 ? Number(timeLimit) : undefined,
        showResults,
        shuffleQuestions,
        shuffleOptions,
        oneByOne: isPerQuestion ? true : oneByOne,
        autoCompleteOnLeave,
      });
      onClose();
    } catch {
      // Error handled in parent
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
        <View className="max-h-[85%] w-full max-w-md overflow-hidden rounded-3xl bg-white p-5 shadow-2xl dark:bg-dark-surface border border-gray-100 dark:border-dark-border">
          <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-dark-border">
            <Text className="text-lg font-bold text-ink dark:text-dark-ink">{title}</Text>
            <Pressable onPress={onClose} className="p-1">
              <X size={20} color="#94a3b8" />
            </Pressable>
          </View>

          <ScrollView className="gap-4" showsVerticalScrollIndicator={false}>
            {/* Test Nomi */}
            <View>
              <Text className="text-xs font-semibold text-gray-500 mb-1">Test nomi *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="masalan: Matematika"
                placeholderTextColor="#94a3b8"
                className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-medium text-ink dark:bg-dark-canvas dark:text-dark-ink"
              />
            </View>

            {/* Tavsif */}
            <View>
              <Text className="text-xs font-semibold text-gray-500 mb-1">Tavsif</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Ixtiyoriy tavsif"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={2}
                className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-medium text-ink dark:bg-dark-canvas dark:text-dark-ink"
              />
            </View>

            {/* Vaqt chegarasi */}
            <View className="flex-row items-center justify-between py-1">
              <Text className="text-sm font-medium text-ink dark:text-dark-ink">Vaqt chegarasi</Text>
              <Switch value={hasTimeLimit} onValueChange={setHasTimeLimit} trackColor={{ true: '#6366f1' }} />
            </View>

            {hasTimeLimit && (
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={timeLimit}
                  onChangeText={setTimeLimit}
                  keyboardType="numeric"
                  placeholder="30"
                  placeholderTextColor="#94a3b8"
                  className="w-24 rounded-xl bg-gray-100 px-3 py-2 text-center text-sm font-bold text-ink dark:bg-dark-canvas dark:text-dark-ink"
                />
                <Text className="text-xs text-gray-500">daqiqa</Text>
              </View>
            )}

            {/* Natijalarni ko'rsatish */}
            <View>
              <Text className="text-xs font-semibold text-gray-500 mb-2">Natijalarni ko'rsatish</Text>
              <View className="gap-1.5">
                {[
                  { key: 'immediately', label: 'Topshirilgandan keyin darhol' },
                  { key: 'per_question', label: "Har bir savolda javobni ko'rsat (birin-ketin)" },
                  { key: 'hidden', label: "Ko'rsatilmasin" },
                ].map((opt) => (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      const v = opt.key as any;
                      setShowResults(v);
                      if (v === 'per_question') setOneByOne(true);
                    }}
                    className={`flex-row items-center gap-2.5 rounded-xl border p-3 ${
                      showResults === opt.key
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-gray-200 dark:border-dark-border'
                    }`}
                  >
                    <View
                      className={`h-4 w-4 rounded-full border items-center justify-center ${
                        showResults === opt.key ? 'border-indigo-600 bg-indigo-600' : 'border-gray-400'
                      }`}
                    >
                      {showResults === opt.key && <View className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </View>
                    <Text className="text-xs font-medium text-ink dark:text-dark-ink flex-1">{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Switches / Checkboxes */}
            <View className="gap-3 pt-1">
              <View className="flex-row items-center justify-between">
                <Text className={`text-xs font-medium flex-1 mr-2 ${isPerQuestion ? 'text-gray-400' : 'text-ink dark:text-dark-ink'}`}>
                  Savollarni birin-ketin ko'rsatish{isPerQuestion ? ' (avtomatik)' : ''}
                </Text>
                <Switch
                  disabled={isPerQuestion}
                  value={isPerQuestion ? true : oneByOne}
                  onValueChange={setOneByOne}
                  trackColor={{ true: '#6366f1' }}
                />
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-medium text-ink dark:text-dark-ink flex-1 mr-2">
                  Savollar tartibini aralashtirish
                </Text>
                <Switch value={shuffleQuestions} onValueChange={setShuffleQuestions} trackColor={{ true: '#6366f1' }} />
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-medium text-ink dark:text-dark-ink flex-1 mr-2">
                  Javob variantlarini aralashtirish
                </Text>
                <Switch value={shuffleOptions} onValueChange={setShuffleOptions} trackColor={{ true: '#6366f1' }} />
              </View>

              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Text className="text-xs font-medium text-ink dark:text-dark-ink">
                    Testdan chiqilganda avtomatik yakunlash
                  </Text>
                  <Text className="text-[10px] text-gray-400 mt-0.5">
                    Boshqa ilovaga o'tilsa, test avtomatik topshiriladi.
                  </Text>
                </View>
                <Switch value={autoCompleteOnLeave} onValueChange={setAutoCompleteOnLeave} trackColor={{ true: '#6366f1' }} />
              </View>
            </View>

            {/* Actions */}
            <View className="flex-row gap-2 pt-2 mt-2">
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
                  {title === 'Yangi test' ? 'Yaratish' : 'Saqlash'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
