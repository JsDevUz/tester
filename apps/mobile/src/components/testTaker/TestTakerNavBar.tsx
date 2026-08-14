import React, { forwardRef } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { PublicQuestion, QuestionFeedback } from '../../types/delivery';

interface QuestionNumbersBarProps {
  questions: PublicQuestion[];
  currentIdx: number;
  isPerQuestion: boolean;
  feedbackMap: Record<string, QuestionFeedback>;
  isQuestionAnswered: (q: PublicQuestion) => boolean;
  canJumpTo: (idx: number) => boolean;
  onSelectIndex: (idx: number) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

export const QuestionNumbersBar = forwardRef<ScrollView, QuestionNumbersBarProps>(
  function QuestionNumbersBar(
    {
      questions,
      currentIdx,
      isPerQuestion,
      feedbackMap,
      isQuestionAnswered,
      canJumpTo,
      onSelectIndex,
      onLayout,
    },
    ref,
  ) {
    return (
      <>
        <View className="h-1.5 overflow-hidden rounded-full bg-slate-100 mx-4 mt-3 dark:bg-dark-surface-2">
          <View
            className="h-full rounded-full bg-indigo-500"
            style={{
              width: `${((currentIdx + 1) / questions.length) * 100}%`,
            }}
          />
        </View>

        <ScrollView
          ref={ref}
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-none"
          style={{ flexGrow: 0, flexShrink: 0 }}
          onLayout={onLayout}
          contentContainerClassName="gap-2 px-4 py-3">
          {questions.map((q, i) => {
            const answered = isQuestionAnswered(q);
            const isCurrent = i === currentIdx;
            const jumpable = canJumpTo(i);
            const checkedQ = isPerQuestion && !!feedbackMap[q.id];
            const bg = isCurrent
              ? 'bg-slate-900'
              : checkedQ
              ? feedbackMap[q.id].isCorrect
                ? 'bg-green-100'
                : 'bg-red-100'
              : answered
              ? 'bg-slate-200'
              : jumpable
              ? 'bg-white border border-slate-200'
              : 'bg-slate-100';
            const fg = isCurrent
              ? 'text-white'
              : checkedQ
              ? feedbackMap[q.id].isCorrect
                ? 'text-green-700'
                : 'text-red-600'
              : jumpable
              ? 'text-slate-700'
              : 'text-slate-300';
            return (
              <Pressable
                key={q.id}
                disabled={!jumpable}
                onPress={() => jumpable && onSelectIndex(i)}
                className={`h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
                <Text className={`text-sm font-semibold ${fg}`}>{i + 1}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </>
    );
  },
);

interface TestTakerActionButtonsProps {
  isOneByOne: boolean;
  isPerQuestion: boolean;
  isChecked: boolean;
  isLast: boolean;
  currentIdx: number;
  submitting: boolean;
  checking: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCheck: () => void;
  onSubmit: () => void;
}

export function TestTakerActionButtons({
  isOneByOne,
  isPerQuestion,
  isChecked,
  isLast,
  currentIdx,
  submitting,
  checking,
  onPrev,
  onNext,
  onCheck,
  onSubmit,
}: TestTakerActionButtonsProps) {
  return (
    <View className="flex-row gap-3 border-t border-slate-100 px-4 pb-6 pt-3 dark:border-dark-border">
      {isOneByOne ? (
        isPerQuestion ? (
          isChecked ? (
            isLast ? (
              <Pressable
                onPress={onSubmit}
                disabled={submitting}
                className="flex-1 items-center rounded-2xl bg-green-500 py-4 disabled:opacity-40">
                <Text className="text-base font-semibold text-white">
                  {submitting ? 'Topshirilmoqda...' : 'Yakunlash'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={onNext}
                className="flex-1 items-center rounded-2xl bg-indigo-500 py-4">
                <Text className="text-base font-semibold text-white">
                  Keyingi →
                </Text>
              </Pressable>
            )
          ) : (
            <Pressable
              onPress={onCheck}
              disabled={checking}
              className="flex-1 items-center rounded-2xl bg-indigo-500 py-4 disabled:opacity-50">
              <Text className="text-base font-semibold text-white">
                {checking ? 'Tekshirilmoqda...' : 'Tekshirish'}
              </Text>
            </Pressable>
          )
        ) : (
          <>
            {currentIdx > 0 && (
              <Pressable
                onPress={onPrev}
                className="items-center rounded-2xl bg-white px-5 py-4 dark:bg-dark-canvas">
                <Text className="text-base font-medium text-slate-600 dark:text-dark-muted">
                  ← Oldingi
                </Text>
              </Pressable>
            )}
            {!isLast ? (
              <Pressable
                onPress={onNext}
                className="flex-1 items-center rounded-2xl bg-indigo-500 py-4">
                <Text className="text-base font-semibold text-white">
                  Keyingi →
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={onSubmit}
                disabled={submitting}
                className="flex-1 items-center rounded-2xl bg-green-500 py-4 disabled:opacity-40">
                <Text className="text-base font-semibold text-white">
                  {submitting ? 'Topshirilmoqda...' : 'Topshirish ✓'}
                </Text>
              </Pressable>
            )}
          </>
        )
      ) : (
        <Pressable
          onPress={onSubmit}
          disabled={submitting}
          className="flex-1 items-center rounded-2xl bg-green-500 py-4 disabled:opacity-40">
          <Text className="text-base font-semibold text-white">
            {submitting ? 'Topshirilmoqda...' : 'Topshirish'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
