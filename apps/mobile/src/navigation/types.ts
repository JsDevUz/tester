export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Courses: { schoolId: string; schoolName: string };
  Course: { courseId: string; title: string };
  Web: { path: string; title: string; onlineRequired?: boolean };
  Chat: { chatId: string; title: string };
  Classroom: { sessionId: string };
  ClassroomReplay: { sessionId: string };
  Live: undefined;
  ChallengesList: undefined;
  ChallengeDetail: { challengeId: string; title: string };
  ChallengeWordPractice: { challengeId: string; title: string };
  SubmissionDetail: {
    submissionId: string;
    title: string;
    source?: 'me' | 'practice';
  };
  SchoolInvite: { token: string };
  TestTaker: {
    slug: string;
    title: string;
    practiceMode: boolean;
    submissionId?: string;
  };
  TestResult: { submissionId: string; title: string; practiceMode: boolean };
  MyTests: undefined;
  MyTestFolder: {folderId: string; folderName: string};
  MyTestQuestionEditor: {testId: string; testName: string};
  MyDictionaries: undefined;
  EditProfile: undefined;
  WordDeck: {deckId: string; deckName: string; slug: string};
  DeckPractice: {slug: string; deckName?: string};
};
export type TabParamList = {
  Schools: undefined;
  History: undefined;
  Messenger: undefined;
  Jamm: undefined;
  Profile: undefined;
};
