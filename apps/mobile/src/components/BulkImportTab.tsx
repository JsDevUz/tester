import React, { useState } from 'react';
import { Pressable, Share, Text, TextInput, View } from 'react-native';
import { Check, Clipboard as ClipboardIcon, Copy } from 'lucide-react-native';

const SAMPLE_BULK_TEXT = `FORMAT:

1. Oddiy test (Single Choice)
# Savol matni
+ To'g'ri javob
- Noto'g'ri javob
- Noto'g'ri javob

2. Ko'p javobli test (Multiple Choice)
# Savol matni
+ To'g'ri javob
+ To'g'ri javob
- Noto'g'ri javob

3. Ochiq savol
# Savol matni

4. True / False
#? Savol matni`;

interface Props {
  onImport: (text: string) => Promise<number>;
  bulkText?: string;
}

export function BulkImportTab({ onImport, bulkText = '' }: Props) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sampleCopied, setSampleCopied] = useState(false);

  async function copyBulk() {
    if (!bulkText) return;
    try {
      await Share.share({ message: bulkText });
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignored
    }
  }

  async function copySamplePrompt() {
    try {
      await Share.share({ message: SAMPLE_BULK_TEXT });
      setSampleCopied(true);
      setTimeout(() => setSampleCopied(false), 1500);
    } catch {
      // Ignored
    }
  }

  function handlePreview() {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const count = lines.filter((l) => l.startsWith('#')).length;
    setPreview(`${count} ta savol import qilinadi.`);
    setResult(null);
  }

  async function handleImport() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const imported = await onImport(text);
      setResult(`ok:${imported} ta savol muvaffaqiyatli import qilindi.`);
      setText('');
      setPreview(null);
    } catch {
      setResult('err:Import amalga oshmadi. Formatni tekshiring.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-col gap-4">
      <View className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-1 mr-2">
            <Text className="text-sm font-bold text-ink dark:text-dark-ink">Namuna pattern</Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              # savol, + to'g'ri javob, - noto'g'ri javob
            </Text>
          </View>
          <Pressable
            onPress={() => void copySamplePrompt()}
            className="flex-row items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-dark-border dark:bg-dark-canvas"
          >
            {sampleCopied ? (
              <Check size={13} color="#22c55e" />
            ) : (
              <ClipboardIcon size={13} color="#64748b" />
            )}
            <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {sampleCopied ? 'Nusxalandi' : 'Promptni nusxalash'}
            </Text>
          </Pressable>
        </View>

        <View className="rounded-xl bg-slate-900 p-3">
          <Text className="font-mono text-xs leading-5 text-slate-100">{SAMPLE_BULK_TEXT}</Text>
        </View>
      </View>

      {!!bulkText && (
        <View className="flex-row justify-end">
          <Pressable
            onPress={() => void copyBulk()}
            className="flex-row items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-dark-border dark:bg-dark-surface"
          >
            {copied ? <Check size={13} color="#22c55e" /> : <Copy size={13} color="#64748b" />}
            <Text className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              {copied ? 'Nusxalandi' : 'Savollarni nusxalash'}
            </Text>
          </Pressable>
        </View>
      )}

      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          setPreview(null);
          setResult(null);
        }}
        multiline
        numberOfLines={8}
        placeholder="Savollarni shu yerga joylashtiring..."
        placeholderTextColor="#94a3b8"
        className="min-h-[140px] rounded-2xl border border-gray-200 bg-white p-3 font-mono text-xs text-ink dark:border-dark-border dark:bg-dark-surface dark:text-dark-ink"
      />

      {preview && <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">{preview}</Text>}
      {result && (
        <Text className={`text-xs font-bold ${result.startsWith('ok:') ? 'text-emerald-600' : 'text-rose-500'}`}>
          {result.startsWith('ok:') ? result.slice(3) : result.slice(4)}
        </Text>
      )}

      <View className="flex-row gap-2 justify-end">
        <Pressable
          disabled={!text.trim()}
          onPress={handlePreview}
          className="h-10 px-4 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-surface disabled:opacity-40"
        >
          <Text className="text-xs font-bold text-gray-700 dark:text-gray-300">Ko'rish</Text>
        </Pressable>

        <Pressable
          disabled={!text.trim() || loading}
          onPress={() => void handleImport()}
          className="h-10 px-5 items-center justify-center rounded-xl bg-indigo-600 active:bg-indigo-700 disabled:opacity-40"
        >
          <Text className="text-xs font-bold text-white">
            {loading ? 'Yuklanmoqda...' : 'Import qilish'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
