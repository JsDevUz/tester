import type { ApiMonthlyPayment } from '../api/payments';

export type ContentBlockType =
  | 'editor'
  | 'video'
  | 'image'
  | 'file'
  | 'live_class'
  | 'button'
  | 'message';

export const CONTENT_BLOCK_LIMIT = 7;
export const PRACTICE_BLOCK_LIMIT = 4;

export interface MessageLine {
  id: string;
  text: string;
  orderIndex: number;
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  fileName?: string;
  previewUrl?: string;
  html?: string;
  embedUrl?: string;
  label?: string;
  processingStatus?: 'uploading' | 'pending' | 'processing' | 'ready' | 'failed';
  sourceKey?: string;
  hlsMasterKey?: string;
  hlsBaseKey?: string;
  aesKeyRef?: string;
  durationSec?: number;
  errorMessage?: string;
  processedAt?: string;
  uploadProgress?: number;
  classSessionId?: string;
  buttonUrl?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  openInNewTab?: boolean;
  messageLines?: MessageLine[];
}

export type PracticeBlockType = 'test' | 'image' | 'oral';

export interface PracticeBlock {
  id: string;
  type: PracticeBlockType;
  testId: string | null;
  description: string;
  maxScore: number | null;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  groupId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface Launch {
  id: string;
  name: string;
  active: boolean;
  plans: PricingPlan[];
}

export interface GroupMember {
  id: string;
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  studentAvatarUrl: string | null;
  role: 'student' | 'curator';
  selectedPlanId: string | null;
  forcedClosed: boolean;
  latestPaymentStatus: 'pending' | 'partial' | 'paid' | 'debt' | null;
}

export interface Group {
  id: string;
  name: string;
  groupChatEnabled: boolean;
  groupChannelEnabled: boolean;
  inviteToken: string;
  paymentDay: number;
  members: GroupMember[];
  plans: PricingPlan[];
}

export interface Lesson {
  id: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  blocks: ContentBlock[];
  practiceEnabled: boolean;
  practiceBlocks: PracticeBlock[];
  passThresholdEnabled: boolean;
  passThresholdPercent: number | null;
  completionScore: number | null;
}

export interface Module {
  id: string;
  title: string;
  orderIndex: number;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  title: string;
  modules: Module[];
  launches: Launch[];
  groups: Group[];
  detailsLoaded?: boolean;
  detailsLoading?: boolean;
}

export interface CourseState {
  courses: Course[];
  coursesLoading: boolean;
  coursesLoaded: boolean;
  coursesError: string | null;
  loadCourses: () => Promise<void>;
  loadCourseDetails: (courseId: string) => Promise<void>;
  addCourse: (title: string) => Promise<Course>;
  renameCourse: (courseId: string, title: string) => Promise<void>;
  deleteCourse: (courseId: string) => Promise<void>;

  addModule: (courseId: string, title: string) => Promise<Module | undefined>;
  renameModule: (courseId: string, moduleId: string, title: string) => Promise<void>;
  deleteModule: (courseId: string, moduleId: string) => Promise<void>;

  addLesson: (courseId: string, moduleId: string, title: string) => Promise<Lesson | undefined>;
  renameLesson: (courseId: string, moduleId: string, lessonId: string, title: string) => Promise<void>;
  deleteLesson: (courseId: string, moduleId: string, lessonId: string) => Promise<void>;
  toggleLessonStatus: (courseId: string, moduleId: string, lessonId: string) => Promise<void>;

  addBlock: (courseId: string, moduleId: string, lessonId: string, block: ContentBlock, file?: File) => Promise<void>;
  addFileBlockFromLibrary: (courseId: string, moduleId: string, lessonId: string, url: string, fileName: string) => Promise<void>;
  addLiveClassBlock: (courseId: string, moduleId: string, lessonId: string, classSessionId: string) => Promise<void>;
  addButtonBlock: (courseId: string, moduleId: string, lessonId: string) => Promise<void>;
  addMessageBlock: (courseId: string, moduleId: string, lessonId: string) => Promise<void>;
  addMessageLine: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;
  updateMessageLine: (courseId: string, moduleId: string, lessonId: string, blockId: string, lineId: string, text: string) => Promise<void>;
  removeMessageLine: (courseId: string, moduleId: string, lessonId: string, blockId: string, lineId: string) => Promise<void>;
  moveMessageLine: (courseId: string, moduleId: string, lessonId: string, blockId: string, lineId: string, direction: 'up' | 'down') => Promise<void>;
  updateBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, data: Partial<ContentBlock>) => Promise<void>;
  removeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;
  moveBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => Promise<void>;
  refreshLessonBlocks: (courseId: string, moduleId: string, lessonId: string) => Promise<void>;
  loadLessonBlocks: (courseId: string, moduleId: string, lessonId: string) => Promise<void>;
  retryVideoBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;

  setLessonPracticeEnabled: (courseId: string, moduleId: string, lessonId: string, enabled: boolean) => void;
  addPracticeBlock: (courseId: string, moduleId: string, lessonId: string, type?: PracticeBlockType) => Promise<void>;
  removePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;
  movePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => Promise<void>;
  setPracticeBlockTest: (courseId: string, moduleId: string, lessonId: string, blockId: string, testId: string) => Promise<void>;
  setPracticeBlockDescription: (courseId: string, moduleId: string, lessonId: string, blockId: string, description: string) => Promise<void>;
  setPracticeBlockMaxScore: (courseId: string, moduleId: string, lessonId: string, blockId: string, maxScore: number | null) => Promise<void>;
  setPassThreshold: (courseId: string, moduleId: string, lessonId: string, data: { enabled: boolean; percent?: number | null }) => Promise<void>;
  setLessonCompletionScore: (courseId: string, moduleId: string, lessonId: string, score: number | null) => Promise<void>;

  addLaunch: (courseId: string, name: string) => Promise<Launch | undefined>;
  toggleLaunchActive: (courseId: string, launchId: string) => Promise<void>;
  renameLaunch: (courseId: string, launchId: string, name: string) => Promise<void>;
  addPricingPlan: (courseId: string, launchId: string, plan: Omit<PricingPlan, 'id'>) => Promise<void>;
  updatePricingPlan: (courseId: string, launchId: string, planId: string, plan: Omit<PricingPlan, 'id'>) => Promise<void>;
  removePricingPlan: (courseId: string, launchId: string, planId: string) => Promise<void>;

  addGroup: (courseId: string, name: string, paymentDay?: number) => Promise<Group | undefined>;
  renameGroup: (courseId: string, groupId: string, name: string) => Promise<void>;
  setGroupPaymentDay: (courseId: string, groupId: string, paymentDay: number) => Promise<void>;
  toggleGroupChat: (courseId: string, groupId: string) => Promise<void>;
  toggleGroupChannel: (courseId: string, groupId: string) => Promise<void>;
  setMemberRole: (courseId: string, groupId: string, memberId: string, role: 'student' | 'curator') => Promise<void>;
  assignCurator: (courseId: string, groupId: string, studentId: string) => Promise<void>;
  demoteCurator: (courseId: string, groupId: string, memberId: string) => Promise<void>;
  enrollStudent: (courseId: string, groupId: string, studentId: string) => Promise<void>;
  setMemberPlan: (courseId: string, groupId: string, memberId: string, planId: string | null) => Promise<void>;
  setMemberForcedClosed: (courseId: string, groupId: string, memberId: string, forcedClosed: boolean) => Promise<void>;
  removeStudentFromGroup: (courseId: string, groupId: string, memberId: string) => Promise<void>;
  deleteGroup: (courseId: string, groupId: string) => Promise<void>;

  loadGroupPayments: (groupId: string) => Promise<ApiMonthlyPayment[]>;
  recordPayment: (paymentId: string, amount: number, discount?: number) => Promise<ApiMonthlyPayment>;
}
