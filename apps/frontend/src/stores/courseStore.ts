import { create } from 'zustand';
import { apiListCourses, apiCreateCourse, apiRenameCourse, apiDeleteCourse } from '../api/courses';
import { apiListModules, apiCreateModule, apiRenameModule, apiDeleteModule } from '../api/modules';
import { apiListLessons, apiCreateLesson, apiUpdateLesson, apiDeleteLesson } from '../api/lessons';
import {
  apiListPracticeBlocks,
  apiCreatePracticeBlock,
  apiUpdatePracticeBlock,
  apiDeletePracticeBlock,
  apiReorderPracticeBlocks,
} from '../api/practiceBlocks';
import {
  apiListBlocks,
  apiCreateBlock,
  apiUpdateBlock,
  apiDeleteBlock,
  apiReorderBlocks,
  apiUploadVideoBlock,
  apiUploadFileBlock,
  apiCreateFileBlockFromLibrary,
  apiCreateLiveClassBlock,
  apiCreateButtonBlock,
  apiCreateMessageBlock,
  apiAddMessageLine,
  apiUpdateMessageLine,
  apiRemoveMessageLine,
  apiReorderMessageLines,
  apiRetryVideoBlock,
  apiUploadSubtitle,
  apiDeleteSubtitle,
} from '../api/contentBlocks';
import {
  apiListGroups,
  apiCreateGroup,
  apiUpdateGroup,
  apiDeleteGroup,
  apiListGroupMembers,
  apiUpdateGroupMember,
  apiSetMemberForcedClosed,
  apiRemoveGroupMember,
  apiAssignCurator,
  apiDemoteCurator,
  apiEnrollStudent,
} from '../api/groups';
import {
  apiListLaunches,
  apiCreateLaunch,
  apiUpdateLaunch,
  apiCreatePricingPlan,
  apiUpdatePricingPlan,
  apiDeletePricingPlan,
} from '../api/launches';
import { apiListGroupPayments, apiRecordPayment } from '../api/payments';
import { hasPendingPersistence, persistLatest } from '../utils/latestPersistence';

export {
  type ContentBlockType,
  CONTENT_BLOCK_LIMIT,
  PRACTICE_BLOCK_LIMIT,
  type MessageLine,
  type ContentBlock,
  type PracticeBlockType,
  type PracticeBlock,
  type PricingPlan,
  type Launch,
  type GroupMember,
  type Group,
  type Lesson,
  type Module,
  type Course,
  type CourseState,
} from './courseTypes';

import {
  CONTENT_BLOCK_LIMIT,
  PRACTICE_BLOCK_LIMIT,
  type ContentBlock,
  type Course,
  type CourseState,
  type Group,
  type GroupMember,
  type Launch,
  type Lesson,
  type Module,
  type PracticeBlock,
  type PricingPlan,
} from './courseTypes';
import {
  toFrontendCourse,
  toFrontendBlock,
  toFrontendPracticeBlock,
  isPersistedVideoBlock,
  isPersistedFileBlock,
  isAlwaysPersistedBlock,
} from './slices/courseHelpers';

export const useCourseStore = create<CourseState>((set, get) => ({
  courses: [],
  coursesLoading: false,
  coursesLoaded: false,
  coursesError: null,

  loadCourses: async () => {
    set({ coursesLoading: true, coursesError: null });
    try {
      const courseRows = await apiListCourses();
      const existingMap = new Map(get().courses.map((c) => [c.id, c]));
      const courses: Course[] = courseRows.map((courseRow) => {
        const existing = existingMap.get(courseRow.id);
        if (existing && existing.detailsLoaded) {
          return { ...existing, title: courseRow.title };
        }
        return {
          id: courseRow.id,
          title: courseRow.title,
          modules: existing?.modules ?? [],
          launches: existing?.launches ?? [],
          groups: existing?.groups ?? [],
          detailsLoaded: existing?.detailsLoaded ?? false,
          detailsLoading: false,
        };
      });
      set({ courses, coursesLoaded: true, coursesLoading: false });
    } catch (error) {
      set({ coursesError: "Kurslarni yuklab bo'lmadi", coursesLoaded: true, coursesLoading: false });
      throw error;
    }
  },

  loadCourseDetails: async (courseId: string) => {
    const course = get().courses.find((c) => c.id === courseId);
    if (course?.detailsLoaded || course?.detailsLoading) return;

    set({
      courses: get().courses.map((c) => (c.id === courseId ? { ...c, detailsLoading: true } : c)),
    });

    try {
      const [moduleRows, groupRows, launchRows] = await Promise.all([
        apiListModules(courseId),
        apiListGroups(courseId),
        apiListLaunches(courseId),
      ]);

      const moduleList: Module[] = await Promise.all(
        moduleRows.map(async (moduleRow) => {
          const lessonRows = await apiListLessons(moduleRow.id);
          const lessonList: Lesson[] = lessonRows.map((l) => ({
            id: l.id,
            title: l.title,
            orderIndex: l.orderIndex,
            status: l.status,
            blocks: [],
            practiceEnabled: l.practiceEnabled,
            practiceBlocks: [],
            passThresholdEnabled: l.passThresholdEnabled,
            passThresholdPercent: l.passThresholdPercent,
            completionScore: l.completionScore,
          }));
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
            studentAvatarUrl: m.student.avatarUrl,
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

      set({
        courses: get().courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                modules: moduleList,
                groups: groupList,
                launches: launchList,
                detailsLoaded: true,
                detailsLoading: false,
              }
            : c,
        ),
      });
    } catch (e) {
      console.error('Failed to load course details', e);
      set({
        courses: get().courses.map((c) => (c.id === courseId ? { ...c, detailsLoading: false } : c)),
      });
    }
  },

  addCourse: async (title) => {
    const row = await apiCreateCourse(title);
    const course = toFrontendCourse(row);
    set({ courses: [...get().courses, course] });
    return course;
  },
  renameCourse: async (courseId, title) => {
    set({
      courses: get().courses.map((c) => (c.id === courseId ? { ...c, title } : c)),
    });
    persistLatest(`course:${courseId}:title`, () => apiRenameCourse(courseId, title));
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
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, modules: c.modules.map((m) => (m.id === moduleId ? { ...m, title } : m)) },
      ),
    });
    persistLatest(`module:${moduleId}:title`, () => apiRenameModule(moduleId, title));
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
      practiceEnabled: row.practiceEnabled,
      practiceBlocks: [],
      passThresholdEnabled: false,
      passThresholdPercent: null,
      completionScore: null,
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
    persistLatest(`lesson:${lessonId}:title`, () => apiUpdateLesson(lessonId, { title }));
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
    } else if ((block.type === 'video' || block.type === 'file') && file) {
      const uploadingBlock: ContentBlock = {
        ...block,
        previewUrl: undefined,
        processingStatus: 'uploading',
        uploadProgress: 0,
      };
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
                            : { ...l, blocks: [...l.blocks, uploadingBlock] },
                        ),
                      },
                ),
              },
        ),
      });

      try {
        const upload =
          block.type === 'video'
            ? apiUploadVideoBlock
            : apiUploadFileBlock;
        const row = await upload(lessonId, file, block.label ?? file.name, (percent) => {
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
                                    b.id === block.id ? newBlock : b,
                                  ),
                                },
                          ),
                        },
                  ),
                },
          ),
        });
      } catch (error) {
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
                                    b.id === block.id
                                      ? {
                                          ...b,
                                          processingStatus: 'failed',
                                          errorMessage:
                                            block.type === 'video'
                                              ? 'Video yuklashda xatolik yuz berdi'
                                              : 'Fayl yuklashda xatolik yuz berdi',
                                        }
                                      : b,
                                  ),
                                },
                          ),
                        },
                  ),
                },
          ),
        });
        throw error;
      }
      return;
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
  addFileBlockFromLibrary: async (courseId, moduleId, lessonId, url, fileName) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson || lesson.blocks.length >= CONTENT_BLOCK_LIMIT) return;

    const row = await apiCreateFileBlockFromLibrary(lessonId, url, fileName);
    const newBlock = toFrontendBlock(row);
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
  addLiveClassBlock: async (courseId, moduleId, lessonId, classSessionId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson || lesson.blocks.length >= CONTENT_BLOCK_LIMIT) return;

    const row = await apiCreateLiveClassBlock(lessonId, classSessionId);
    const newBlock = toFrontendBlock(row);
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
  addButtonBlock: async (courseId, moduleId, lessonId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson || lesson.blocks.length >= CONTENT_BLOCK_LIMIT) return;

    const row = await apiCreateButtonBlock(lessonId);
    const newBlock = toFrontendBlock(row);
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
  addMessageBlock: async (courseId, moduleId, lessonId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson || lesson.blocks.length >= CONTENT_BLOCK_LIMIT) return;

    const row = await apiCreateMessageBlock(lessonId);
    const newBlock = toFrontendBlock(row);
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
  addMessageLine: async (courseId, moduleId, lessonId, blockId) => {
    const line = await apiAddMessageLine(blockId);
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
                                b.id !== blockId
                                  ? b
                                  : { ...b, messageLines: [...(b.messageLines ?? []), line] },
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  updateMessageLine: async (courseId, moduleId, lessonId, blockId, lineId, text) => {
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
                                b.id !== blockId
                                  ? b
                                  : {
                                      ...b,
                                      messageLines: (b.messageLines ?? []).map((line) =>
                                        line.id === lineId ? { ...line, text } : line,
                                      ),
                                    },
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
    persistLatest(`message-line:${lineId}:text`, () => apiUpdateMessageLine(lineId, text));
  },
  removeMessageLine: async (courseId, moduleId, lessonId, blockId, lineId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    const block = lesson?.blocks.find((b) => b.id === blockId);
    if ((block?.messageLines?.length ?? 0) <= 1) return;

    await apiRemoveMessageLine(lineId);
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
                                b.id !== blockId
                                  ? b
                                  : { ...b, messageLines: (b.messageLines ?? []).filter((line) => line.id !== lineId) },
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  moveMessageLine: async (courseId, moduleId, lessonId, blockId, lineId, direction) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    const block = lesson?.blocks.find((b) => b.id === blockId);
    const lines = block?.messageLines ?? [];
    const index = lines.findIndex((line) => line.id === lineId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= lines.length) return;

    const reordered = [...lines];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

    await apiReorderMessageLines(blockId, reordered.map((line) => line.id));
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
                                b.id !== blockId ? b : { ...b, messageLines: reordered },
                              ),
                            },
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

    if (isAlwaysPersistedBlock(block) || isPersistedVideoBlock(block) || isPersistedFileBlock(block)) {
      const editableData = {
        html: data.html,
        label: data.label,
        embedUrl: data.embedUrl,
        buttonUrl: data.buttonUrl,
        buttonColor: data.buttonColor,
        buttonTextColor: data.buttonTextColor,
        openInNewTab: data.openInNewTab,
      };
      const fields = Object.entries(editableData)
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field)
        .sort()
        .join(',');
      if (fields) {
        persistLatest(`block:${blockId}:${fields}`, () =>
          apiUpdateBlock(blockId, editableData),
        );
      }
    }
  },
  removeBlock: async (courseId, moduleId, lessonId, blockId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    const block = lesson?.blocks.find((b) => b.id === blockId);

    if (isAlwaysPersistedBlock(block) || isPersistedVideoBlock(block) || isPersistedFileBlock(block)) {
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

    const persistedBlockIds = reordered
      .filter((b) => isAlwaysPersistedBlock(b) || isPersistedVideoBlock(b) || isPersistedFileBlock(b))
      .map((b) => b.id);
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
    const localLesson = get().courses
      .find((course) => course.id === courseId)
      ?.modules.find((module) => module.id === moduleId)
      ?.lessons.find((lesson) => lesson.id === lessonId);
    const blocks = blockRows.map(toFrontendBlock).map((remoteBlock) => {
      if (!hasPendingPersistence(`block:${remoteBlock.id}:`)) return remoteBlock;
      const localBlock = localLesson?.blocks.find((block) => block.id === remoteBlock.id);
      return localBlock
        ? {
            ...remoteBlock,
            html: localBlock.html,
            label: localBlock.label,
            embedUrl: localBlock.embedUrl,
          }
        : remoteBlock;
    });
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
  loadLessonBlocks: async (courseId, moduleId, lessonId) => {
    try {
      const [blockRows, practiceBlockRows] = await Promise.all([
        apiListBlocks(lessonId),
        apiListPracticeBlocks(lessonId),
      ]);
      const blocks: ContentBlock[] = blockRows.map(toFrontendBlock);
      const practiceBlocks: PracticeBlock[] = practiceBlockRows.map(toFrontendPracticeBlock);
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
                            : { ...l, blocks, practiceBlocks },
                        ),
                      },
                ),
              },
        ),
      });
    } catch (e) {
      console.error('Failed to load lesson blocks', e);
    }
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
  uploadSubtitleBlock: async (courseId, moduleId, lessonId, blockId, file) => {
    const row = await apiUploadSubtitle(blockId, file);
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
  removeSubtitleBlock: async (courseId, moduleId, lessonId, blockId) => {
    const row = await apiDeleteSubtitle(blockId);
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
    persistLatest(`lesson:${lessonId}:practiceEnabled`, () =>
      apiUpdateLesson(lessonId, { practiceEnabled: enabled }),
    );
  },
  addPracticeBlock: async (courseId, moduleId, lessonId, type = 'test') => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson || lesson.practiceBlocks.length >= PRACTICE_BLOCK_LIMIT) return;

    const row = await apiCreatePracticeBlock(lessonId, type);
    const block = toFrontendPracticeBlock(row);
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
                        l.id !== lessonId ? l : { ...l, practiceBlocks: [...l.practiceBlocks, block] },
                      ),
                    },
              ),
            },
      ),
    });
  },
  removePracticeBlock: async (courseId, moduleId, lessonId, blockId) => {
    await apiDeletePracticeBlock(blockId);
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
  movePracticeBlock: async (courseId, moduleId, lessonId, blockId, direction) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const index = lesson.practiceBlocks.findIndex((b) => b.id === blockId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= lesson.practiceBlocks.length) return;
    const reordered = [...lesson.practiceBlocks];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

    await apiReorderPracticeBlocks(lessonId, reordered.map((b) => b.id));
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
                        l.id !== lessonId ? l : { ...l, practiceBlocks: reordered },
                      ),
                    },
              ),
            },
      ),
    });
  },
  setPracticeBlockTest: async (courseId, moduleId, lessonId, blockId, testId) => {
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
                                b.id === blockId ? { ...b, testId } : b,
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
    persistLatest(`practice-block:${blockId}:testId`, () =>
      apiUpdatePracticeBlock(blockId, { testId }),
    );
  },
  setPracticeBlockDescription: async (courseId, moduleId, lessonId, blockId, description) => {
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
    persistLatest(`practice-block:${blockId}:description`, () =>
      apiUpdatePracticeBlock(blockId, { description }),
    );
  },
  setPracticeBlockMaxScore: async (courseId, moduleId, lessonId, blockId, maxScore) => {
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
                                b.id === blockId ? { ...b, maxScore } : b,
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
    persistLatest(`practice-block:${blockId}:maxScore`, () =>
      apiUpdatePracticeBlock(blockId, { maxScore }),
    );
  },
  setPassThreshold: async (courseId, moduleId, lessonId, data) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const nextPercent = data.enabled ? (data.percent ?? lesson.passThresholdPercent) : null;

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
                              passThresholdPercent: nextPercent,
                            },
                      ),
                    },
              ),
            },
      ),
    });
    persistLatest(`lesson:${lessonId}:passThreshold`, () =>
      apiUpdateLesson(lessonId, {
        passThresholdEnabled: data.enabled,
        passThresholdPercent: nextPercent,
      }),
    );
  },
  setLessonCompletionScore: async (courseId, moduleId, lessonId, score) => {
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
                        l.id !== lessonId ? l : { ...l, completionScore: score },
                      ),
                    },
              ),
            },
      ),
    });
    persistLatest(`lesson:${lessonId}:completionScore`, () =>
      apiUpdateLesson(lessonId, { completionScore: score }),
    );
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
  updatePricingPlan: async (courseId, launchId, planId, plan) => {
    const row = await apiUpdatePricingPlan(planId, plan);
    const updatedPlan: PricingPlan = {
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
                l.id !== launchId
                  ? l
                  : { ...l, plans: l.plans.map((p) => (p.id === planId ? updatedPlan : p)) },
              ),
              groups: c.groups.map((g) => ({
                ...g,
                plans: g.plans.map((p) => (p.id === planId ? updatedPlan : p)),
              })),
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
              groups: c.groups.map((g) => ({
                ...g,
                plans: g.plans.filter((p) => p.id !== planId),
              })),
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
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) },
      ),
    });
    persistLatest(`group:${groupId}:name`, () => apiUpdateGroup(groupId, { name }));
  },
  setGroupPaymentDay: async (courseId, groupId, paymentDay) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id === groupId ? { ...g, paymentDay } : g)) },
      ),
    });
    persistLatest(`group:${groupId}:paymentDay`, () => apiUpdateGroup(groupId, { paymentDay }));
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
      studentAvatarUrl: m.student.avatarUrl,
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
  demoteCurator: async (courseId, groupId, memberId) => {
    await apiDemoteCurator(groupId, memberId);
    const memberRows = await apiListGroupMembers(groupId);
    const members: GroupMember[] = memberRows.map((m) => ({
      id: m.id,
      studentId: m.studentId,
      studentName: m.student.name,
      studentPhone: m.student.phone,
      studentAvatarUrl: m.student.avatarUrl,
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
      studentAvatarUrl: m.student.avatarUrl,
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
