import React, {useEffect, useState} from 'react';
import {Image, Pressable, ScrollView, Text, View} from 'react-native';
import {BookOpen, CheckCircle2, Circle, Clock, ThumbsUp, Trophy, XCircle} from 'lucide-react-native';
import {apiGetSubmissionResult, mediaUrl} from '../../api/delivery';
import type {AnswerResultItem, SubmissionResult} from '../../types/delivery';
import {Loading} from '../Ui';
import {draftKey} from '../../lib/testTaker';
import {storage} from '../../lib/storage';

function AnswerDetail({a}: {a: AnswerResultItem}) {
  if (a.questionType === 'open' || a.questionType === 'fillblank') {
    return (
      <View className="ml-9 flex flex-col gap-1">
        <View className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 dark:bg-dark-canvas dark:border-dark-border">
          <Text className="text-xs italic text-slate-600 dark:text-dark-muted">{a.textAnswer || '—'}</Text>
        </View>
        {a.isCorrect === null && (
          <Text className="px-1 text-xs text-slate-400 dark:text-dark-muted">Tekshiruv yakunlanmadi</Text>
        )}
        {a.isCorrect === false && a.correctAnswer && (
          <Text className="px-1 text-xs text-emerald-600">
            To'g'ri: <Text className="font-medium">{a.correctAnswer}</Text>
          </Text>
        )}
      </View>
    );
  }

  if (a.questionType === 'slider') {
    return (
      <View className="ml-9 flex-row flex-wrap items-center gap-2">
        <View className="rounded-xl bg-white/80 px-3 py-1.5 dark:bg-dark-canvas">
          <Text className="text-xs text-slate-600 dark:text-dark-muted">
            Javob: <Text className="font-medium">{a.textAnswer || '—'}</Text>
          </Text>
        </View>
        {a.isCorrect === false && a.correctAnswer && (
          <Text className="text-xs text-emerald-600">
            To'g'ri: <Text className="font-medium">{a.correctAnswer}</Text>
          </Text>
        )}
      </View>
    );
  }

  if (a.questionType === 'droppin') {
    const student = a.textAnswer?.split(',').map(Number);
    const correct = a.correctAnswer?.split(',').map(Number);
    return (
      <View className="ml-9">
        {a.imageUrl ? (
          <View
            className="relative w-full max-w-xs overflow-hidden rounded-2xl border border-slate-200 dark:border-dark-border"
            style={{aspectRatio: 4 / 3}}>
            <Image source={{uri: mediaUrl(a.imageUrl)}} className="h-full w-full" resizeMode="cover" />
            {student && student.length === 2 && (
              <View
                pointerEvents="none"
                className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-red-500 shadow"
                style={{left: `${student[0] * 100}%`, top: `${student[1] * 100}%`}}
              />
            )}
            {correct && correct.length === 2 && a.isCorrect === false && (
              <View
                pointerEvents="none"
                className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-emerald-500 shadow"
                style={{left: `${correct[0] * 100}%`, top: `${correct[1] * 100}%`}}
              />
            )}
          </View>
        ) : (
          <Text className="text-xs text-slate-400 dark:text-dark-muted">Rasm yo'q</Text>
        )}
        {!a.textAnswer && <Text className="mt-1 text-xs text-rose-500">Siz joy belgilamadingiz</Text>}
      </View>
    );
  }

  if (a.questionType === 'matching') {
    const lefts = (a.options ?? []).filter(o => o.isCorrectOption);
    const rights = (a.options ?? []).filter(o => !o.isCorrectOption);
    const studentPairs = new Map<string, string>();
    for (let i = 0; i < a.selectedOptionIds.length; i += 2) {
      studentPairs.set(a.selectedOptionIds[i], a.selectedOptionIds[i + 1]);
    }
    return (
      <View className="ml-9 flex flex-col gap-1">
        {lefts.map((left, idx) => {
          const correctRight = rights[idx];
          const studentRightId = studentPairs.get(left.id);
          const studentRight = (a.options ?? []).find(o => o.id === studentRightId);
          const pairCorrect = studentRightId === correctRight?.id;
          return (
            <View
              key={left.id}
              className={`flex-row flex-wrap items-center gap-1.5 rounded-xl px-3 py-2 ${
                pairCorrect ? 'bg-emerald-500' : 'bg-rose-500'
              }`}>
              <Text className="text-xs font-medium text-white">{left.text}</Text>
              <Text className="text-xs text-white/60">→</Text>
              {pairCorrect ? (
                <Text className="text-xs font-medium text-white">{correctRight?.text}</Text>
              ) : (
                <>
                  <Text className="text-xs text-white line-through">{studentRight?.text ?? '—'}</Text>
                  <Text className="text-xs text-white">({correctRight?.text})</Text>
                </>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  if ((a.questionType === 'arrange' || a.questionType === 'reorder') && a.options && a.options.length > 0) {
    return (
      <View className="ml-9 flex flex-col gap-2">
        {a.isCorrect === false && (
          <View className="flex flex-col gap-1">
            <Text className="text-[11px] font-medium text-slate-400 dark:text-dark-muted">Sizning tartibingiz</Text>
            {a.selectedOptionIds.map((id, pos) => {
              const opt = a.options!.find(o => o.id === id);
              const correctId = a.options![pos]?.id;
              const posCorrect = id === correctId;
              return (
                <View
                  key={`student-${id}-${pos}`}
                  className={`flex-row items-center gap-2 rounded-xl px-3 py-2 ${
                    posCorrect ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}>
                  <Text className="font-mono text-xs text-white/70">{pos + 1}.</Text>
                  <Text className="text-xs text-white">{opt?.text ?? '—'}</Text>
                </View>
              );
            })}
          </View>
        )}
        <View className="flex flex-col gap-1">
          {a.isCorrect === false && (
            <Text className="text-[11px] font-medium text-slate-400 dark:text-dark-muted">To'g'ri tartib</Text>
          )}
          {a.options.map((opt, pos) => (
            <View
              key={opt.id}
              className={`flex-row items-center gap-2 rounded-xl px-3 py-2 ${
                a.isCorrect === false ? 'bg-emerald-500' : 'bg-green-100 dark:bg-emerald-500/20'
              }`}>
              <Text className={`font-mono text-xs ${a.isCorrect === false ? 'text-white/70' : 'text-green-500'}`}>
                {pos + 1}.
              </Text>
              <Text className={`text-xs ${a.isCorrect === false ? 'text-white' : 'font-medium text-green-700'}`}>
                {opt.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (a.options && a.options.length > 0) {
    return (
      <View className="ml-9 flex flex-col gap-1">
        {a.options.map(opt => {
          const selected = a.selectedOptionIds.includes(opt.id);
          return (
            <View
              key={opt.id}
              className={`flex-row items-center gap-2 rounded-xl px-3 py-2 ${
                opt.isCorrectOption ? 'bg-emerald-500' : selected ? 'bg-rose-500' : ''
              }`}>
              <Circle
                size={8}
                color={opt.isCorrectOption || selected ? 'white' : '#94a3b8'}
                fill={opt.isCorrectOption || selected ? 'white' : 'transparent'}
              />
              <Text
                className={`text-xs ${
                  opt.isCorrectOption ? 'font-medium text-white' : selected ? 'text-white' : 'text-slate-400'
                }`}>
                {opt.text}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  return null;
}

function TestResultBody({
  result,
  pct,
  isGood,
  isMid,
}: {
  result: SubmissionResult;
  pct: number;
  isGood: boolean;
  isMid: boolean;
}) {
  if (result.showResults === 'immediately' || result.showResults === 'per_question') {
    return (
      <>
        <View className="mb-8 items-center">
          <View
            className={`mb-4 h-24 w-24 items-center justify-center rounded-3xl ${
              isGood ? 'bg-green-50 dark:bg-emerald-500/10' : isMid ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-red-50 dark:bg-rose-500/10'
            }`}>
            {isGood ? (
              <Trophy size={40} color="#4ade80" />
            ) : isMid ? (
              <ThumbsUp size={40} color="#fbbf24" />
            ) : (
              <BookOpen size={40} color="#fca5a5" />
            )}
          </View>
          <Text
            className={`mb-1 text-5xl font-black ${
              isGood ? 'text-green-500' : isMid ? 'text-amber-500' : 'text-red-400'
            }`}>
            {pct}%
          </Text>
          <Text className="text-sm text-slate-400 dark:text-dark-muted">
            {result.score} / {result.total} ta to'g'ri
          </Text>
        </View>

        <View className="flex flex-col gap-3">
          {result.answers.map((a, i) => (
            <View
              key={a.questionId}
              className={`rounded-2xl border px-4 py-4 ${
                a.isCorrect === true
                  ? 'border-green-100 bg-green-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                  : a.isCorrect === false
                    ? 'border-red-100 bg-red-50 dark:border-rose-500/30 dark:bg-rose-500/10'
                    : 'border-slate-200 bg-slate-50 dark:border-dark-border dark:bg-dark-surface-2'
              }`}>
              <View className="mb-3 flex-row items-start gap-3">
                <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-lg bg-white dark:bg-dark-canvas">
                  <Text className="text-xs font-bold text-slate-500 dark:text-dark-muted">{i + 1}</Text>
                </View>
                <Text className="flex-1 text-sm font-semibold leading-snug text-slate-800 dark:text-dark-ink">{a.questionText}</Text>
                {a.isCorrect === true ? (
                  <CheckCircle2 size={18} color="#22c55e" />
                ) : a.isCorrect === false ? (
                  <XCircle size={18} color="#f87171" />
                ) : (
                  <Text className="text-xs text-slate-300 dark:text-dark-muted">—</Text>
                )}
              </View>
              <AnswerDetail a={a} />
            </View>
          ))}
        </View>
      </>
    );
  }

  if (result.showResults === 'after_deadline') {
    return (
      <View className="items-center justify-center py-16">
        <View className="mb-5 h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 dark:bg-dark-surface-2">
          <Clock size={36} color="#64748b" />
        </View>
        <Text className="mb-2 text-xl font-bold text-ink dark:text-dark-ink">Test topshirildi!</Text>
        <Text className="text-center text-sm leading-relaxed text-slate-400 dark:text-dark-muted">
          Natijalar{' '}
          {result.deadline ? (
            <Text className="font-medium text-slate-700 dark:text-dark-ink">{new Date(result.deadline).toLocaleString('uz-UZ')}</Text>
          ) : (
            'deadline'
          )}{' '}
          dan keyin ochiladi.
        </Text>
      </View>
    );
  }

  return (
    <View className="items-center justify-center py-16">
      <View className="mb-5 h-20 w-20 items-center justify-center rounded-3xl bg-green-50">
        <CheckCircle2 size={36} color="#4ade80" />
      </View>
      <Text className="mb-2 text-xl font-bold text-ink dark:text-dark-ink">Muvaffaqiyatli topshirildi!</Text>
      <Text className="text-sm text-slate-400 dark:text-dark-muted">Test qabul qilindi.</Text>
    </View>
  );
}

export function TestResultView({
  submissionId,
  practiceMode,
  onBack,
  cachedResult,
}: {
  submissionId: string | null;
  practiceMode: boolean;
  onBack?: () => void;
  cachedResult?: SubmissionResult | null;
}) {
  const [result, setResult] = useState<SubmissionResult | null>(cachedResult ?? null);
  const [loading, setLoading] = useState(!cachedResult);

  useEffect(() => {
    if (cachedResult) {
      setResult(cachedResult);
      setLoading(false);
      if (submissionId) void storage.remove(draftKey(submissionId));
      return;
    }
    if (!submissionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiGetSubmissionResult(submissionId, practiceMode)
      .then(res => {
        if (cancelled) return;
        setResult(res);
        void storage.remove(draftKey(submissionId));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, practiceMode]);

  if (loading) return <Loading />;

  if (!result) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-dark-canvas">
        <Text className="text-slate-400 dark:text-dark-muted">Natija topilmadi.</Text>
      </View>
    );
  }

  const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  const isGood = pct >= 70;
  const isMid = pct >= 40 && pct < 70;
  const isViolation = result.mode === 'violation';

  return (
    <ScrollView className="flex-1 bg-white dark:bg-dark-canvas" contentContainerClassName="px-4 pb-8 pt-4">
      {isViolation && (
        <View className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <Text className="text-center text-sm font-medium text-red-600">
            {result.violationReason ?? "Taqiqlangan harakat aniqlanganligi sababli yakunlandi."}
          </Text>
        </View>
      )}
      <TestResultBody result={result} pct={pct} isGood={isGood} isMid={isMid} />
      {onBack && (
        <Pressable onPress={onBack} className="mt-6 items-center rounded-xl bg-slate-900 px-4 py-3.5 dark:bg-dark-surface-2">
          <Text className="text-sm font-bold text-white">Darsga qaytish</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
