type UnlockableModule = {lessons: {id: string; completed: boolean}[]};

export function computeUnlockedLessonIds(modules: UnlockableModule[]): Set<string> {
  const unlocked = new Set<string>();
  for (const module of modules) {
    for (let i = 0; i < module.lessons.length; i++) {
      const lesson = module.lessons[i];
      if (i === 0) {
        unlocked.add(lesson.id);
        continue;
      }
      if (module.lessons[i - 1].completed) unlocked.add(lesson.id);
      else break;
    }
  }
  return unlocked;
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
