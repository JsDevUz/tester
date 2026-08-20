import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Share, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Link2, Trash2, Upload, Zap } from 'lucide-react-native';
import {
  apiAddDeckWord,
  apiBulkImportDeckWords,
  apiDeleteDeckWord,
  apiListDeckWords,
  type DeckWord,
} from '../api/word-decks';
import { BulkImportWordsSheet } from '../components/BulkImportWordsSheet';
import { Empty, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import { WEB_URL } from '../config/env';
import type { RootStackParamList } from '../navigation/types';
import {cachedFirst} from '../lib/storage';

type Props = NativeStackScreenProps<RootStackParamList, 'WordDeck'>;

export function WordDeckScreen({ route, navigation }: Props) {
  const { deckId, deckName, slug } = route.params;
  const [words, setWords] = useState<DeckWord[] | null>(null);
  const [word, setWord] = useState('');
  const [translation, setTranslation] = useState('');
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await cachedFirst(`deck:${deckId}`, () => apiListDeckWords(deckId), setWords);
      if (r.data) setWords(r.data);
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "So'zlarni yuklab bo'lmadi"));
      setWords([]);
    }
  }, [deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd() {
    if (!word.trim() || !translation.trim() || saving) return;
    setSaving(true);
    try {
      await apiAddDeckWord(deckId, { word: word.trim(), translation: translation.trim() });
      setWord('');
      setTranslation('');
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "So'z qo'shib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkImport(text: string) {
    setImporting(true);
    try {
      const result = await apiBulkImportDeckWords(deckId, text);
      Alert.alert('Import yakunlandi', `${result.added} ta qo'shildi, ${result.skipped} ta o'tkazib yuborildi`);
      setImportOpen(false);
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Import qilib bo'lmadi"));
    } finally {
      setImporting(false);
    }
  }

  function confirmDeleteWord(item: DeckWord) {
    Alert.alert("So'zni o'chirish", undefined, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteDeckWord(deckId, item.id);
            void load();
          } catch (error) {
            Alert.alert('Xatolik', getApiErrorMessage(error, "So'zni o'chirib bo'lmadi"));
          }
        },
      },
    ]);
  }

  if (words === null) return <Loading />;

  return (
    <Screen>
      <View className="flex-row items-center justify-between p-4 pb-0">
        <Pressable onPress={() => setImportOpen(true)} className="flex-row items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 dark:bg-dark-canvas">
          <Upload size={14} color="#475569" />
          <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">Ommaviy import</Text>
        </Pressable>
        <View className="flex-row gap-2">
          <Pressable
            onPress={async () => { await Share.share({ message: `${WEB_URL}/d/${slug}` }); }}
            className="flex-row items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 dark:bg-dark-canvas"
          >
            <Link2 size={14} color="#475569" />
            <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">Ulashish</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('DeckPractice', { slug, deckName })}
            className="flex-row items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2"
          >
            <Zap size={14} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Mashq qilish</Text>
          </Pressable>
        </View>
      </View>

      <View className="m-4 flex-row gap-2 rounded-2xl bg-white p-3 dark:bg-dark-surface">
        <TextInput
          value={word}
          onChangeText={setWord}
          placeholder="So'z"
          placeholderTextColor="#94a3b8"
          className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
        />
        <TextInput
          value={translation}
          onChangeText={setTranslation}
          placeholder="Tarjima"
          placeholderTextColor="#94a3b8"
          className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
        />
        <Pressable
          disabled={!word.trim() || !translation.trim() || saving}
          onPress={() => void handleAdd()}
          className="items-center justify-center rounded-xl bg-gray-900 px-4 disabled:opacity-40 dark:bg-white"
        >
          <Text className="text-xs font-bold text-white dark:text-gray-900">Qo'shish</Text>
        </Pressable>
      </View>

      {words.length === 0 ? (
        <Empty text="Hali so'z yo'q" />
      ) : (
        <FlatList
          data={words}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 px-4 pb-4"
          renderItem={({ item }) => (
            <View className="flex-row items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5 dark:bg-dark-canvas">
              <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-ink dark:text-dark-ink">{item.word}</Text>
              <Text numberOfLines={1} className="flex-1 text-sm text-gray-500 dark:text-gray-400">{item.translation}</Text>
              <Pressable onPress={() => confirmDeleteWord(item)} className="h-7 w-7 items-center justify-center">
                <Trash2 size={15} color="#ef4444" />
              </Pressable>
            </View>
          )}
        />
      )}

      <BulkImportWordsSheet visible={importOpen} onClose={() => setImportOpen(false)} onSubmit={(text) => void handleBulkImport(text)} submitting={importing} />
    </Screen>
  );
}
