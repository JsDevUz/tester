import { create } from 'zustand';

export type ContentBlockType = 'editor' | 'video' | 'image' | 'file';

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  fileName?: string;
  previewUrl?: string;
  // editor: Tiptap HTML chiqishi
  html?: string;
}

export interface Lesson {
  id: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  blocks: ContentBlock[];
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
}

interface CourseState {
  courses: Course[];
  addCourse: (title: string) => Course;
  renameCourse: (courseId: string, title: string) => void;
  deleteCourse: (courseId: string) => void;

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
}

function newId(): string {
  return crypto.randomUUID();
}

export const useCourseStore = create<CourseState>((set, get) => ({
  courses: [],

  addCourse: (title) => {
    const course: Course = { id: newId(), title, modules: [] };
    set({ courses: [...get().courses, course] });
    return course;
  },
  renameCourse: (courseId, title) => {
    set({
      courses: get().courses.map((c) => (c.id === courseId ? { ...c, title } : c)),
    });
  },
  deleteCourse: (courseId) => {
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
                        l.id !== lessonId ? l : { ...l, blocks: [...l.blocks, block] },
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
}));
