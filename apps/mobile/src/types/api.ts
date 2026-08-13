export type Admin = {
  id: string;
  name: string;
  role: 'student' | 'teacher' | 'super' | 'curator';
  phone?: string | null;
  avatarUrl?: string | null;
};
export type User = Admin;

export type Submission = {
  id: string;
  testId: string;
  testName?: string;
  submittedAt: string | null;
  score: number | null;
  total: number | null;
};

export type AnswerDetail = {
  questionId: string;
  questionText: string;
  questionType: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
  correctAnswer?: string | null;
  imageUrl?: string | null;
  isCorrect: boolean | null;
  options: Array<{id: string; text: string; isCorrectOption: boolean}>;
};

export type SubmissionDetail = Submission & {
  showResults?: string;
  answers: AnswerDetail[];
};

export type SubmissionResult = {
  submissionId: string;
  score: number;
  total: number;
  mode?: 'normal' | 'violation' | 'live';
  violationReason?: string | null;
  showResults: 'immediately' | 'after_deadline' | 'hidden' | 'per_question';
  deadline: string | null;
  answers: AnswerDetail[];
};

export type ApiMySchool = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  studentCount: number;
};

export type ApiMyCourse = {
  courseId: string;
  courseTitle: string;
  groupName: string;
  selectedPlanName: string | null;
  latestPaymentStatus: 'pending' | 'partial' | 'paid' | 'debt' | null;
  hasAccess: boolean;
  starsEarned: number;
  starsMax: number;
  studentCount: number;
  lessonsCompleted: number;
  lessonsTotal: number;
  progressPercent: number;
};

export type ApiMyCourseLeaderboardEntry = {
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  starsEarned: number;
  lessonsCompleted: number;
  lessonsTotal: number;
  isCurrentStudent: boolean;
  rank: number;
};

export type ApiMyCourseLeaderboard = {
  courseTitle: string;
  entries: ApiMyCourseLeaderboardEntry[];
};

export type ApiMessageLine = {id: string; text: string; orderIndex: number};

export type ApiContentBlock = {
  id: string;
  type: 'editor' | 'video' | 'image' | 'file' | 'live_class' | 'button' | 'message';
  html?: string | null;
  embedUrl?: string | null;
  previewUrl?: string | null;
  label?: string | null;
  fileName?: string | null;
  durationSec?: number | null;
  processingStatus?: string | null;
  classSessionId?: string | null;
  buttonUrl?: string | null;
  buttonColor?: string | null;
  buttonTextColor?: string | null;
  openInNewTab?: boolean;
  messageLines?: ApiMessageLine[];
  messageSender?: {name: string; avatarUrl: string | null};
  [key: string]: unknown;
};

export type ApiMyPracticeSubmission = {
  id: string;
  submittedAt: string;
  score: number;
  total: number;
};

export type ApiMyImageSubmission = {
  id: string;
  imageUrl: string;
  submittedAt: string;
  score: number | null;
  graded: boolean;
};

export type ApiMyPracticeBlock = {
  id: string;
  type: 'test' | 'image' | 'oral';
  testId: string | null;
  testSlug: string | null;
  testName: string | null;
  description: string;
  maxScore: number | null;
  earnedScore: number | null;
  submissions: ApiMyPracticeSubmission[];
  attemptsRemaining: number | null;
  imageSubmissions: ApiMyImageSubmission[];
  oralGrade: {score: number; gradedAt: string} | null;
};

export type ApiMyLesson = {
  id: string;
  moduleId: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  createdAt: string;
  blocks: ApiContentBlock[];
  practiceBlocks: ApiMyPracticeBlock[];
  passThresholdEnabled: boolean;
  passThresholdPercent: number | null;
  completionScore: number | null;
  completed: boolean;
  combinedPracticePercent: number | null;
};

export type ApiMyModule = {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
  createdAt: string;
  lessons: ApiMyLesson[];
};

export type ApiMyCourseDetail = {
  id: string;
  title: string;
  curatorName: string | null;
  modules: ApiMyModule[];
};

export type ChatPreview = {
  id: string;
  courseId: string;
  student: {id: string; name: string; avatarUrl: string | null};
  curator: {id: string; name: string; avatarUrl: string | null};
  courseTitle: string;
  groupName: string;
  lastMessage: {content: string; type: string; createdAt: string} | null;
};

export type ChatMessage = {
  id: string;
  sender: {id: string; name: string; avatarUrl: string | null};
  type: 'text' | 'practice_test' | 'practice_image' | 'practice_grade';
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyTo: {id: string; senderName: string; content: string; type: string} | null;
  metadata: Record<string, unknown>;
  practice: {id: string; title: string; maxScore: number | null} | null;
  testSubmission: {
    id: string;
    score: number | null;
    total: number | null;
    practiceScore: number | null;
    scoreOverridden: boolean;
    scoreOverriddenAt: string | null;
  } | null;
  imageSubmission: {id: string; imageUrl: string; score: number | null; gradedAt: string | null} | null;
  imageSubmissions: Array<{
    id: string;
    imageUrl: string;
    score: number | null;
    gradedAt: string | null;
    submittedAt: string;
  }>;
};

export type ChatDetail = {
  id: string;
  student: {id: string; name: string; avatarUrl: string | null};
  curator: {id: string; name: string; avatarUrl: string | null};
  groupName: string;
  courseTitle: string;
};

export type ChatPage = {
  chat: ChatDetail;
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type PracticeMessengerSocketPayload = {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
};
export type ActiveClass = {
  id: string;
  courseId: string;
  courseName: string;
  startedAt: number;
};

export type ApiStudentChallenge = {id: string; name: string; description: string; imageUrl: string | null; type: string; courseId: string; courseTitle: string; joined: boolean};
export type ApiMyChallengeBook = {id: string; title: string; totalPages: number; lastPageRead: number; completed: boolean; pendingTest: {testId: string; slug: string; name: string} | null};
export type ApiMyChallengeDetail = {id: string; name: string; description: string; imageUrl: string | null; type: string; books: ApiMyChallengeBook[]};
export type ApiChallengeEvent = {id: string; challengeBookId: string; startPage: number; endPage: number; newWordsCount: number; createdAt: string; book: {id: string; title: string}};
export type ChallengeLeaderboardMetric = 'overall' | 'books' | 'words' | 'speed';
export type ApiChallengeLeaderboardEntry = {studentId: string; studentName: string; studentAvatarUrl: string | null; value: number; rank: number; isCurrentStudent: boolean};
export type ApiStudentChallengeWord = {id: string; word: string; translation: string; known: boolean};
export type ApiChallengeWordLeaderboardEntry = ApiChallengeLeaderboardEntry;
