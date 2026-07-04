export interface GradableOption {
  id: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface GradableQuestion {
  type: string;
  correctAnswer: string | null;
  options: GradableOption[];
  text: string;
}

export interface GradeInput {
  selectedOptionIds: string[];
  textAnswer: string | null;
}

export type OpenAnswerChecker = (
  questionText: string,
  correctAnswerHint: string,
  studentAnswer: string,
) => Promise<boolean>;
