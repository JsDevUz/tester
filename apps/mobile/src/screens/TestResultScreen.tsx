import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/types';
import {TestResultView} from '../components/testTaker/TestResultView';
import {Screen} from '../components/Ui';

type Props = NativeStackScreenProps<RootStackParamList, 'TestResult'>;

// Standalone result view — used for viewing a past submission (from History
// or a practice block's attempt list) outside the live test-taking flow.
// TestTakerScreen renders TestResultView directly instead of navigating here
// when a test is just-submitted, to avoid a redundant re-fetch.
export function TestResultScreen({route, navigation}: Props) {
  const {submissionId, practiceMode} = route.params;
  return (
    <Screen>
      <TestResultView submissionId={submissionId} practiceMode={practiceMode} onBack={() => navigation.goBack()} />
    </Screen>
  );
}
