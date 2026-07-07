import { create } from 'zustand';
import { apiListCourses, apiCreateCourse, apiRenameCourse, apiDeleteCourse, type ApiCourse } from '../api/courses';

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

export interface Group {
  id: string;
  name: string;
  groupChatEnabled: boolean;
  groupChannelEnabled: boolean;
  curatorIds: string[];
  studentIds: string[];
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

  addModule: (courseId: string, title: string) => Module | undefined;
  renameModule: (courseId: string, moduleId: string, title: string) => void;
  deleteModule: (courseId: string, moduleId: string) => void;

  addLesson: (courseId: string, moduleId: string, title: string) => Lesson | undefined;
  renameLesson: (courseId: string, moduleId: string, lessonId: string, title: string) => void;
  deleteLesson: (courseId: string, moduleId: string, lessonId: string) => void;
  toggleLessonStatus: (courseId: string, moduleId: string, lessonId: string) => void;

  addBlock: (courseId: string, moduleId: string, lessonId: string, block: ContentBlock) => void;
  updateBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, data: Partial<ContentBlock>) => void;
  removeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => void;
  moveBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => void;

  setLessonPracticeEnabled: (courseId: string, moduleId: string, lessonId: string, enabled: boolean) => void;
  addPracticeBlock: (courseId: string, moduleId: string, lessonId: string, type: PracticeBlockType) => void;
  removePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => void;
  movePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => void;
  setPracticeBlockTest: (courseId: string, moduleId: string, lessonId: string, blockId: string, testId: string) => void;
  setPracticeBlockDescription: (courseId: string, moduleId: string, lessonId: string, blockId: string, description: string) => void;
  setPassThreshold: (courseId: string, moduleId: string, lessonId: string, data: { enabled: boolean; percent?: number | null }) => void;

  addLaunch: (courseId: string, name: string) => Launch | undefined;
  toggleLaunchActive: (courseId: string, launchId: string) => void;
  renameLaunch: (courseId: string, launchId: string, name: string) => void;
  addPricingPlan: (courseId: string, launchId: string, plan: Omit<PricingPlan, 'id'>) => void;
  removePricingPlan: (courseId: string, launchId: string, planId: string) => void;

  addGroup: (courseId: string, name: string) => Group | undefined;
  renameGroup: (courseId: string, groupId: string, name: string) => void;
  toggleGroupChat: (courseId: string, groupId: string) => void;
  toggleGroupChannel: (courseId: string, groupId: string) => void;
  setGroupCurators: (courseId: string, groupId: string, curatorIds: string[]) => void;
  addStudentToGroup: (courseId: string, groupId: string, studentId: string) => void;
  removeStudentFromGroup: (courseId: string, groupId: string, studentId: string) => void;
  deleteGroup: (courseId: string, groupId: string) => void;
}

function newId(): string {
  return crypto.randomUUID();
}

function toFrontendCourse(apiCourse: ApiCourse): Course {
  return { id: apiCourse.id, title: apiCourse.title, modules: [], launches: [], groups: [] };
}

export const useCourseStore = create<CourseState>((set, get) => ({
  courses: [],

  loadCourses: async () => {
    const rows = await apiListCourses();
    set({ courses: rows.map(toFrontendCourse) });
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

  addModule: (courseId, title) => {
    const course = get().courses.find((c) => c.id === courseId);
    if (!course) return undefined;
    const module: Module = { id: newId(), title, orderIndex: course.modules.length, lessons: [] };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, modules: [...c.modules, module] } : c,
      ),
    });
    return module;
  },
  renameModule: (courseId, moduleId, title) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, modules: c.modules.map((m) => (m.id === moduleId ? { ...m, title } : m)) },
      ),
    });
  },
  deleteModule: (courseId, moduleId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId ? c : { ...c, modules: c.modules.filter((m) => m.id !== moduleId) },
      ),
    });
  },

  addLesson: (courseId, moduleId, title) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    if (!module) return undefined;
    const lesson: Lesson = {
      id: newId(),
      title,
      orderIndex: module.lessons.length,
      status: 'draft',
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
  renameLesson: (courseId, moduleId, lessonId, title) => {
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
  deleteLesson: (courseId, moduleId, lessonId) => {
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
  toggleLessonStatus: (courseId, moduleId, lessonId) => {
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
                        l.id === lessonId
                          ? { ...l, status: l.status === 'draft' ? 'published' : 'draft' }
                          : l,
                      ),
                    },
              ),
            },
      ),
    });
  },

  addBlock: (courseId, moduleId, lessonId, block) => {
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
                          : { ...l, blocks: [...l.blocks, block] },
                      ),
                    },
              ),
            },
      ),
    });
  },
  updateBlock: (courseId, moduleId, lessonId, blockId, data) => {
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
  removeBlock: (courseId, moduleId, lessonId, blockId) => {
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
  moveBlock: (courseId, moduleId, lessonId, blockId, direction) => {
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
                        const index = l.blocks.findIndex((b) => b.id === blockId);
                        const swapWith = direction === 'up' ? index - 1 : index + 1;
                        if (index === -1 || swapWith < 0 || swapWith >= l.blocks.length) return l;
                        const blocks = [...l.blocks];
                        [blocks[index], blocks[swapWith]] = [blocks[swapWith], blocks[index]];
                        return { ...l, blocks };
                      }),
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

  addLaunch: (courseId, name) => {
    const course = get().courses.find((c) => c.id === courseId);
    if (!course) return undefined;
    const launch: Launch = { id: newId(), name, active: false, plans: [] };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, launches: [...c.launches, launch] } : c,
      ),
    });
    return launch;
  },
  toggleLaunchActive: (courseId, launchId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) =>
                l.id === launchId ? { ...l, active: !l.active } : l,
              ),
            },
      ),
    });
  },
  renameLaunch: (courseId, launchId, name) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) => (l.id === launchId ? { ...l, name } : l)),
            },
      ),
    });
  },
  addPricingPlan: (courseId, launchId, plan) => {
    const newPlan: PricingPlan = { ...plan, id: newId() };
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
  removePricingPlan: (courseId, launchId, planId) => {
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

  addGroup: (courseId, name) => {
    const course = get().courses.find((c) => c.id === courseId);
    if (!course) return undefined;
    const group: Group = {
      id: newId(),
      name,
      groupChatEnabled: false,
      groupChannelEnabled: false,
      curatorIds: [],
      studentIds: [],
    };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, groups: [...c.groups, group] } : c,
      ),
    });
    return group;
  },
  renameGroup: (courseId, groupId, name) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) },
      ),
    });
  },
  toggleGroupChat: (courseId, groupId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId ? { ...g, groupChatEnabled: !g.groupChatEnabled } : g,
              ),
            },
      ),
    });
  },
  toggleGroupChannel: (courseId, groupId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId ? { ...g, groupChannelEnabled: !g.groupChannelEnabled } : g,
              ),
            },
      ),
    });
  },
  setGroupCurators: (courseId, groupId, curatorIds) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id === groupId ? { ...g, curatorIds } : g)) },
      ),
    });
  },
  addStudentToGroup: (courseId, groupId, studentId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId || g.studentIds.includes(studentId)
                  ? g
                  : { ...g, studentIds: [...g.studentIds, studentId] },
              ),
            },
      ),
    });
  },
  removeStudentFromGroup: (courseId, groupId, studentId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : { ...g, studentIds: g.studentIds.filter((id) => id !== studentId) },
              ),
            },
      ),
    });
  },
  deleteGroup: (courseId, groupId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId ? c : { ...c, groups: c.groups.filter((g) => g.id !== groupId) },
      ),
    });
  },
}));
