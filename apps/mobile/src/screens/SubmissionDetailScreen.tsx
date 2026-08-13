import React, {useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Clock} from 'lucide-react-native';
import type {RootStackParamList} from '../navigation/types';
import type {AnswerDetail} from '../types/api';
import {apiGetMySubmissionDetail, apiGetSubmissionResult} from '../api/submissions';
import {Empty, Loading, Screen} from '../components/Ui';
import {AnswerResultCard} from '../components/AnswerResultCard';

type Props = NativeStackScreenProps<RootStackParamList, 'SubmissionDetail'>;

type ResultView = {
  score: number | null;
  total: number | null;
  showResults?: string;
  answers: AnswerDetail[];
};

export function SubmissionDetailScreen({route}: Props) {
  const {submissionId, title, source = 'me'} = route.params;
  const [result, setResult] = useState<ResultView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const load =
      source === 'practice'
        ? apiGetSubmissionResult(submissionId, true).then(r => ({
            score: r.score,
            total: r.total,
            showResults: r.showResults,
            answers: r.answers,
          }))
        : apiGetMySubmissionDetail(submissionId).then(d => ({
            score: d.score,
            total: d.total,
            showResults: d.showResults,
            answers: d.answers,
          }));
    load
      .then(r => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submissionId, source]);

  if (loading) return <Loading />;
  if (error || !result) return <Empty text="Natija topilmadi" />;

  const pct = result.total ? Math.round(((result.score ?? 0) / result.total) * 100) : 0;
  const canShowAnswers = result.showResults === 'immediately' || result.showResults === 'per_question';

  return (
    <Screen>
      <ScrollView contentContainerClassName="p-4 pb-10">
        <View className="mb-4 rounded-2xl bg-white px-5 py-4 dark:bg-dark-surface">
          <Text className="text-lg font-bold text-ink dark:text-dark-ink">{title}</Text>
          <Text className="mt-1 text-sm text-slate-400 dark:text-dark-muted">
            {result.score} / {result.total} ball · {pct}%
          </Text>
        </View>

        {!canShowAnswers && (
          <View className="items-center rounded-2xl bg-white px-5 py-12 dark:bg-dark-surface">
            <Clock size={32} color="#cbd5e1" />
            <Text className="mt-3 text-center text-sm text-slate-500 dark:text-dark-muted">
              {result.showResults === 'after_deadline'
                ? 'Natijalar muddat tugagandan keyin ochiladi.'
                : 'Natijalar yashirin.'}
            </Text>
          </View>
        )}

        {canShowAnswers && result.answers.length === 0 && (
          <Text className="py-8 text-center text-sm text-slate-400">Javoblar topilmadi.</Text>
        )}

        {canShowAnswers && (
          <View className="gap-3">
            {result.answers.map((answer, index) => (
              <AnswerResultCard key={answer.questionId} answer={answer} index={index} />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
