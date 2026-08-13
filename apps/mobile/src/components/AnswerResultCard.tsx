import React from 'react';
import {Image, Text, View} from 'react-native';
import {CheckCircle2, Circle, XCircle} from 'lucide-react-native';
import type {AnswerDetail} from '../types/api';

export function AnswerResultCard({answer: a, index}: {answer: AnswerDetail; index: number}) {
  const bg =
    a.isCorrect === true
      ? 'bg-emerald-50 dark:bg-emerald-500/10'
      : a.isCorrect === false
        ? 'bg-red-50 dark:bg-red-500/10'
        : 'bg-slate-50 dark:bg-dark-surface-2';
  const border =
    a.isCorrect === true
      ? 'border-emerald-100 dark:border-emerald-500/20'
      : a.isCorrect === false
        ? 'border-red-100 dark:border-red-500/20'
        : 'border-slate-100 dark:border-dark-border';

  return (
    <View className={`rounded-2xl border px-4 py-4 ${bg} ${border}`}>
      <View className="mb-3 flex-row items-start gap-3">
        <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-lg bg-white dark:bg-dark-surface">
          <Text className="text-xs font-bold text-slate-500 dark:text-dark-muted">{index + 1}</Text>
        </View>
        <Text className="min-w-0 flex-1 text-sm font-semibold leading-snug text-ink dark:text-dark-ink">
          {a.questionText}
        </Text>
        {a.isCorrect === true ? (
          <CheckCircle2 size={18} color="#10b981" />
        ) : a.isCorrect === false ? (
          <XCircle size={18} color="#f87171" />
        ) : (
          <Text className="text-xs text-slate-300 dark:text-dark-muted">—</Text>
        )}
      </View>

      {(a.questionType === 'open' || a.questionType === 'fillblank') && (
        <View className="gap-1 pl-9">
          <Text className="rounded-xl border border-slate-100 bg-white/80 px-3 py-2 text-xs italic text-slate-600 dark:border-dark-border dark:bg-dark-surface/80 dark:text-dark-muted">
            {a.textAnswer || '—'}
          </Text>
          {a.isCorrect === null && (
            <Text className="px-1 text-xs text-slate-400 dark:text-dark-muted">Tekshiruv yakunlanmadi</Text>
          )}
          {a.isCorrect === false && a.correctAnswer && (
            <Text className="px-1 text-xs text-emerald-600 dark:text-emerald-400">
              To'g'ri: <Text className="font-semibold">{a.correctAnswer}</Text>
            </Text>
          )}
        </View>
      )}

      {a.questionType === 'slider' && (
        <View className="flex-row flex-wrap items-center gap-2 pl-9">
          <Text className="rounded-xl bg-white/80 px-3 py-1.5 text-xs text-slate-600 dark:bg-dark-surface/80 dark:text-dark-muted">
            Javob: <Text className="font-semibold">{a.textAnswer || '—'}</Text>
          </Text>
          {a.isCorrect === false && a.correctAnswer && (
            <Text className="text-xs text-emerald-600 dark:text-emerald-400">
              To'g'ri: <Text className="font-semibold">{a.correctAnswer}</Text>
            </Text>
          )}
        </View>
      )}

      {a.questionType === 'droppin' && (
        <View className="pl-9">
          {a.imageUrl ? (
            <DropPinAnswer imageUrl={a.imageUrl} textAnswer={a.textAnswer} correctAnswer={a.correctAnswer} isCorrect={a.isCorrect} />
          ) : (
            <Text className="text-xs text-slate-400 dark:text-dark-muted">Rasm yo'q</Text>
          )}
        </View>
      )}

      {a.questionType === 'matching' && (
        <View className="gap-1 pl-9">
          <MatchingAnswer options={a.options} selectedOptionIds={a.selectedOptionIds} />
        </View>
      )}

      {a.questionType !== 'open' &&
        a.questionType !== 'fillblank' &&
        a.questionType !== 'slider' &&
        a.questionType !== 'droppin' &&
        a.questionType !== 'matching' &&
        a.options.length > 0 && (
          <View className="gap-1 pl-9">
            {a.options.map(opt => {
              const selected = a.selectedOptionIds.includes(opt.id);
              const optBg = opt.isCorrectOption
                ? 'border-emerald-500 bg-emerald-100/70 dark:bg-emerald-500/15'
                : selected
                  ? 'border-red-500 bg-red-100/70 dark:bg-red-500/15'
                  : 'border-transparent';
              const textColor = opt.isCorrectOption
                ? 'text-emerald-700 dark:text-emerald-400'
                : selected
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-400 dark:text-dark-muted';
              return (
                <View
                  key={opt.id}
                  className={`flex-row items-center gap-2 rounded-xl border-2 px-3 py-2 ${optBg}`}>
                  <Circle
                    size={8}
                    color={selected ? (opt.isCorrectOption ? '#10b981' : '#dc2626') : '#94a3b8'}
                    fill={selected ? (opt.isCorrectOption ? '#10b981' : '#dc2626') : 'transparent'}
                  />
                  <Text
                    className={`min-w-0 flex-1 text-xs ${opt.isCorrectOption ? 'font-semibold' : ''} ${textColor}`}>
                    {opt.text}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
    </View>
  );
}

function DropPinAnswer({
  imageUrl,
  textAnswer,
  correctAnswer,
  isCorrect,
}: {
  imageUrl: string;
  textAnswer: string | null;
  correctAnswer?: string | null;
  isCorrect: boolean | null;
}) {
  const student = textAnswer?.split(',').map(Number);
  const correct = correctAnswer?.split(',').map(Number);
  return (
    <View className="w-full max-w-xs overflow-hidden rounded-2xl border border-slate-100">
      <Image source={{uri: imageUrl}} className="aspect-square w-full" resizeMode="cover" />
      {student && student.length === 2 && !Number.isNaN(student[0]) && (
        <View
          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500"
          style={{left: `${student[0] * 100}%` as never, top: `${student[1] * 100}%` as never}}
        />
      )}
      {correct && correct.length === 2 && isCorrect === false && (
        <View
          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500"
          style={{left: `${correct[0] * 100}%` as never, top: `${correct[1] * 100}%` as never}}
        />
      )}
    </View>
  );
}

function MatchingAnswer({
  options,
  selectedOptionIds,
}: {
  options: AnswerDetail['options'];
  selectedOptionIds: string[];
}) {
  const lefts = options.filter(o => o.isCorrectOption);
  const rights = options.filter(o => !o.isCorrectOption);
  const studentPairs = new Map<string, string>();
  for (let i = 0; i < selectedOptionIds.length; i += 2) {
    studentPairs.set(selectedOptionIds[i], selectedOptionIds[i + 1]);
  }
  return (
    <>
      {lefts.map((left, idx) => {
        const correctRight = rights[idx];
        const studentRightId = studentPairs.get(left.id);
        const studentRight = options.find(o => o.id === studentRightId);
        const pairCorrect = studentRightId === correctRight?.id;
        return (
          <View
            key={left.id}
            className={`flex-row flex-wrap items-center gap-1.5 rounded-xl px-3 py-2 ${
              pairCorrect ? 'bg-emerald-100/70 dark:bg-emerald-500/15' : 'bg-red-100/70 dark:bg-red-500/15'
            }`}>
            <Text className="text-xs font-semibold text-slate-700 dark:text-dark-ink">{left.text}</Text>
            <Text className="text-xs text-slate-300 dark:text-dark-muted">→</Text>
            {pairCorrect ? (
              <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{correctRight?.text}</Text>
            ) : (
              <>
                <Text className="text-xs text-red-500 line-through dark:text-red-400">
                  {studentRight?.text ?? '—'}
                </Text>
                <Text className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">({correctRight?.text})</Text>
              </>
            )}
          </View>
        );
      })}
    </>
  );
}
