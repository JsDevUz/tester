import { create } from 'zustand';
import { apiListCourses, apiCreateCourse, apiRenameCourse, apiDeleteCourse, type ApiCourse } from '../api/courses';
import { apiListModules, apiCreateModule, apiRenameModule, apiDeleteModule } from '../api/modules';
import { apiListLessons, apiCreateLesson, apiUpdateLesson, apiDeleteLesson } from '../api/lessons';
import {
  apiListBlocks,
  apiCreateBlock,
  apiUpdateBlock,
  apiDeleteBlock,
  apiReorderBlocks,
  apiUploadVideoBlock,
  apiRetryVideoBlock,
  type ApiContentBlock,
} from '../api/contentBlocks';
import {
  apiListGroups, apiCreateGroup, apiUpdateGroup, apiDeleteGroup,
  apiListGroupMembers, apiUpdateGroupMember, apiSetMemberForcedClosed, apiRemoveGroupMember,
  apiAssignCurator, apiEnrollStudent,
} from '../api/groups';
import {
  apiListLaunches, apiCreateLaunch, apiUpdateLaunch,
  apiCreatePricingPlan, apiDeletePricingPlan,
} from '../api/launches';
import { apiListGroupPayments, apiRecordPayment, type ApiMonthlyPayment } from '../api/payments';

export type ContentBlockType = 'editor' | 'video' | 'image' | 'file';
export const CONTENT_BLOCK_LIMIT = 7;
export const PRACTICE_BLOCK_LIMIT = 4;

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  fileName?: string;
  previewUrl?: string;
  // editor: Tiptap HTML chiqishi
  html?: string;
  // video: YouTube (yoki boshqa) tashqi havola, fayl yuklash o'rniga/bilan birga
  embedUrl?: string;
  // video/image/file: o'qituvchi kiritgan ko'rinadigan nom (fileName'dan mustaqil, u asl fayl nomini saqlaydi)
  label?: string;
  processingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  sourceKey?: string;
  hlsMasterKey?: string;
  hlsBaseKey?: string;
  aesKeyRef?: string;
  durationSec?: number;
  errorMessage?: string;
  processedAt?: string;
  uploadProgress?: number;
}

export type PracticeBlockType = 'test' | 'image' | 'file' | 'audio';

export interface PracticeBlock {
  id: string;
  type: PracticeBlockType;
  testId: string | null;
  description: string;
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
}

interface CourseState {
  courses: Course[];
  loadCourses: () => Promise<void>;
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
  updateBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, data: Partial<ContentBlock>) => Promise<void>;
  removeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;
  moveBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => Promise<void>;
  refreshLessonBlocks: (courseId: string, moduleId: string, lessonId: string) => Promise<void>;
  retryVideoBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;

  setLessonPracticeEnabled: (courseId: string, moduleId: string, lessonId: string, enabled: boolean) => void;
  addPracticeBlock: (courseId: string, moduleId: string, lessonId: string, type: PracticeBlockType) => void;
  removePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => void;
  movePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => void;
  setPracticeBlockTest: (courseId: string, moduleId: string, lessonId: string, blockId: string, testId: string) => void;
  setPracticeBlockDescription: (courseId: string, moduleId: string, lessonId: string, blockId: string, description: string) => void;
  setPassThreshold: (courseId: string, moduleId: string, lessonId: string, data: { enabled: boolean; percent?: number | null }) => void;

  addLaunch: (courseId: string, name: string) => Promise<Launch | undefined>;
  toggleLaunchActive: (courseId: string, launchId: string) => Promise<void>;
  renameLaunch: (courseId: string, launchId: string, name: string) => Promise<void>;
  addPricingPlan: (courseId: string, launchId: string, plan: Omit<PricingPlan, 'id'>) => Promise<void>;
  removePricingPlan: (courseId: string, launchId: string, planId: string) => Promise<void>;

  addGroup: (courseId: string, name: string, paymentDay?: number) => Promise<Group | undefined>;
  renameGroup: (courseId: string, groupId: string, name: string) => Promise<void>;
  toggleGroupChat: (courseId: string, groupId: string) => Promise<void>;
  toggleGroupChannel: (courseId: string, groupId: string) => Promise<void>;
  setMemberRole: (courseId: string, groupId: string, memberId: string, role: 'student' | 'curator') => Promise<void>;
  assignCurator: (courseId: string, groupId: string, studentId: string) => Promise<void>;
  enrollStudent: (courseId: string, groupId: string, studentId: string) => Promise<void>;
  setMemberPlan: (courseId: string, groupId: string, memberId: string, planId: string | null) => Promise<void>;
  setMemberForcedClosed: (courseId: string, groupId: string, memberId: string, forcedClosed: boolean) => Promise<void>;
  removeStudentFromGroup: (courseId: string, groupId: string, memberId: string) => Promise<void>;
  deleteGroup: (courseId: string, groupId: string) => Promise<void>;

  loadGroupPayments: (groupId: string) => Promise<ApiMonthlyPayment[]>;
  recordPayment: (paymentId: string, amount: number, discount?: number) => Promise<ApiMonthlyPayment>;
}

function newId(): string {
  return crypto.randomUUID();
}

function toFrontendCourse(apiCourse: ApiCourse): Course {
  return { id: apiCourse.id, title: apiCourse.title, modules: [], launches: [], groups: [] };
}

function toFrontendBlock(b: ApiContentBlock): ContentBlock {
  return {
    id: b.id,
    type: b.type,
    html: b.html ?? undefined,
    fileName: b.fileName ?? undefined,
    previewUrl: b.previewUrl ?? undefined,
    embedUrl: b.embedUrl ?? undefined,
    label: b.label ?? undefined,
    processingStatus: b.processingStatus,
    sourceKey: b.sourceKey ?? undefined,
    hlsMasterKey: b.hlsMasterKey ?? undefined,
    hlsBaseKey: b.hlsBaseKey ?? undefined,
    aesKeyRef: b.aesKeyRef ?? undefined,
    durationSec: b.durationSec ?? undefined,
    errorMessage: b.errorMessage ?? undefined,
    processedAt: b.processedAt ?? undefined,
  };
}

export const useCourseStore = create<CourseState>((set, get) => ({
  courses: [],

  loadCourses: async () => {
    const courseRows = await apiListCourses();
    const courses = await Promise.all(
      courseRows.map(async (courseRow) => {
        const [moduleRows, groupRows, launchRows] = await Promise.all([
          apiListModules(courseRow.id),
          apiListGroups(courseRow.id),
          apiListLaunches(courseRow.id),
        ]);
        const moduleList: Module[] = await Promise.all(
          moduleRows.map(async (moduleRow) => {
            const lessonRows = await apiListLessons(moduleRow.id);
            const lessonList: Lesson[] = await Promise.all(
              lessonRows.map(async (l) => {
                const blockRows = await apiListBlocks(l.id);
                const blocks: ContentBlock[] = blockRows.map(toFrontendBlock);
                return {
                  id: l.id,
                  title: l.title,
                  orderIndex: l.orderIndex,
                  status: l.status,
                  blocks,
                  practiceEnabled: false,
                  practiceBlocks: [],
                  passThresholdEnabled: false,
                  passThresholdPercent: null,
                };
              }),
            );
            return { id: moduleRow.id, title: moduleRow.title, orderIndex: moduleRow.orderIndex, lessons: lessonList };
          }),
        );

        const groupList: Group[] = await Promise.all(
          groupRows.map(async (groupRow) => {
            const memberRows = await apiListGroupMembers(groupRow.id);
            const members: GroupMember[] = memberRows.map((m) => ({
              id: m.id,
              studentId: m.studentId,
              studentName: m.student.name,
              studentPhone: m.student.phone,
              role: m.role,
              selectedPlanId: m.selectedPlanId,
              forcedClosed: m.forcedClosed,
              latestPaymentStatus: m.latestPayment?.status ?? null,
            }));
            const plans: PricingPlan[] = launchRows
              .flatMap((l) => l.plans)
              .filter((p) => p.groupId === groupRow.id)
              .map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                price: p.price,
                originalPrice: p.originalPrice,
                groupId: p.groupId,
                startDate: p.startDate,
                endDate: p.endDate,
              }));
            return {
              id: groupRow.id,
              name: groupRow.name,
              groupChatEnabled: groupRow.groupChatEnabled,
              groupChannelEnabled: groupRow.groupChannelEnabled,
              inviteToken: groupRow.inviteToken,
              paymentDay: groupRow.paymentDay,
              members,
              plans,
            };
          }),
        );

        const launchList: Launch[] = launchRows.map((launchRow) => ({
          id: launchRow.id,
          name: launchRow.name,
          active: launchRow.active,
          plans: launchRow.plans.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            originalPrice: p.originalPrice,
            groupId: p.groupId,
            startDate: p.startDate,
            endDate: p.endDate,
          })),
        }));

        return {
          id: courseRow.id,
          title: courseRow.title,
          modules: moduleList,
          launches: launchList,
          groups: groupList,
        };
      }),
    );
    set({ courses });
  },
  addCourse: async (title) => {
    const row = await apiCreateCourse(title);
    const course = toFrontendCourse(row);
    set({ courses: [...get().courses, course] });
    return course;
  },
  renameCourse: async (courseId, title) => {
    await apiRenameCourse(courseId, title);
    set({
      courses: get().courses.map((c) => (c.id === courseId ? { ...c, title } : c)),
    });
  },
  deleteCourse: async (courseId) => {
    await apiDeleteCourse(courseId);
    set({ courses: get().courses.filter((c) => c.id !== courseId) });
  },

  addModule: async (courseId, title) => {
    const row = await apiCreateModule(courseId, title);
    const module: Module = { id: row.id, title: row.title, orderIndex: row.orderIndex, lessons: [] };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, modules: [...c.modules, module] } : c,
      ),
    });
    return module;
  },
  renameModule: async (courseId, moduleId, title) => {
    await apiRenameModule(moduleId, title);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, modules: c.modules.map((m) => (m.id === moduleId ? { ...m, title } : m)) },
      ),
    });
  },
  deleteModule: async (courseId, moduleId) => {
    await apiDeleteModule(moduleId);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId ? c : { ...c, modules: c.modules.filter((m) => m.id !== moduleId) },
      ),
    });
  },

  addLesson: async (courseId, moduleId, title) => {
    const row = await apiCreateLesson(moduleId, title);
    const lesson: Lesson = {
      id: row.id,
      title: row.title,
      orderIndex: row.orderIndex,
      status: row.status,
      blocks: [],
      practiceEnabled: false,
      practiceBlocks: [],
      passThresholdEnabled: false,
      passThresholdPercent: null,
    };
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId ? m : { ...m, lessons: [...m.lessons, lesson] },
              ),
            },
      ),
    });
    return lesson;
  },
  renameLesson: async (courseId, moduleId, lessonId, title) => {
    await apiUpdateLesson(lessonId, { title });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, title } : l)),
                    },
              ),
            },
      ),
    });
  },
  deleteLesson: async (courseId, moduleId, lessonId) => {
    await apiDeleteLesson(lessonId);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) },
              ),
            },
      ),
    });
  },
  toggleLessonStatus: async (courseId, moduleId, lessonId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const nextStatus = lesson.status === 'draft' ? 'published' : 'draft';
    await apiUpdateLesson(lessonId, { status: nextStatus });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id === lessonId ? { ...l, status: nextStatus } : l,
                      ),
                    },
              ),
            },
      ),
    });
  },

  addBlock: async (courseId, moduleId, lessonId, block, file) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson || lesson.blocks.length >= CONTENT_BLOCK_LIMIT) return;

    let newBlock = block;
    if (block.type === 'editor') {
      const row = await apiCreateBlock(lessonId, 'editor');
      newBlock = toFrontendBlock(row);
      if (newBlock.type === 'editor') newBlock.html = newBlock.html ?? '';
    } else if (block.type === 'video' && file) {
      const row = await apiUploadVideoBlock(lessonId, file, block.label ?? file.name, (percent) => {
        set({
          courses: get().courses.map((c) =>
            c.id !== courseId
              ? c
              : {
                  ...c,
                  modules: c.modules.map((m) =>
                    m.id !== moduleId
                      ? m
                      : {
                          ...m,
                          lessons: m.lessons.map((l) =>
                            l.id !== lessonId
                              ? l
                              : {
                                  ...l,
                                  blocks: l.blocks.map((b) =>
                                    b.id === block.id ? { ...b, uploadProgress: percent } : b,
                                  ),
                                },
                          ),
                        },
                  ),
                },
          ),
        });
      });
      newBlock = toFrontendBlock(row);
    }

    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId || l.blocks.length >= CONTENT_BLOCK_LIMIT
                          ? l
                          : { ...l, blocks: [...l.blocks, newBlock] },
                      ),
                    },
              ),
            },
      ),
    });
  },
  updateBlock: async (courseId, moduleId, lessonId, blockId, data) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    const block = lesson?.blocks.find((b) => b.id === blockId);

    if (block?.type === 'editor' || block?.type === 'video') {
      const row = await apiUpdateBlock(blockId, { html: data.html, label: data.label, embedUrl: data.embedUrl });
      data = { ...data, ...toFrontendBlock(row) };
    }

    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : {
                              ...l,
                              blocks: l.blocks.map((b) => (b.id === blockId ? { ...b, ...data } : b)),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  removeBlock: async (courseId, moduleId, lessonId, blockId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    const block = lesson?.blocks.find((b) => b.id === blockId);

    if (block?.type === 'editor' || block?.type === 'video') {
      await apiDeleteBlock(blockId);
    }

    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : { ...l, blocks: l.blocks.filter((b) => b.id !== blockId) },
                      ),
                    },
              ),
            },
      ),
    });
  },
  moveBlock: async (courseId, moduleId, lessonId, blockId, direction) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;

    const index = lesson.blocks.findIndex((b) => b.id === blockId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= lesson.blocks.length) return;

    const reordered = [...lesson.blocks];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

    const persistedBlockIds = reordered.filter((b) => b.type === 'editor' || b.type === 'video').map((b) => b.id);
    if (persistedBlockIds.length > 0) {
      await apiReorderBlocks(lessonId, persistedBlockIds);
    }

    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId ? l : { ...l, blocks: reordered },
                      ),
                    },
              ),
            },
      ),
    });
  },
  refreshLessonBlocks: async (courseId, moduleId, lessonId) => {
    const blockRows = await apiListBlocks(lessonId);
    const blocks = blockRows.map(toFrontendBlock);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, blocks } : l)),
                    },
              ),
            },
      ),
    });
  },
  retryVideoBlock: async (courseId, moduleId, lessonId, blockId) => {
    const row = await apiRetryVideoBlock(blockId);
    const updated = toFrontendBlock(row);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : { ...l, blocks: l.blocks.map((b) => (b.id === blockId ? updated : b)) },
                      ),
                    },
              ),
            },
      ),
    });
  },

  setLessonPracticeEnabled: (courseId, moduleId, lessonId, enabled) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id === lessonId ? { ...l, practiceEnabled: enabled } : l,
                      ),
                    },
              ),
            },
      ),
    });
  },
  addPracticeBlock: (courseId, moduleId, lessonId, type) => {
    const block: PracticeBlock = { id: newId(), type, testId: null, description: '' };
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId || l.practiceBlocks.length >= PRACTICE_BLOCK_LIMIT
                          ? l
                          : { ...l, practiceBlocks: [...l.practiceBlocks, block] },
                      ),
                    },
              ),
            },
      ),
    });
  },
  removePracticeBlock: (courseId, moduleId, lessonId, blockId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : { ...l, practiceBlocks: l.practiceBlocks.filter((b) => b.id !== blockId) },
                      ),
                    },
              ),
            },
      ),
    });
  },
  movePracticeBlock: (courseId, moduleId, lessonId, blockId, direction) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) => {
                        if (l.id !== lessonId) return l;
                        const index = l.practiceBlocks.findIndex((b) => b.id === blockId);
                        const swapWith = direction === 'up' ? index - 1 : index + 1;
                        if (index === -1 || swapWith < 0 || swapWith >= l.practiceBlocks.length) return l;
                        const practiceBlocks = [...l.practiceBlocks];
                        [practiceBlocks[index], practiceBlocks[swapWith]] = [practiceBlocks[swapWith], practiceBlocks[index]];
                        return { ...l, practiceBlocks };
                      }),
                    },
              ),
            },
      ),
    });
  },
  setPracticeBlockTest: (courseId, moduleId, lessonId, blockId, testId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) => {
                        if (l.id !== lessonId) return l;
                        // Dedup: if setting testId, check no other block has it
                        if (testId && l.practiceBlocks.some((b) => b.id !== blockId && b.testId === testId)) {
                          return l; // Silently reject duplicate
                        }
                        return {
                          ...l,
                          practiceBlocks: l.practiceBlocks.map((b) =>
                            b.id === blockId ? { ...b, testId } : b,
                          ),
                        };
                      }),
                    },
              ),
            },
      ),
    });
  },
  setPracticeBlockDescription: (courseId, moduleId, lessonId, blockId, description) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : {
                              ...l,
                              practiceBlocks: l.practiceBlocks.map((b) =>
                                b.id === blockId ? { ...b, description } : b,
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  setPassThreshold: (courseId, moduleId, lessonId, data) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : {
                              ...l,
                              passThresholdEnabled: data.enabled,
                              passThresholdPercent: data.enabled ? (data.percent ?? l.passThresholdPercent) : null,
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },

  addLaunch: async (courseId, name) => {
    const row = await apiCreateLaunch(courseId, name);
    const launch: Launch = { id: row.id, name: row.name, active: row.active, plans: [] };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, launches: [...c.launches, launch] } : c,
      ),
    });
    return launch;
  },
  toggleLaunchActive: async (courseId, launchId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const launch = course?.launches.find((l) => l.id === launchId);
    if (!launch) return;
    const updated = await apiUpdateLaunch(launchId, { active: !launch.active });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) => (l.id === launchId ? { ...l, active: updated.active } : l)),
            },
      ),
    });
  },
  renameLaunch: async (courseId, launchId, name) => {
    await apiUpdateLaunch(launchId, { name });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, launches: c.launches.map((l) => (l.id === launchId ? { ...l, name } : l)) },
      ),
    });
  },
  addPricingPlan: async (courseId, launchId, plan) => {
    const row = await apiCreatePricingPlan(launchId, plan);
    const newPlan: PricingPlan = {
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price,
      originalPrice: row.originalPrice,
      groupId: row.groupId,
      startDate: row.startDate,
      endDate: row.endDate,
    };
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) =>
                l.id !== launchId ? l : { ...l, plans: [...l.plans, newPlan] },
              ),
            },
      ),
    });
  },
  removePricingPlan: async (courseId, launchId, planId) => {
    await apiDeletePricingPlan(planId);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) =>
                l.id !== launchId ? l : { ...l, plans: l.plans.filter((p) => p.id !== planId) },
              ),
            },
      ),
    });
  },

  addGroup: async (courseId, name, paymentDay) => {
    const row = await apiCreateGroup(courseId, name, paymentDay);
    const group: Group = {
      id: row.id,
      name: row.name,
      groupChatEnabled: row.groupChatEnabled,
      groupChannelEnabled: row.groupChannelEnabled,
      inviteToken: row.inviteToken,
      paymentDay: row.paymentDay,
      members: [],
      plans: [],
    };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, groups: [...c.groups, group] } : c,
      ),
    });
    return group;
  },
  renameGroup: async (courseId, groupId, name) => {
    await apiUpdateGroup(groupId, { name });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) },
      ),
    });
  },
  toggleGroupChat: async (courseId, groupId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const group = course?.groups.find((g) => g.id === groupId);
    if (!group) return;
    const updated = await apiUpdateGroup(groupId, { groupChatEnabled: !group.groupChatEnabled });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId ? { ...g, groupChatEnabled: updated.groupChatEnabled } : g,
              ),
            },
      ),
    });
  },
  toggleGroupChannel: async (courseId, groupId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const group = course?.groups.find((g) => g.id === groupId);
    if (!group) return;
    const updated = await apiUpdateGroup(groupId, { groupChannelEnabled: !group.groupChannelEnabled });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId ? { ...g, groupChannelEnabled: updated.groupChannelEnabled } : g,
              ),
            },
      ),
    });
  },
  setMemberRole: async (courseId, groupId, memberId, role) => {
    await apiUpdateGroupMember(groupId, memberId, { role });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : { ...g, members: g.members.map((m) => (m.id === memberId ? { ...m, role } : m)) },
              ),
            },
      ),
    });
  },
  assignCurator: async (courseId, groupId, studentId) => {
    await apiAssignCurator(groupId, studentId);
    const memberRows = await apiListGroupMembers(groupId);
    const members: GroupMember[] = memberRows.map((m) => ({
      id: m.id,
      studentId: m.studentId,
      studentName: m.student.name,
      studentPhone: m.student.phone,
      role: m.role,
      selectedPlanId: m.selectedPlanId,
      forcedClosed: m.forcedClosed,
      latestPaymentStatus: m.latestPayment?.status ?? null,
    }));
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id !== groupId ? g : { ...g, members })) },
      ),
    });
  },
  enrollStudent: async (courseId, groupId, studentId) => {
    await apiEnrollStudent(groupId, studentId);
    const memberRows = await apiListGroupMembers(groupId);
    const members: GroupMember[] = memberRows.map((m) => ({
      id: m.id,
      studentId: m.studentId,
      studentName: m.student.name,
      studentPhone: m.student.phone,
      role: m.role,
      selectedPlanId: m.selectedPlanId,
      forcedClosed: m.forcedClosed,
      latestPaymentStatus: m.latestPayment?.status ?? null,
    }));
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id !== groupId ? g : { ...g, members })) },
      ),
    });
  },
  setMemberPlan: async (courseId, groupId, memberId, planId) => {
    await apiUpdateGroupMember(groupId, memberId, { selectedPlanId: planId });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : {
                      ...g,
                      members: g.members.map((m) =>
                        m.id === memberId ? { ...m, selectedPlanId: planId } : m,
                      ),
                    },
              ),
            },
      ),
    });
  },
  setMemberForcedClosed: async (courseId, groupId, memberId, forcedClosed) => {
    await apiSetMemberForcedClosed(groupId, memberId, forcedClosed);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : {
                      ...g,
                      members: g.members.map((m) =>
                        m.id === memberId ? { ...m, forcedClosed } : m,
                      ),
                    },
              ),
            },
      ),
    });
  },
  removeStudentFromGroup: async (courseId, groupId, memberId) => {
    await apiRemoveGroupMember(groupId, memberId);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId ? g : { ...g, members: g.members.filter((m) => m.id !== memberId) },
              ),
            },
      ),
    });
  },
  deleteGroup: async (courseId, groupId) => {
    await apiDeleteGroup(groupId);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId ? c : { ...c, groups: c.groups.filter((g) => g.id !== groupId) },
      ),
    });
  },
  loadGroupPayments: async (groupId) => {
    return apiListGroupPayments(groupId);
  },
  recordPayment: async (paymentId, amount, discount) => {
    return apiRecordPayment(paymentId, amount, discount);
  },
}));
