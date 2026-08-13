type CompletableLesson = {completed: boolean};

export function computeMaxUnlockedIndex(lessons: CompletableLesson[]): number {
  if (lessons.length === 0) return -1;
  let idx = 0;
  for (let i = 0; i < lessons.length - 1; i++) {
    if (!lessons[i].completed) break;
    idx = i + 1;
  }
  return idx;
}

type PassableLesson = {
  practiceBlocks: {type: string; submissions: unknown[]}[];
  passThresholdEnabled: boolean;
  combinedPracticePercent: number | null;
  passThresholdPercent: number | null;
};

export function isLessonPassing(lesson: PassableLesson): boolean {
  const allTestsAttempted = lesson.practiceBlocks
    .filter(block => block.type === 'test')
    .every(block => block.submissions.length > 0);
  if (!allTestsAttempted) return false;
  if (!lesson.passThresholdEnabled) return true;
  if (lesson.combinedPracticePercent === null) return false;
  return lesson.combinedPracticePercent >= (lesson.passThresholdPercent ?? 0);
}

type StarredLessonEntry = {
  lesson: {
    practiceBlocks: {maxScore: number | null; earnedScore: number | null}[];
    completionScore: number | null;
    completed: boolean;
  };
};

export function computeCourseStars(entries: StarredLessonEntry[]): {
  earned: number;
  max: number;
} {
  let earned = 0;
  let max = 0;
  for (const {lesson} of entries) {
    for (const block of lesson.practiceBlocks) {
      max += block.maxScore ?? 0;
      earned += block.earnedScore ?? 0;
    }
    if (lesson.completionScore !== null) {
      max += lesson.completionScore;
      if (lesson.completed) earned += lesson.completionScore;
    }
  }
  return {earned, max};
}
