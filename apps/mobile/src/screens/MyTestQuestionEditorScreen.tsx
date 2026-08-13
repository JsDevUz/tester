import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image as ImageIcon, Music, Pencil, Trash2 } from 'lucide-react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  apiAddStudentQuestion,
  apiDeleteStudentQuestion,
  apiGetStudentTest,
  type CreateStudentQuestionData,
  type Question,
  type StudentTestDetail,
} from '../api/student-tests';
import { apiUploadMedia } from '../api/auth';
import { BulkImportTab } from '../components/BulkImportTab';
import { ChoiceTypeEditor, encodeChoiceOptions, type ChoiceOption } from '../components/questionEditor/ChoiceTypeEditor';
import { TrueFalseTypeEditor, encodeTrueFalse } from '../components/questionEditor/TrueFalseTypeEditor';
import { ReorderTypeEditor, encodeReorder } from '../components/questionEditor/ReorderTypeEditor';
import { ArrangeTypeEditor, encodeArrange } from '../components/questionEditor/ArrangeTypeEditor';
import { MatchingTypeEditor, encodeMatching, type MatchPair } from '../components/questionEditor/MatchingTypeEditor';
import { SliderTypeEditor, encodeSlider } from '../components/questionEditor/SliderTypeEditor';
import { DropPinTypeEditor, encodeDropPinRadius } from '../components/questionEditor/DropPinTypeEditor';
import { Button, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyTestQuestionEditor'>;

const TYPES: Array<{ key: string; label: string }> = [
  { key: 'single', label: 'Bir tanlov' },
  { key: 'multi', label: "Ko'p tanlov" },
  { key: 'truefalse', label: "To'g'ri/Noto'g'ri" },
  { key: 'fillblank', label: "Bo'sh joy" },
  { key: 'reorder', label: 'Tartiblash' },
  { key: 'arrange', label: 'Joylashtirish' },
  { key: 'matching', label: "Moslashtirish" },
  { key: 'slider', label: 'Slider' },
  { key: 'droppin', label: 'Nuqta belgilash' },
];

export function MyTestQuestionEditorScreen({ route }: Props) {
  const { testId } = route.params;
  const [test, setTest] = useState<StudentTestDetail | null>(null);
  const [tab, setTab] = useState<'manual' | 'bulk'>('manual');
  const [type, setType] = useState('single');
  const [text, setText] = useState('');
  const [choiceOptions, setChoiceOptions] = useState<ChoiceOption[]>([
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [tfValue, setTfValue] = useState<'true' | 'false' | null>(null);
  const [openAnswer, setOpenAnswer] = useState('');
  const [reorderTokens, setReorderTokens] = useState<string[]>(['', '']);
  const [arrangeTokens, setArrangeTokens] = useState<string[]>(['', '']);
  const [arrangeDistractors, setArrangeDistractors] = useState<string[]>([]);
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>([{ left: '', right: '' }, { left: '', right: '' }]);
  const [sliderMin, setSliderMin] = useState('0');
  const [sliderMax, setSliderMax] = useState('100');
  const [sliderStep, setSliderStep] = useState('1');
  const [dropPinRadius, setDropPinRadius] = useState('8');
  const [dropPinAnswer, setDropPinAnswer] = useState('');
  const [questionImageUrl, setQuestionImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setTest(await apiGetStudentTest(testId));
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Testni yuklab bo'lmadi"));
    }
  }, [testId]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setType('single');
    setText('');
    setChoiceOptions([{ text: '', isCorrect: false }, { text: '', isCorrect: false }]);
    setTfValue(null);
    setOpenAnswer('');
    setReorderTokens(['', '']);
    setArrangeTokens(['', '']);
    setArrangeDistractors([]);
    setMatchPairs([{ left: '', right: '' }, { left: '', right: '' }]);
    setSliderMin('0');
    setSliderMax('100');
    setSliderStep('1');
    setDropPinRadius('8');
    setDropPinAnswer('');
    setQuestionImageUrl(null);
  }

  async function pickImage() {
    const result = await launchImageLibrary({ mediaType: 'photo' });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setUploading(true);
    try {
      const uploaded = await apiUploadMedia({ uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? 'question.jpg' }, 'questions');
      setQuestionImageUrl(uploaded.url);
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Rasm yuklab bo'lmadi"));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!text.trim() || saving) return;
    let data: CreateStudentQuestionData;
    if (type === 'single' || type === 'multi') {
      const options = encodeChoiceOptions(choiceOptions);
      if (options.length > 0 && !options.some((o) => o.isCorrect)) {
        Alert.alert('Xatolik', "Kamida bitta to'g'ri javob belgilanishi shart");
        return;
      }
      data = { text: text.trim(), type, options };
    } else if (type === 'truefalse') {
      if (!tfValue) {
        Alert.alert('Xatolik', "To'g'ri yoki Noto'g'rini tanlang");
        return;
      }
      data = { text: text.trim(), type, options: encodeTrueFalse(tfValue) };
    } else if (type === 'reorder') {
      const options = encodeReorder(reorderTokens);
      if (options.length < 2) {
        Alert.alert('Xatolik', 'Kamida 2 ta element kiriting');
        return;
      }
      data = { text: text.trim(), type, options };
    } else if (type === 'arrange') {
      const options = encodeArrange(arrangeTokens, arrangeDistractors);
      if (options.filter((o) => o.isCorrect).length < 2) {
        Alert.alert('Xatolik', 'Kamida 2 ta to\'g\'ri element kiriting');
        return;
      }
      data = { text: text.trim(), type, options };
    } else if (type === 'matching') {
      const options = encodeMatching(matchPairs);
      if (options.length < 4) {
        Alert.alert('Xatolik', "Kamida 2 ta juft kiriting");
        return;
      }
      data = { text: text.trim(), type, options };
    } else if (type === 'slider') {
      data = { text: text.trim(), type, options: encodeSlider(sliderMin, sliderMax, sliderStep) };
    } else if (type === 'droppin') {
      if (!questionImageUrl || !dropPinAnswer) {
        Alert.alert('Xatolik', "Rasm yuklang va to'g'ri joyni belgilang");
        return;
      }
      data = { text: text.trim(), type, options: encodeDropPinRadius(dropPinRadius), imageUrl: questionImageUrl, correctAnswer: dropPinAnswer };
    } else {
      data = { text: text.trim(), type, options: [], correctAnswer: openAnswer.trim() || undefined };
    }

    setSaving(true);
    try {
      await apiAddStudentQuestion(testId, data);
      resetForm();
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Savol qo'shib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkImport(bulkString: string): Promise<number> {
    if (!testId || !bulkString.trim()) return 0;
    const blocks = bulkString.split(/\n\s*\n/).filter((b) => b.trim());
    let count = 0;
    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const questionText = lines[0].replace(/^[#?~=|>]+\s*/, '');
      const isMulti = lines[0].startsWith('#multi');
      const optionLines = lines.slice(1);
      const options = optionLines.map((l) => ({
        text: l.replace(/^[+-]\s*/, ''),
        isCorrect: l.startsWith('+'),
      }));
      try {
        await apiAddStudentQuestion(testId, {
          text: questionText,
          type: isMulti ? 'multi' : 'single',
          options,
        });
        count += 1;
      } catch {
        // Continue
      }
    }
    void load();
    return count;
  }

  const bulkText = useMemo(() => {
    try {
      if (!test?.questions || !Array.isArray(test.questions)) return '';
      return test.questions
        .map((q) => {
          if (!q) return '';
          const typePrefix = q.type === 'multi' ? '#multi\n' : q.type === 'open' ? '#open\n' : '# ';
          const opts = Array.isArray(q.options) ? q.options : [];
          const optionsText = opts
            .filter(Boolean)
            .map((o) => {
              if (typeof o === 'string') return `- ${o}`;
              const isCorr = Boolean(o && typeof o === 'object' && o.isCorrect);
              const txt = o && typeof o === 'object' && o.text ? String(o.text) : String(o);
              return `${isCorr ? '+' : '-'} ${txt}`;
            })
            .join('\n');
          return `${typePrefix}${q.text ?? ''}\n${optionsText}`.trim();
        })
        .filter(Boolean)
        .join('\n\n');
    } catch {
      return '';
    }
  }, [test]);

  function confirmDeleteQuestion(question: Question) {
    Alert.alert('Savolni o\'chirish', `"${question.text}" o'chirilsinmi?`, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteStudentQuestion(question.id);
            void load();
          } catch (error) {
            Alert.alert('Xatolik', getApiErrorMessage(error, "Savolni o'chirib bo'lmadi"));
          }
        },
      },
    ]);
  }

  if (!test) return <Loading />;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4">
        {/* Segmented Control / Tab Switcher */}
        <View className="flex-row rounded-2xl bg-gray-200/80 p-1 dark:bg-dark-surface">
          <Pressable
            onPress={() => setTab('manual')}
            className={`flex-1 py-2.5 items-center justify-center rounded-xl ${tab === 'manual' ? 'bg-white shadow-sm dark:bg-dark-canvas' : ''
              }`}
          >
            <Text
              className={`text-xs font-bold ${tab === 'manual' ? 'text-ink dark:text-dark-ink' : 'text-gray-500'
                }`}
            >
              Qo'lda kiritish
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab('bulk')}
            className={`flex-1 py-2.5 items-center justify-center rounded-xl ${tab === 'bulk' ? 'bg-white shadow-sm dark:bg-dark-canvas' : ''
              }`}
          >
            <Text
              className={`text-xs font-bold ${tab === 'bulk' ? 'text-ink dark:text-dark-ink' : 'text-gray-500'
                }`}
            >
              Ommaviy import
            </Text>
          </Pressable>
        </View>

        {/* Tab content */}
        {tab === 'manual' ? (
          <View className="gap-2 rounded-2xl bg-white p-4 dark:bg-dark-surface">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {TYPES.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => setType(t.key)}
                    className={`rounded-full border px-3 py-1.5 ${type === t.key ? 'border-gray-900 bg-gray-900 dark:border-white dark:bg-white' : 'border-gray-200 dark:border-zinc-700'}`}
                  >
                    <Text className={`text-xs font-bold ${type === t.key ? 'text-white dark:text-gray-900' : 'text-gray-500'}`}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Savol matni"
              placeholderTextColor="#94a3b8"
              multiline
              className="rounded-xl bg-gray-100 px-3 py-3 text-ink dark:bg-dark-canvas dark:text-dark-ink"
            />

            {(type === 'single' || type === 'multi') && (
              <ChoiceTypeEditor type={type} options={choiceOptions} onChange={setChoiceOptions} />
            )}
            {type === 'truefalse' && <TrueFalseTypeEditor value={tfValue} onChange={setTfValue} />}
            {type === 'reorder' && <ReorderTypeEditor tokens={reorderTokens} onChange={setReorderTokens} />}
            {type === 'arrange' && (
              <ArrangeTypeEditor
                correctTokens={arrangeTokens}
                distractors={arrangeDistractors}
                onChangeTokens={setArrangeTokens}
                onChangeDistractors={setArrangeDistractors}
              />
            )}
            {type === 'matching' && <MatchingTypeEditor pairs={matchPairs} onChange={setMatchPairs} />}
            {type === 'slider' && (
              <SliderTypeEditor min={sliderMin} max={sliderMax} step={sliderStep} onChangeMin={setSliderMin} onChangeMax={setSliderMax} onChangeStep={setSliderStep} />
            )}
            {type === 'droppin' && (
              <View className="gap-2">
                <Button title={uploading ? 'Yuklanmoqda...' : 'Rasm tanlash'} loading={uploading} onPress={() => void pickImage()} />
                <DropPinTypeEditor
                  imageUrl={questionImageUrl}
                  correctAnswer={dropPinAnswer}
                  radiusPct={dropPinRadius}
                  onChangeRadius={setDropPinRadius}
                  onChangeCorrectAnswer={setDropPinAnswer}
                />
              </View>
            )}
            {type === 'fillblank' && (
              <TextInput
                value={openAnswer}
                onChangeText={setOpenAnswer}
                placeholder="To'g'ri javob (ixtiyoriy)"
                placeholderTextColor="#94a3b8"
                className="rounded-xl bg-gray-100 px-3 py-3 text-ink dark:bg-dark-canvas dark:text-dark-ink"
              />
            )}

            <Button title="Savolni saqlash" loading={saving} onPress={() => void handleSave()} />
          </View>
        ) : (
          <BulkImportTab
            onImport={handleBulkImport}
            bulkText={bulkText}
          />
        )}

        {/* Existing questions list */}
        {test.questions.length > 0 && (
          <View className="gap-2 mt-2">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
              Savollar ({test.questions.length})
            </Text>
            {test.questions.map((question, index) => (
              <View key={question.id} className="flex-row items-start gap-2 rounded-2xl bg-white p-4 shadow-sm border border-gray-100 dark:bg-dark-surface dark:border-dark-border">
                <Text className="w-5 text-xs font-bold text-gray-400 mt-0.5">{index + 1}.</Text>
                <View className="flex-1 gap-1">
                  <Text className="text-sm font-semibold text-ink dark:text-dark-ink leading-snug">{question.text}</Text>

                  {(question.imageUrl || question.audioUrl) && (
                    <View className="flex-row items-center gap-2 mt-1">
                      {question.imageUrl && (
                        <View className="flex-row items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-full dark:bg-indigo-950/40">
                          <ImageIcon size={10} color="#6366f1" />
                          <Text className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Rasm</Text>
                        </View>
                      )}
                      {question.audioUrl && (
                        <View className="flex-row items-center gap-1 bg-purple-50 px-2 py-0.5 rounded-full dark:bg-purple-950/40">
                          <Music size={10} color="#a855f7" />
                          <Text className="text-[10px] font-bold text-purple-600 dark:text-purple-400">Audio</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                <Pressable
                  onPress={() => confirmDeleteQuestion(question)}
                  className="h-8 w-8 items-center justify-center rounded-xl bg-gray-50 active:bg-rose-50 dark:bg-dark-canvas dark:active:bg-rose-950/40"
                >
                  <Trash2 size={15} color="#ef4444" />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
