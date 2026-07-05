import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, FileText, Trash2, Plus, Inbox } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { PromptModal } from './PromptModal';

interface CourseContentPageProps {
  courseId: string;
  onBackToList: () => void;
  onOpenLesson: (moduleId: string, lessonId: string) => void;
}

type ModalState =
  | { type: 'newModule' }
  | { type: 'newLesson'; moduleId: string }
  | null;

export function CourseContentPage({ courseId, onBackToList, onOpenLesson }: CourseContentPageProps) {
  const { courses, addModule, addLesson, deleteModule, deleteLesson } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);

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

  function handleCreateModule(title: string) {
    addModule(courseId, title);
    setModal(null);
  }

  function handleCreateLesson(title: string) {
    if (modal?.type !== 'newLesson') return;
    const lesson = addLesson(courseId, modal.moduleId, title);
    setModal(null);
    if (lesson) onOpenLesson(modal.moduleId, lesson.id);
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

        <div className="mb-4 rounded-2xl border-2 border-gray-100 bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Mundarija</h2>
          <p className="mb-4 text-sm text-gray-400">
            Bu yerda siz modullar va darslarni tahrirlashingiz, tartiblashingiz, nashr qilishingiz yoki
            o'chirishingiz mumkin.
          </p>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setModal({ type: 'newModule' })}
              className="flex items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
            >
              <Plus size={16} /> Modul qo'shish
            </button>
            <p className="text-xs text-gray-400">
              {course.modules.length} modul • {lessonCount} dars
            </p>
          </div>
        </div>

        {course.modules.length === 0 ? (
          <div className="rounded-2xl border-2 border-gray-100 bg-white py-16 text-center text-gray-300">
            <Inbox size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali modul yo'q</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {course.modules.map((module) => {
              const collapsed = collapsedModules.has(module.id);
              return (
                <div key={module.id} className="rounded-2xl border-2 border-gray-100 bg-white">
                  <div className="group flex items-center gap-2 px-4 py-3">
                    <button type="button" onClick={() => toggleModule(module.id)} className="text-gray-400">
                      {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <Layers size={16} className="shrink-0 text-indigo-400" />
                    <span className="flex-1 truncate text-sm font-semibold text-gray-700">{module.title}</span>
                    <button
                      type="button"
                      onClick={() => deleteModule(courseId, module.id)}
                      className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {!collapsed && (
                    <div className="border-t border-gray-100 px-2 py-2">
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
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                lesson.status === 'published'
                                  ? 'bg-green-50 text-green-600'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {lesson.status === 'published' ? "E'lon qilingan" : 'Qoralama'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLesson(courseId, module.id, lesson.id)}
                            className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setModal({ type: 'newLesson', moduleId: module.id })}
                        className="w-full rounded-xl px-3 py-2.5 text-left text-xs font-medium text-indigo-400 hover:bg-indigo-50/50"
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

      <CourseSidePanel onBackToList={onBackToList} />

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
    </div>
  );
}
