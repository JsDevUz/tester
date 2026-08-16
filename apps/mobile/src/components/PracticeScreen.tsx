import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {CheckCircle2, ChevronLeft, ImagePlus, Star, Trash2} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';
import type {ApiMyLesson, ApiMyPracticeBlock} from '../types/api';
import {apiUploadMedia} from '../api/auth';
import {apiDeletePracticeImageSubmission, apiSubmitPracticeImage} from '../api/practiceBlocks';
import {getApiErrorMessage} from '../lib/errors';
import {useNetwork} from '../providers/NetworkProvider';

function practiceMaxScore(lesson: ApiMyLesson): number {
  return lesson.practiceBlocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0);
}

function practiceEarnedScore(lesson: ApiMyLesson): number {
  return lesson.practiceBlocks.reduce((sum, b) => sum + (b.earnedScore ?? 0), 0);
}

function ImagePracticeBlockCard({
  block,
  onImageSubmitted,
}: {
  block: ApiMyPracticeBlock;
  onImageSubmitted: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {online} = useNetwork();
  const maximumReached = block.imageSubmissions.length >= 5;
  const hasGradedSubmission = block.imageSubmissions.some(s => s.graded);

  async function pickAndUpload() {
    if (!online) {
      Alert.alert('Internet kerak', 'Rasm yuklash faqat online ishlaydi.');
      return;
    }
    if (maximumReached) {
      Alert.alert('Limit', 'Bitta topshiriqqa maksimal 5 ta rasm yuklash mumkin.');
      return;
    }
    if (hasGradedSubmission) {
      Alert.alert('Baholangan', 'Baholangan topshiriqqa yangi rasm yuklab bo\'lmaydi.');
      return;
    }
    const result = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setUploading(true);
    try {
      const uploaded = await apiUploadMedia(
        {uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? 'photo.jpg'},
        'practice-submissions',
      );
      await apiSubmitPracticeImage(block.id, uploaded.url);
      onImageSubmitted();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Rasm yuklashda xatolik yuz berdi."));
    } finally {
      setUploading(false);
    }
  }

  async function deleteImage(submissionId: string) {
    setDeletingId(submissionId);
    try {
      await apiDeletePracticeImageSubmission(submissionId);
      onImageSubmitted();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Rasmni o'chirib bo'lmadi."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {block.description ? (
        <Text className="mb-3 text-sm text-slate-600 dark:text-dark-muted">{block.description}</Text>
      ) : null}
      {block.imageSubmissions.map(s => (
        <View
          key={s.id}
          className="mb-2 flex-row items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-dark-surface-2">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-bold text-ink dark:text-dark-ink">
              {new Date(s.submittedAt).toLocaleDateString('uz-UZ')}
            </Text>
            <Text className="text-[11px] text-slate-400 dark:text-dark-muted">
              {s.graded
                ? `Baholandi: ${s.score}${block.maxScore !== null ? ` / ${block.maxScore}` : ''}`
                : 'Ustoz tekshiruvini kutmoqda'}
            </Text>
          </View>
          {!s.graded && (
            <Pressable
              onPress={() => void deleteImage(s.id)}
              disabled={deletingId === s.id}
              className="h-8 w-8 items-center justify-center rounded-lg">
              <Trash2 size={15} color="#94a3b8" />
            </Pressable>
          )}
        </View>
      ))}
      <Text className="mb-2 text-right text-[11px] font-semibold text-slate-400 dark:text-dark-muted">
        {block.imageSubmissions.length}/5 rasm
      </Text>
      <Pressable
        onPress={() => void pickAndUpload()}
        disabled={uploading || maximumReached || hasGradedSubmission}
        className={`flex-row items-center justify-center gap-2 rounded-xl py-2.5 ${
          maximumReached || hasGradedSubmission || uploading ? 'bg-slate-300 dark:bg-dark-surface-2' : 'bg-brand'
        }`}>
        <ImagePlus size={15} color="white" />
        <Text className="text-xs font-bold text-white">
          {uploading ? 'Yuklanmoqda...' : maximumReached ? '5 ta rasm yuklandi' : hasGradedSubmission ? 'Topshiriq baholangan' : 'Rasm yuklash'}
        </Text>
      </Pressable>
    </>
  );
}

export function PracticeScreen({
  lesson,
  onBack,
  onStartPractice,
  onViewSubmission,
  onImageSubmitted,
  hasNext,
  canComplete,
  onNext,
}: {
  lesson: ApiMyLesson;
  onBack: () => void;
  onStartPractice: (block: ApiMyPracticeBlock) => void;
  onViewSubmission: (block: ApiMyPracticeBlock, submissionId: string) => void;
  onImageSubmitted: () => void;
  hasNext: boolean;
  canComplete: boolean;
  onNext: () => void;
}) {
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';
  const hasCompletionScore = lesson.completionScore !== null;
  const hasPracticeScore = lesson.practiceBlocks.some(b => b.maxScore !== null);
  const totalMax = practiceMaxScore(lesson) + (lesson.completionScore ?? 0);
  const effectivelyCompleted = lesson.completed && canComplete;
  const totalEarned =
    practiceEarnedScore(lesson) + (effectivelyCompleted ? lesson.completionScore ?? 0 : 0);

  return (
    <ScrollView contentContainerClassName="p-5 pb-12">
      <Text className="mb-4 text-2xl font-black text-ink dark:text-dark-ink">Amaliy qism</Text>

      {totalMax > 0 && (
        <View className="mb-5 rounded-2xl bg-slate-50 p-4 dark:bg-dark-surface">
          <View className="mb-3 flex-row items-center gap-2">
            <View className="flex-row items-center gap-1 rounded-full bg-white px-3 py-1 dark:bg-dark-surface-2">
              <Star size={13} color="#f59e0b" fill="#f59e0b" />
              <Text className="text-xs font-bold text-amber-500">
                {totalEarned} / {totalMax}
              </Text>
            </View>
            <Text className="text-xs font-semibold text-slate-500 dark:text-dark-muted">Dars uchun yulduzlar</Text>
          </View>
          {hasPracticeScore && (
            <View className="mb-2 flex-row items-center justify-between rounded-xl bg-white px-3 py-2 dark:bg-dark-surface-2">
              <Text className="text-xs font-semibold text-slate-600 dark:text-dark-muted">Amaliyot</Text>
              <Text className="text-xs font-semibold text-amber-500">
                {practiceEarnedScore(lesson)} / {practiceMaxScore(lesson)}
              </Text>
            </View>
          )}
          {hasCompletionScore && (
            <View className="flex-row items-center justify-between rounded-xl bg-white px-3 py-2 dark:bg-dark-surface-2">
              <Text className="text-xs font-semibold text-slate-600 dark:text-dark-muted">Darsni tamomlash</Text>
              <Text className="text-xs font-semibold text-amber-500">
                {lesson.completed ? lesson.completionScore : 0} / {lesson.completionScore}
              </Text>
            </View>
          )}
        </View>
      )}

      {lesson.passThresholdEnabled && lesson.passThresholdPercent !== null && (
        <View className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-sm font-bold text-ink dark:text-dark-ink">Minimal o'tish natijasi</Text>
            <Text className="rounded-full bg-white px-3 py-1 text-sm font-black text-indigo-600 dark:bg-dark-surface-2 dark:text-indigo-400">
              {lesson.passThresholdPercent}%
            </Text>
          </View>
          <Text className="mt-1.5 text-xs font-medium text-slate-500 dark:text-dark-muted">
            Hozirgi natijangiz:{' '}
            {lesson.combinedPracticePercent === null
              ? 'hali hisoblanmagan'
              : `${Math.round(lesson.combinedPracticePercent)}%`}
          </Text>
        </View>
      )}

      {lesson.practiceBlocks.length === 0 ? (
        <View className="rounded-2xl bg-slate-50 py-16 dark:bg-dark-surface">
          <Text className="text-center text-sm font-semibold text-slate-400 dark:text-dark-muted">
            Bu darsda amaliyot topshiriqlari yo'q
          </Text>
        </View>
      ) : (
        lesson.practiceBlocks.map(block => (
          <View key={block.id} className="mb-4 rounded-2xl bg-slate-50 p-4 dark:bg-dark-surface">
            <View className="mb-3 flex-row items-center justify-between gap-3">
              <Text className="flex-1 text-sm font-bold text-ink dark:text-dark-ink">
                {block.type === 'image'
                  ? "Amaliyot topshirig'i"
                  : block.type === 'oral'
                    ? 'Jonli savol-javob'
                    : (block.testName ?? 'Test tanlanmagan')}
              </Text>
              {block.maxScore !== null && (
                <Text className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-500 dark:bg-dark-surface-2">
                  {block.earnedScore ?? 0} / {block.maxScore}
                </Text>
              )}
            </View>

            {block.type === 'image' ? (
              <ImagePracticeBlockCard block={block} onImageSubmitted={onImageSubmitted} />
            ) : block.type === 'oral' ? (
              <View className="rounded-xl bg-white px-3 py-3 dark:bg-dark-surface-2">
                <Text className="text-sm font-semibold text-slate-700 dark:text-dark-ink">
                  Ustoz bilan jonli savol-javob
                </Text>
                <Text className="mt-1 text-xs text-slate-500 dark:text-dark-muted">
                  Bu topshiriqda fayl yuklanmaydi. Ustoz suhbatdan so'ng yulduzingizni qo'lda
                  belgilaydi.
                </Text>
                {block.oralGrade && (
                  <Text className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Baholandi: {block.oralGrade.score}/{block.maxScore ?? '—'}
                  </Text>
                )}
              </View>
            ) : (
              <>
                {block.submissions.map((s, i) => (
                  <View
                    key={s.id}
                    className="mb-2 flex-row items-center justify-between rounded-xl bg-white px-3 py-2.5 dark:bg-dark-surface-2">
                    <View>
                      <Text className="text-xs font-bold text-ink dark:text-dark-ink">
                        Urinish {block.submissions.length - i}{' '}
                        <Text className="font-normal text-slate-400 dark:text-dark-muted">
                          • {s.score}/{s.total}
                        </Text>
                      </Text>
                      <Text className="text-[11px] text-slate-400 dark:text-dark-muted">
                        {new Date(s.submittedAt).toLocaleDateString('uz-UZ')}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => onViewSubmission(block, s.id)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 dark:bg-dark-surface">
                      <Text className="text-xs font-bold text-slate-600 dark:text-dark-ink">Ochish</Text>
                    </Pressable>
                  </View>
                ))}
                {block.testSlug ? (
                  block.attemptsRemaining === 0 ? (
                    <Text className="text-center text-xs font-semibold text-slate-400 dark:text-dark-muted">
                      Urinishlar soni tugadi
                    </Text>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => onStartPractice(block)}
                        className="w-full items-center rounded-xl bg-brand py-2.5">
                        <Text className="text-xs font-bold text-white">
                          {block.submissions.length > 0 ? "Qayta o'tish" : "Amaliyotni boshlash"}
                        </Text>
                      </Pressable>
                      {block.attemptsRemaining !== null && (
                        <Text className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-dark-muted">
                          {block.attemptsRemaining} ta urinish imkoniyati qoldi
                        </Text>
                      )}
                    </>
                  )
                ) : (
                  <Text className="text-xs font-semibold text-slate-400 dark:text-dark-muted">
                    Bu topshiriq hali tayyor emas
                  </Text>
                )}
              </>
            )}
          </View>
        ))
      )}

      {effectivelyCompleted && (
        <View className="mt-2 flex-row items-center justify-center gap-2 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
          <CheckCircle2 size={18} color="#10b981" />
          <Text className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Dars tamomlangan</Text>
        </View>
      )}

      {!lesson.completed && !canComplete && (
        <Text className="mt-4 text-center text-xs font-semibold text-red-500">
          Darsni tamomlash uchun o'tish balidan yetarlicha ball to'plang
        </Text>
      )}

      <View className="mt-5 flex-row items-center justify-between gap-3">
        <Pressable onPress={onBack} className="flex-row items-center gap-1.5 px-2 py-1.5">
          <ChevronLeft size={15} color={isDark ? '#a4a7b2' : '#64748b'} />
          <Text className="text-xs font-bold text-slate-500 dark:text-dark-muted">Darsga qaytish</Text>
        </Pressable>
        {hasNext && (
          <Pressable
            onPress={onNext}
            disabled={!canComplete}
            className={`rounded-lg px-3 py-2 ${canComplete ? 'bg-brand' : 'bg-slate-200 dark:bg-dark-surface-2'}`}>
            <Text className="text-xs font-bold text-white">Keyingi darsga o'tish</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
