import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, FileText, Trash2, Plus, Inbox, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useCourseStore } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { PromptModal } from './PromptModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface CourseContentPageProps {
  courseId: string;
  onBackToList: () => void;
  onOpenLesson: (moduleId: string, lessonId: string) => void;
  onSelectSettings?: () => void;
  onSelectLaunch?: () => void;
  onSelectGroups?: () => void;
  onSelectClasses?: () => void;
  onSelectChallenges?: () => void;
}

type ModalState =
  | { type: 'newModule' }
  | { type: 'newLesson'; moduleId: string }
  | null;

type DeleteTarget =
  | { type: 'module'; moduleId: string; title: string }
  | { type: 'lesson'; moduleId: string; lessonId: string; title: string }
  | null;

export function CourseContentPage({ courseId, onBackToList, onOpenLesson, onSelectSettings, onSelectLaunch, onSelectGroups, onSelectClasses, onSelectChallenges }: CourseContentPageProps) {
  const { courses, loadCourseDetails, addModule, renameModule, addLesson, deleteModule, deleteLesson, toggleLessonStatus } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const [collapsedModules, setCollapsedModules] = useState<Set<string> | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  useEffect(() => {
    if (courseId) void loadCourseDetails(courseId);
  }, [courseId, loadCourseDetails]);

  // Sahifa birinchi ochilganda hamma modul yopiq (collapsed) holatda
  // boshlansin — modullar ro'yxati store'dan asinxron kelgani uchun
  // useState'ning boshlang'ich qiymatida emas, shu yerda seedlanadi.
  useEffect(() => {
    if (collapsedModules === null && course) {
      setCollapsedModules(new Set(course.modules.map((m) => m.id)));
    }
  }, [collapsedModules, course]);

  if (!course) return null;

  const collapsedModuleIds = collapsedModules ?? new Set(course.modules.map((m) => m.id));

  const lessonCount = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const moduleLimitReached = course.modules.length >= 30;

  function toggleModule(moduleId: string) {
    setCollapsedModules((prev) => {
      const next = new Set(prev ?? collapsedModuleIds);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  async function handleCreateModule(title: string) {
    if (moduleLimitReached) return;
    try {
      await addModule(courseId, title);
      setModal(null);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Modul yaratib bo'lmadi");
    }
  }

  async function handleCreateLesson(title: string) {
    if (modal?.type !== 'newLesson') return;
    const targetModule = course?.modules.find((item) => item.id === modal.moduleId);
    if (!targetModule || targetModule.lessons.length >= 100) return;
    try {
      const lesson = await addLesson(courseId, modal.moduleId, title);
      setModal(null);
      if (lesson) onOpenLesson(modal.moduleId, lesson.id);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Dars yaratib bo'lmadi");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'module') {
      await deleteModule(courseId, deleteTarget.moduleId);
    } else {
      await deleteLesson(courseId, deleteTarget.moduleId, deleteTarget.lessonId);
    }
    setDeleteTarget(null);
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
      <div className="flex min-h-full flex-col gap-3">
        <div className="px-1 py-1">
          <Breadcrumb
            items={[
              { label: 'Kurslar', onClick: onBackToList },
              { label: course.title },
              { label: 'Kontent' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
              <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Mundarija</h2>
              <p className="mt-0.5 mb-3.5 text-xs text-[var(--text-muted)]">
                Bu yerda siz modullar va darslarni tahrirlashingiz, tartiblashingiz, nashr qilishingiz yoki
                o'chirishingiz mumkin.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setModal({ type: 'newModule' })}
                  disabled={moduleLimitReached}
                  title={moduleLimitReached ? "Bitta kursga maksimal 30 ta modul qo'shish mumkin" : undefined}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <Plus size={15} /> Modul qo'shish
                </button>
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  {course.modules.length} modul • {lessonCount} dars
                </p>
              </div>
              {moduleLimitReached && (
                <p className="mt-3 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Bu kursda maksimal 30 ta modul mavjud. Yangi modul yaratish uchun avval mavjud modullardan birini o'chiring.
                </p>
              )}
            </div>

            {course.modules.length === 0 ? (
              <div className="rounded-2xl bg-[var(--surface-bg)] py-16 text-center text-[var(--text-muted)] shadow-xs">
                <Inbox size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs font-medium">Hali modul yo'q</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {course.modules.map((module) => {
                  const collapsed = collapsedModuleIds.has(module.id);
                  return (
                    <div key={module.id} className="rounded-2xl bg-[var(--surface-bg)] shadow-xs overflow-hidden">
                      <div className="group flex items-center gap-2 px-4 py-3">
                        <button type="button" onClick={() => toggleModule(module.id)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <Layers size={16} className="shrink-0 text-indigo-500" />
                        <input
                          value={module.title}
                          onChange={(e) => void renameModule(courseId, module.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="min-w-0 flex-1 truncate rounded-lg bg-transparent px-1.5 py-0.5 text-xs font-bold text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--card-hover)] focus:bg-[var(--card-bg)]"
                        />
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ type: 'module', moduleId: module.id, title: module.title })}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {!collapsed && (
                        <div className="px-2 pb-2 space-y-1">
                          {module.lessons.map((lesson) => (
                            <div
                              key={lesson.id}
                              className="group flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors hover:bg-[var(--card-hover)]"
                            >
                              <button
                                type="button"
                                onClick={() => onOpenLesson(module.id, lesson.id)}
                                className="flex flex-1 items-center gap-2 truncate text-left cursor-pointer"
                              >
                                <FileText size={14} className="shrink-0 text-[var(--text-muted)]" />
                                <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{lesson.title}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleLessonStatus(courseId, module.id, lesson.id)}
                                title={lesson.status === 'published' ? "E'lon qilingan — bosib qoralamaga o'tkazish" : "Qoralama — bosib e'lon qilish"}
                                className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                                  lesson.status === 'published'
                                    ? 'text-emerald-500 hover:bg-emerald-500/10'
                                    : 'text-[var(--text-muted)] hover:bg-[var(--card-bg)]'
                                }`}
                              >
                                {lesson.status === 'published' ? <Eye size={15} /> : <EyeOff size={15} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ type: 'lesson', moduleId: module.id, lessonId: lesson.id, title: lesson.title })}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setModal({ type: 'newLesson', moduleId: module.id })}
                            disabled={module.lessons.length >= 100}
                            title={module.lessons.length >= 100 ? "Bitta modulga maksimal 100 ta dars qo'shish mumkin" : undefined}
                            className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors disabled:cursor-not-allowed cursor-pointer"
                          >
                            {module.lessons.length >= 100 ? "100 ta dars limiti to'ldi" : "+ Dars qo'shish"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <CourseSidePanel
            onBackToList={onBackToList}
            activeFullTab="content"
            onSelectContent={() => { }}
            onSelectSettings={onSelectSettings}
            onSelectLaunch={onSelectLaunch}
            onSelectGroups={onSelectGroups}
            onSelectClasses={onSelectClasses}
            onSelectChallenges={onSelectChallenges}
          />
        </div>

        {modal?.type === 'newModule' && (
          <PromptModal
            title="Yangi modul"
            placeholder="Modul nomi"
            confirmLabel="Yaratish"
            onConfirm={handleCreateModule}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.type === 'newLesson' && (
          <PromptModal
            title="Yangi dars"
            placeholder="Dars nomi"
            confirmLabel="Yaratish"
            onConfirm={handleCreateLesson}
            onClose={() => setModal(null)}
          />
        )}

        {deleteTarget?.type === 'module' && (
          <ConfirmDeleteModal
            title="Modulni o'chirish"
            description={`"${deleteTarget.title}" moduli va undagi barcha darslar o'chiriladi.`}
            onConfirm={handleConfirmDelete}
            onClose={() => setDeleteTarget(null)}
          />
        )}
        {deleteTarget?.type === 'lesson' && (
          <ConfirmDeleteModal
            title="Darsni o'chirish"
            description={`"${deleteTarget.title}" darsi va uning kontenti o'chiriladi.`}
            onConfirm={handleConfirmDelete}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </div>
    </div>
  );
}
