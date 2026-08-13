import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Check, ChevronDown, ChevronUp, X} from 'lucide-react-native';
import type {PublicOption, QuestionFeedback} from '../../types/delivery';

// Web port note: the frontend uses @dnd-kit drag-and-drop (mouse/touch drag)
// for reordering. True drag gesture reordering on native needs a dedicated
// library (react-native-draggable-flatlist) which isn't available in this
// worktree's dependency tree and can't be installed from here (no npm
// install access outside the worktree's isolated sandbox). Up/down move
// buttons are the standard native substitute for drag-reorder lists and
// fully preserve the interaction (student can reach any order), just via
// taps instead of a drag gesture.
export function ReorderQuestion({
  optionIds,
  options,
  onChange,
  locked,
  feedback,
}: {
  optionIds: string[];
  options: PublicOption[];
  onChange: (ids: string[]) => void;
  locked?: boolean;
  feedback?: QuestionFeedback;
}) {
  function move(pos: number, dir: -1 | 1) {
    if (locked) return;
    const target = pos + dir;
    if (target < 0 || target >= optionIds.length) return;
    const next = [...optionIds];
    [next[pos], next[target]] = [next[target], next[pos]];
    onChange(next);
  }

  return (
    <View className="flex flex-col gap-2">
      {optionIds.map((id, pos) => {
        const opt = options.find(o => o.id === id);
        if (!opt) return null;
        const result = feedback
          ? feedback.correctOptionIds?.[pos] === id
            ? 'correct'
            : 'incorrect'
          : undefined;
        return (
          <View
            key={id}
            className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${
              result === 'correct'
                ? 'border-emerald-500 bg-emerald-500'
                : result === 'incorrect'
                  ? 'border-rose-500 bg-rose-500'
                  : 'border-slate-200 bg-white'
            }`}>
            <Text className={`w-5 font-mono text-sm ${result ? 'text-white/70' : 'text-slate-300'}`}>
              {pos + 1}.
            </Text>
            <Text
              className={`min-w-0 flex-1 text-base ${result ? 'text-white' : 'text-slate-800'}`}>
              {opt.text}
            </Text>
            {result === 'correct' && <Check size={18} color="white" />}
            {result === 'incorrect' && <X size={18} color="white" />}
            {!locked && (
              <View className="flex-row gap-1">
                <Pressable
                  onPress={() => move(pos, -1)}
                  disabled={pos === 0}
                  className={`h-8 w-8 items-center justify-center rounded-lg ${result ? 'bg-white/20' : 'bg-slate-100'} ${pos === 0 ? 'opacity-30' : ''}`}>
                  <ChevronUp size={16} color={result ? 'white' : '#475569'} />
                </Pressable>
                <Pressable
                  onPress={() => move(pos, 1)}
                  disabled={pos === optionIds.length - 1}
                  className={`h-8 w-8 items-center justify-center rounded-lg ${result ? 'bg-white/20' : 'bg-slate-100'} ${pos === optionIds.length - 1 ? 'opacity-30' : ''}`}>
                  <ChevronDown size={16} color={result ? 'white' : '#475569'} />
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
      {feedback?.isCorrect === false && feedback.correctOptionIds && (
        <View className="mt-3 flex flex-col gap-2">
          <Text className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            To'g'ri tartib
          </Text>
          {feedback.correctOptionIds.map((id, pos) => {
            const opt = options.find(o => o.id === id);
            if (!opt) return null;
            return (
              <View
                key={`correct-${id}`}
                className="flex-row items-center gap-3 rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3">
                <Text className="w-5 font-mono text-sm text-white/70">{pos + 1}.</Text>
                <Text className="min-w-0 flex-1 text-base text-white">{opt.text}</Text>
                <Check size={18} color="white" />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
