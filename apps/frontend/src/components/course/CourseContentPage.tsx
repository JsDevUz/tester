import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, FileText, Trash2, Plus, Inbox, Eye, EyeOff } from 'lucide-react';
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
}

type ModalState =
  | { type: 'newModule' }
  | { type: 'newLesson'; moduleId: string }
  | null;

type DeleteTarget =
  | { type: 'module'; moduleId: string; title: string }
  | { type: 'lesson'; moduleId: string; lessonId: string; title: string }
  | null;

export function CourseContentPage({ courseId, onBackToList, onOpenLesson, onSelectSettings, onSelectLaunch, onSelectGroups }: CourseContentPageProps) {
  const { courses, addModule, renameModule, addLesson, deleteModule, deleteLesson, toggleLessonStatus } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  if (!course) return null;

  const lessonCount = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);

  function toggleModule(moduleId: string) {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  async function handleCreateModule(title: string) {
    await addModule(courseId, title);
    setModal(null);
  }

  async function handleCreateLesson(title: string) {
    if (modal?.type !== 'newLesson') return;
    const lesson = await addLesson(courseId, modal.moduleId, title);
    setModal(null);
    if (lesson) onOpenLesson(modal.moduleId, lesson.id);
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
    <div className="flex flex-col gap-3 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title },
            { label: 'Kontent' },
          ]}
        />

        <div className="mb-4 rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Mundarija</h2>
          <p className="mb-4 text-sm text-gray-400">
            Bu yerda siz modullar va darslarni tahrirlashingiz, tartiblashingiz, nashr qilishingiz yoki
            o'chirishingiz mumkin.
          </p>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setModal({ type: 'newModule' })}
              className="flex items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-indigo-600"
            >
              <Plus size={16} /> Modul qo'shish
            </button>
            <p className="text-xs text-gray-400">
              {course.modules.length} modul • {lessonCount} dars
            </p>
          </div>
        </div>

        {course.modules.length === 0 ? (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <Inbox size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali modul yo'q</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {course.modules.map((module) => {
              const collapsed = collapsedModules.has(module.id);
              return (
                <div key={module.id} className="rounded-2xl bg-white">
                  <div className="group flex items-center gap-2 px-4 py-3">
                    <button type="button" onClick={() => toggleModule(module.id)} className="text-gray-400">
                      {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <Layers size={16} className="shrink-0 text-gray-400" />
                    <input
                      value={module.title}
                      onChange={(e) => void renameModule(courseId, module.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-0 flex-1 truncate rounded-lg bg-transparent px-1 py-0.5 text-sm font-semibold text-gray-700 outline-none transition-colors hover:bg-gray-50 focus:bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ type: 'module', moduleId: module.id, title: module.title })}
                      className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {!collapsed && (
                    <div className="px-2 py-2">
                      {module.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          className="group flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-gray-50"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenLesson(module.id, lesson.id)}
                            className="flex flex-1 items-center gap-2 truncate text-left"
                          >
                            <FileText size={14} className="shrink-0 text-gray-300" />
                            <span className="truncate text-gray-700">{lesson.title}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleLessonStatus(courseId, module.id, lesson.id)}
                            title={lesson.status === 'published' ? "E'lon qilingan — bosib qoralamaga o'tkazish" : "Qoralama — bosib e'lon qilish"}
                            className={`shrink-0 rounded-lg p-1.5 transition-colors ${
                              lesson.status === 'published'
                                ? 'text-green-500 hover:bg-green-50'
                                : 'text-gray-300 hover:bg-gray-100 hover:text-gray-400'
                            }`}
                          >
                            {lesson.status === 'published' ? <Eye size={15} /> : <EyeOff size={15} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ type: 'lesson', moduleId: module.id, lessonId: lesson.id, title: lesson.title })}
                            className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-400"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setModal({ type: 'newLesson', moduleId: module.id })}
                        className="w-full rounded-xl px-3 py-2.5 text-left text-xs font-medium text-gray-500 hover:bg-gray-50"
                      >
                        + Dars qo'shish
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
        onSelectContent={() => {}}
        onSelectSettings={onSelectSettings}
        onSelectLaunch={onSelectLaunch}
        onSelectGroups={onSelectGroups}
      />

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
  );
}
