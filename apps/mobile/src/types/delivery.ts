// Mirrors apps/frontend/src/api/delivery.ts's public-test-taking types.
// Kept as a separate file (rather than folded into types/api.ts) since these
// map to the `/public/*` delivery endpoints, a distinct surface from the
// `/my/*` and `/me/*` endpoints the rest of types/api.ts describes.

export type PublicQuestionType =
  | 'single'
  | 'multi'
  | 'open'
  | 'arrange'
  | 'truefalse'
  | 'reorder'
  | 'matching'
  | 'fillblank'
  | 'slider'
  | 'droppin';

export type PublicOption = {
  id: string;
  text: string;
  orderIndex: number;
};

export type PublicQuestion = {
  id: string;
  text: string;
  type: PublicQuestionType;
  orderIndex: number;
  imageUrl?: string | null;
  audioUrl?: string | null;
  options: PublicOption[];
};

export type PublicTest = {
  id: string;
  name: string;
  description: string | null;
  timeLimit: number | null;
  showResults: 'immediately' | 'after_deadline' | 'hidden' | 'per_question';
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  oneByOne: boolean;
  requireAuth: boolean;
  autoCompleteOnLeave: boolean;
  onceOnly: boolean;
  previousSubmission: {score: number | null; total: number | null} | null;
  deadline: string | null;
  questions: PublicQuestion[];
};

export type GetSubmissionResponse =
  | {status: 'in_progress'; testId: string; studentName: string}
  | {
      status: 'submitted';
      score: number;
      total: number;
      showResults: string;
      deadline: string | null;
      mode?: 'normal' | 'violation' | 'live';
      violationReason?: string | null;
    };

export type AnswerResultItem = {
  questionId: string;
  questionText: string;
  questionType: string;
  isCorrect: boolean | null;
  selectedOptionIds: string[];
  textAnswer: string | null;
  correctAnswer?: string | null;
  imageUrl?: string | null;
  options?: Array<{id: string; text: string; isCorrectOption: boolean}>;
};

export type SubmissionResult = {
  submissionId: string;
  score: number;
  total: number;
  mode?: 'normal' | 'violation' | 'live';
  violationReason?: string | null;
  showResults: 'immediately' | 'after_deadline' | 'hidden' | 'per_question';
  deadline: string | null;
  answers: AnswerResultItem[];
};

export type QuestionFeedback = {
  isCorrect: boolean | null;
  correctAnswer?: string | null;
  correctOptionIds?: string[];
};

export type AnswerPayload = {
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
};
