import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Languages, MoreVertical, Plus } from 'lucide-react-native';
import {
  apiCreateWordDeck,
  apiDeleteWordDeck,
  apiFetchWordDecks,
  apiUpdateWordDeck,
  type WordDeck,
} from '../api/word-decks';
import { NewDeckModal } from '../components/NewDeckModal';
import { Empty, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyDictionaries'>;

export function MyDictionariesScreen({ navigation }: Props) {
  const [decks, setDecks] = useState<WordDeck[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingDeck, setEditingDeck] = useState<WordDeck | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => setCreating(true)} className="p-1 active:opacity-60">
          <Plus size={24} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    try {
      setDecks(await apiFetchWordDecks());
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Lug'atlarni yuklab bo'lmadi"));
      setDecks([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function handleCreate(name: string) {
    try {
      await apiCreateWordDeck(name);
      setCreating(false);
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Lug'at yaratib bo'lmadi"));
    }
  }

  async function handleUpdate(name: string) {
    if (!editingDeck) return;
    try {
      await apiUpdateWordDeck(editingDeck.id, name);
      setEditingDeck(null);
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Lug'atni yangilab bo'lmadi"));
    }
  }

  function confirmDelete(deck: WordDeck) {
    Alert.alert("Lug'atni o'chirish", `"${deck.name}" o'chirilsinmi? Ichidagi barcha so'zlar ham o'chadi.`, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteWordDeck(deck.id);
            void load();
          } catch (error) {
            Alert.alert('Xatolik', getApiErrorMessage(error, "Lug'atni o'chirib bo'lmadi"));
          }
        },
      },
    ]);
  }

  function showActions(deck: WordDeck) {
    Alert.alert(deck.name, undefined, [
      { text: "Nomini o'zgartirish", onPress: () => setEditingDeck(deck) },
      { text: "O'chirish", style: 'destructive', onPress: () => confirmDelete(deck) },
      { text: 'Bekor qilish', style: 'cancel' },
    ]);
  }

  if (decks === null) return <Loading />;

  return (
    <Screen>
      <NewDeckModal
        visible={creating}
        title="Yangi lug'at"
        onSubmit={handleCreate}
        onClose={() => setCreating(false)}
      />

      <NewDeckModal
        visible={!!editingDeck}
        initial={editingDeck ? { name: editingDeck.name } : null}
        title="Lug'atni tahrirlash"
        onSubmit={handleUpdate}
        onClose={() => setEditingDeck(null)}
      />

      {decks.length === 0 ? (
        <Empty text="Hali lug'at yo'q. Yangisini yarating!" />
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 p-4"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('WordDeck', { deckId: item.id, deckName: item.name, slug: item.slug })}
              className="flex-row items-center gap-3 rounded-2xl bg-white p-4 active:opacity-70 dark:bg-dark-surface"
            >
              <View className="h-11 w-11 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
                <Languages size={20} color="#f59e0b" />
              </View>
              <Text className="flex-1 font-bold text-ink dark:text-dark-ink">{item.name}</Text>
              <Pressable onPress={() => showActions(item)} className="h-8 w-8 items-center justify-center">
                <MoreVertical size={18} color="#94a3b8" />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
