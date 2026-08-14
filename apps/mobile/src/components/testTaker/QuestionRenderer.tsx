import React from 'react';
import {
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { mediaUrl } from '../../api/delivery';
import { TYPE_BADGES } from '../../lib/testTaker';
import { ReorderQuestion } from './ReorderQuestion';
import { MatchingQuestion } from './MatchingQuestion';
import { SliderQuestion } from './SliderQuestion';
import { DropPinQuestion } from './DropPinQuestion';
import type { PublicQuestion, QuestionFeedback } from '../../types/delivery';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

interface QuestionRendererProps {
  question: PublicQuestion;
  selected: string[];
  textValue: string;
  feedback?: QuestionFeedback;
  locked: boolean;
  fontSize: number;
  onToggleOption: (optionId: string, type: 'single' | 'multi') => void;
  onTextChange: (text: string) => void;
  onSetSelected: (ids: string[]) => void;
  onArrangeAdd: (optionId: string) => void;
  onArrangeRemove: (optionId: string) => void;
}

export function QuestionBody({
  question,
  selected,
  textValue,
  feedback,
  locked,
  fontSize,
  onToggleOption,
  onTextChange,
  onSetSelected,
  onArrangeAdd,
  onArrangeRemove,
}: QuestionRendererProps) {
  const correctIds = new Set(feedback?.correctOptionIds ?? []);

  if (question.type === 'slider') {
    return (
      <SliderQuestion
        options={question.options}
        value={textValue}
        onChange={onTextChange}
        locked={locked}
        feedback={feedback}
      />
    );
  }

  if (question.type === 'droppin') {
    return (
      <DropPinQuestion
        imageUrl={question.imageUrl ? mediaUrl(question.imageUrl) : ''}
        value={textValue}
        onChange={onTextChange}
        locked={locked}
        feedback={feedback}
      />
    );
  }

  if (question.type === 'fillblank' || question.type === 'open') {
    const isCorrect = feedback?.isCorrect;
    return (
      <View className="flex flex-col gap-2">
        {question.type === 'fillblank' && (
          <Text className="text-xs text-slate-400 dark:text-dark-muted">
            Bo'sh joyni to'ldiring:
          </Text>
        )}
        <TextInput
          value={textValue}
          onChangeText={onTextChange}
          placeholder="Javobingizni yozing..."
          placeholderTextColor="#94a3b8"
          editable={!locked}
          multiline={question.type === 'open'}
          numberOfLines={question.type === 'open' ? 4 : 1}
          className={`w-full rounded-2xl border px-4 py-3.5 text-base ${
            isCorrect === true
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : isCorrect === false
              ? 'border-rose-500 bg-rose-500 text-white'
              : 'border-slate-200 bg-slate-50 text-slate-800'
          }`}
        />
        {isCorrect === false && feedback?.correctAnswer && (
          <View className="flex-row items-center gap-2 rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3.5">
            <Text className="flex-1 text-white">{feedback.correctAnswer}</Text>
            <Check size={17} color="white" />
          </View>
        )}
      </View>
    );
  }

  if (question.type === 'matching') {
    return (
      <MatchingQuestion
        questionId={question.id}
        options={question.options}
        selected={selected}
        onSelect={onSetSelected}
        locked={locked}
        feedback={feedback}
      />
    );
  }

  if (question.type === 'truefalse') {
    return (
      <View className="flex-row gap-3">
        {question.options.map((opt) => {
          const checked = selected.includes(opt.id);
          const isTrue = opt.text === "To'g'ri";
          const isCorrectOption = correctIds.has(opt.id);
          const bg = feedback
            ? isCorrectOption
              ? 'border-emerald-500 bg-emerald-500'
              : checked
              ? 'border-rose-500 bg-rose-500'
              : 'border-slate-200 bg-white'
            : checked
            ? 'border-slate-900 bg-slate-900'
            : 'border-slate-200 bg-white';
          const fg = feedback
            ? isCorrectOption || checked
              ? 'text-white'
              : 'text-slate-400'
            : checked
            ? 'text-white'
            : 'text-slate-700';
          return (
            <Pressable
              key={opt.id}
              disabled={locked}
              onPress={() => onToggleOption(opt.id, 'single')}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-4 ${bg}`}>
              <Text className={`text-lg ${fg}`}>{isTrue ? '✓' : '✗'}</Text>
              <Text className={`font-semibold ${fg}`} style={{ fontSize }}>
                {opt.text}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (question.type === 'reorder') {
    return (
      <View className="flex flex-col gap-2">
        <Text className="mb-1 text-xs text-slate-400 dark:text-dark-muted">
          Tugmalar bilan to'g'ri tartibga soling
        </Text>
        <ReorderQuestion
          optionIds={selected}
          options={question.options}
          onChange={onSetSelected}
          locked={locked}
          feedback={feedback}
        />
      </View>
    );
  }

  if (question.type === 'arrange') {
    const correctSeq = feedback?.correctOptionIds ?? [];
    return (
      <View className="flex flex-col gap-3">
        <View className="min-h-14 flex-row flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 dark:bg-dark-surface-2 dark:border-dark-border">
          {selected.length === 0 && (
            <Text className="px-1 text-xs text-slate-300 dark:text-dark-muted">
              Bo'laklarni bosib joylashtiring...
            </Text>
          )}
          {selected.map((id, pos) => {
            const opt = question.options.find((o) => o.id === id);
            const result = feedback
              ? correctSeq[pos] === id
                ? 'correct'
                : 'incorrect'
              : undefined;
            if (!opt) return null;
            return (
              <Pressable
                key={id}
                onPress={() => onArrangeRemove(id)}
                className={`rounded-xl px-3.5 py-2 ${
                  result === 'correct'
                    ? 'bg-emerald-500'
                    : result === 'incorrect'
                    ? 'bg-rose-500'
                    : 'bg-slate-900'
                }`}>
                <Text className="text-white" style={{ fontSize }}>
                  {opt.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View className="flex-row flex-wrap gap-2">
          {question.options
            .filter((o) => !selected.includes(o.id))
            .map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => onArrangeAdd(opt.id)}
                className="rounded-xl bg-white px-3.5 py-2 dark:bg-dark-canvas">
                <Text
                  className="text-slate-700 dark:text-dark-ink"
                  style={{ fontSize }}>
                  {opt.text}
                </Text>
              </Pressable>
            ))}
        </View>
        {selected.length > 0 && !locked && (
          <Pressable onPress={() => onSetSelected([])} className="self-start">
            <Text className="text-xs text-slate-400 dark:text-dark-muted">
              Tozalash
            </Text>
          </Pressable>
        )}
        {feedback?.isCorrect === false && correctSeq.length > 0 && (
          <View className="flex flex-col gap-1.5">
            <Text className="text-xs font-medium text-emerald-700">
              To'g'ri javob
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {correctSeq.map((id) => {
                const opt = question.options.find((o) => o.id === id);
                if (!opt) return null;
                return (
                  <View
                    key={`correct-${id}`}
                    className="rounded-xl bg-emerald-500 px-3.5 py-2">
                    <Text className="text-white" style={{ fontSize }}>
                      {opt.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>
    );
  }

  // single / multi
  return (
    <View className="flex flex-col gap-2.5">
      {question.options.map((opt, i) => {
        const checkedOpt = selected.includes(opt.id);
        const label = OPTION_LABELS[i] ?? String(i + 1);
        const isCorrectOption = correctIds.has(opt.id);
        const unselectedButCorrect = isCorrectOption && !checkedOpt;
        const missedCorrect = unselectedButCorrect && question.type === 'multi';
        const cardClass = feedback
          ? checkedOpt && isCorrectOption
            ? 'bg-emerald-500 border-emerald-500'
            : checkedOpt && !isCorrectOption
            ? 'bg-rose-500 border-rose-500'
            : unselectedButCorrect
            ? 'bg-white border-emerald-500 border-2 dark:bg-dark-card'
            : 'bg-white border-slate-200 dark:bg-dark-card dark:border-dark-border'
          : checkedOpt
          ? 'bg-slate-900 border-slate-900 dark:bg-dark-focus dark:border-dark-focus'
          : 'bg-white border-slate-200 dark:bg-dark-card dark:border-dark-border';
        const textClass = feedback
          ? checkedOpt || unselectedButCorrect
            ? 'text-white'
            : 'text-slate-400 dark:text-dark-muted'
          : checkedOpt
          ? 'text-white'
          : 'text-slate-800 dark:text-dark-ink';
        const badgeClass = checkedOpt
          ? 'bg-white/20'
          : unselectedButCorrect
          ? 'bg-emerald-100'
          : 'bg-slate-100 dark:bg-dark-surface-2';
        const badgeTextClass = checkedOpt
          ? 'text-white'
          : unselectedButCorrect
          ? 'text-emerald-700'
          : 'text-slate-500 dark:text-dark-muted';
        return (
          <Pressable
            key={opt.id}
            disabled={locked}
            onPress={() =>
              onToggleOption(opt.id, question.type as 'single' | 'multi')
            }
            className={`w-full flex-row items-center gap-3 rounded-2xl border px-3 py-3.5 ${cardClass}`}>
            <View
              className={`h-7 w-7 items-center justify-center rounded-xl ${badgeClass}`}>
              <Text className={`text-xs font-bold ${badgeTextClass}`}>
                {label}
              </Text>
            </View>
            <Text
              className={`flex-1 leading-snug ${textClass}`}
              style={{ fontSize }}>
              {opt.text}
            </Text>
            {feedback && checkedOpt && isCorrectOption && (
              <Check size={18} color="white" />
            )}
            {feedback && checkedOpt && !isCorrectOption && (
              <X size={18} color="white" />
            )}
            {feedback && unselectedButCorrect && !missedCorrect && (
              <Check size={18} color="#059669" />
            )}
            {feedback && missedCorrect && (
              <Text className="text-xs font-medium text-emerald-600">
                O'tkazib yubordingiz
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

interface QuestionCardProps extends QuestionRendererProps {
  index?: number;
  showIndex?: boolean;
}

export function QuestionCard({
  question,
  index = 0,
  showIndex = false,
  ...props
}: QuestionCardProps) {
  const qBadge = TYPE_BADGES[question.type];

  return (
    <View className="mb-4 rounded-2xl bg-white p-4 dark:bg-dark-canvas">
      <View className="mb-3 flex-row items-center gap-2">
        {showIndex && (
          <View className="h-7 w-7 items-center justify-center rounded-xl bg-slate-100 dark:bg-dark-surface-2">
            <Text className="text-xs font-bold text-slate-700 dark:text-dark-ink">
              {index + 1}
            </Text>
          </View>
        )}
        {qBadge && (
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: qBadge.bg }}>
            <Text
              className="text-[10px] font-medium"
              style={{ color: qBadge.fg }}>
              {qBadge.label}
            </Text>
          </View>
        )}
      </View>
      <Text
        className="mb-4 font-semibold leading-snug text-ink dark:text-dark-ink"
        style={{ fontSize: props.fontSize }}>
        {question.text}
      </Text>
      {question.imageUrl && question.type !== 'droppin' && (
        <Image
          source={{ uri: mediaUrl(question.imageUrl) }}
          className="mb-4 w-full rounded-xl"
          style={{ height: 180 }}
          resizeMode="cover"
        />
      )}
      <QuestionBody question={question} {...props} />
    </View>
  );
}
