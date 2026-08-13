import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Pressable, Text, View, type LayoutChangeEvent} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';
import {useColorScheme} from 'nativewind';
import type {PublicOption, QuestionFeedback} from '../../types/delivery';
import {seededShuffle} from '../../lib/testTaker';

type Connection = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  result: 'neutral' | 'correct' | 'incorrect';
};

export function MatchingQuestion({
  questionId,
  options,
  selected,
  onSelect,
  locked,
  feedback,
}: {
  questionId: string;
  options: PublicOption[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  locked?: boolean;
  feedback?: QuestionFeedback;
}) {
  const lefts = useMemo(
    () => seededShuffle(options.filter((_, i) => i % 2 === 0), `${questionId}:left`),
    [questionId, options],
  );
  const rights = useMemo(
    () => seededShuffle(options.filter((_, i) => i % 2 !== 0), `${questionId}:right`),
    [questionId, options],
  );
  const [pendingLeft, setPendingLeft] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState({width: 0, height: 0});
  const leftLayouts = useRef(new Map<string, {y: number; height: number}>());
  const rightLayouts = useRef(new Map<string, {y: number; height: number}>());
  const [connections, setConnections] = useState<Connection[]>([]);

  const pairedLeftIds = selected.filter((_, i) => i % 2 === 0);
  const pairedRightIds = selected.filter((_, i) => i % 2 !== 0);
  const correctIds = feedback?.correctOptionIds ?? [];
  const correctPairs = new Map<string, string>();
  for (let index = 0; index < correctIds.length; index += 2) {
    if (correctIds[index] && correctIds[index + 1]) correctPairs.set(correctIds[index], correctIds[index + 1]);
  }

  const [leftColWidth, setLeftColWidth] = useState(0);

  // Columns are spaced by a tight gap, with left column taking ~38% and right
  // taking ~58% of available width to comfortably fit long definitions.
  const COLUMN_GAP = 20;

  function recomputeConnections() {
    if (!boardSize.width) return;
    const colWidth = leftColWidth || (boardSize.width - COLUMN_GAP) * 0.38;
    const selectedPairs = pairedLeftIds.map((leftId, index) => ({
      key: `selected-${leftId}-${pairedRightIds[index]}`,
      leftId,
      rightId: pairedRightIds[index],
      result: !feedback
        ? ('neutral' as const)
        : correctPairs.get(leftId) === pairedRightIds[index]
          ? ('correct' as const)
          : ('incorrect' as const),
    }));
    const selectedPairKeys = new Set(selectedPairs.map(p => `${p.leftId}:${p.rightId}`));
    const missingCorrectPairs = feedback
      ? [...correctPairs.entries()]
          .filter(([leftId, rightId]) => !selectedPairKeys.has(`${leftId}:${rightId}`))
          .map(([leftId, rightId]) => ({
            key: `correct-${leftId}-${rightId}`,
            leftId,
            rightId,
            result: 'correct' as const,
          }))
      : [];
    const next: Connection[] = [];
    for (const pair of [...selectedPairs, ...missingCorrectPairs]) {
      const left = leftLayouts.current.get(pair.leftId);
      const right = rightLayouts.current.get(pair.rightId);
      if (!left || !right) continue;
      next.push({
        key: pair.key,
        x1: colWidth,
        y1: left.y + left.height / 2,
        x2: colWidth + COLUMN_GAP,
        y2: right.y + right.height / 2,
        result: pair.result,
      });
    }
    setConnections(next);
  }

  useLayoutEffect(() => {
    recomputeConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, options, feedback, boardSize, leftColWidth]);

  function tapLeft(id: string) {
    if (locked) return;
    const existingIdx = pairedLeftIds.indexOf(id);
    if (existingIdx !== -1) {
      const newSel = [...selected];
      newSel.splice(existingIdx * 2, 2);
      onSelect(newSel);
    }
    setPendingLeft(id);
  }

  function tapRight(id: string) {
    if (locked || !pendingLeft) return;
    const existingIdx = pairedRightIds.indexOf(id);
    const newSel =
      existingIdx !== -1 ? selected.filter((_, i) => Math.floor(i / 2) !== existingIdx) : [...selected];
    onSelect([...newSel, pendingLeft, id]);
    setPendingLeft(null);
  }

  function colorFor(result: 'neutral' | 'correct' | 'incorrect', dark: boolean) {
    if (result === 'correct') return '#10b981';
    if (result === 'incorrect') return '#f43f5e';
    return dark ? '#6b7280' : '#94a3b8';
  }

  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View className="flex flex-col gap-3">
      <Text className="text-xs text-slate-400 dark:text-dark-muted">
        Chap tomondagini bosing, keyin mos o'ng tomondagini bosing
      </Text>
      <View
        className="relative flex-row"
        style={{gap: COLUMN_GAP}}
        onLayout={(e: LayoutChangeEvent) =>
          setBoardSize({width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height})
        }>
        {boardSize.width > 0 && (
          <Svg
            style={{position: 'absolute', top: 0, left: 0}}
            width={boardSize.width}
            height={boardSize.height}
            pointerEvents="none">
            {connections.map(c => {
              const bend = Math.max(6, (c.x2 - c.x1) * 0.45);
              const color = colorFor(c.result, isDark);
              return (
                <React.Fragment key={c.key}>
                  <Path
                    d={`M ${c.x1} ${c.y1} C ${c.x1 + bend} ${c.y1}, ${c.x2 - bend} ${c.y2}, ${c.x2} ${c.y2}`}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                  />
                  <Circle cx={c.x1} cy={c.y1} r={3} fill={color} />
                  <Circle cx={c.x2} cy={c.y2} r={3} fill={color} />
                </React.Fragment>
              );
            })}
          </Svg>
        )}
        <View
          className="flex-[2] flex flex-col gap-2"
          onLayout={(e: LayoutChangeEvent) => setLeftColWidth(e.nativeEvent.layout.width)}>
          {lefts.map(opt => {
            const isPaired = pairedLeftIds.includes(opt.id);
            const isPending = pendingLeft === opt.id;
            return (
              <Pressable
                key={opt.id}
                disabled={locked}
                onLayout={(e: LayoutChangeEvent) =>
                  leftLayouts.current.set(opt.id, {
                    y: e.nativeEvent.layout.y,
                    height: e.nativeEvent.layout.height,
                  })
                }
                onPress={() => tapLeft(opt.id)}
                className={`z-10 rounded-2xl border px-3 py-2.5 ${
                  isPending
                    ? 'border-slate-900 bg-slate-900 dark:border-dark-focus dark:bg-dark-focus'
                    : isPaired
                      ? 'border-slate-400 bg-slate-100 dark:border-dark-border dark:bg-dark-surface-2'
                      : 'border-slate-200 bg-white dark:border-dark-border dark:bg-dark-card'
                }`}>
                <Text
                  className={
                    isPending
                      ? 'text-white'
                      : isPaired
                        ? 'text-slate-800 dark:text-dark-ink'
                        : 'text-slate-700 dark:text-dark-ink'
                  }>
                  {opt.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View className="flex-[3] flex flex-col gap-2">
          {rights.map(opt => {
            const isPaired = pairedRightIds.includes(opt.id);
            return (
              <Pressable
                key={opt.id}
                disabled={(!pendingLeft && !isPaired) || locked}
                onLayout={(e: LayoutChangeEvent) =>
                  rightLayouts.current.set(opt.id, {
                    y: e.nativeEvent.layout.y,
                    height: e.nativeEvent.layout.height,
                  })
                }
                onPress={() => tapRight(opt.id)}
                className={`z-10 rounded-2xl border px-3 py-2.5 ${
                  isPaired
                    ? 'border-slate-400 bg-slate-100 dark:border-dark-border dark:bg-dark-surface-2'
                    : pendingLeft
                      ? 'border-slate-400 bg-white dark:border-dark-border dark:bg-dark-card'
                      : 'border-slate-200 bg-slate-50 dark:border-dark-border dark:bg-dark-surface-2'
                }`}>
                <Text
                  className={
                    isPaired
                      ? 'text-slate-800 dark:text-dark-ink'
                      : pendingLeft
                        ? 'text-slate-700 dark:text-dark-ink'
                        : 'text-slate-400 dark:text-dark-muted'
                  }>
                  {opt.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {selected.length > 0 && !locked && (
        <Pressable
          onPress={() => {
            onSelect([]);
            setPendingLeft(null);
          }}
          className="self-start">
          <Text className="text-xs text-slate-400 dark:text-dark-muted">Tozalash</Text>
        </Pressable>
      )}
    </View>
  );
}
