import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, FileText, Trash2, Inbox } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { PromptModal } from './PromptModal';

interface LessonsViewProps {
  courseId: string;
  moduleId: string;
  onBack: () => void;
  onOpenLesson: (lessonId: string) => void;
}

export function LessonsView({ courseId, moduleId, onBack, onOpenLesson }: LessonsViewProps) {
  const { courses, addLesson, deleteLesson } = useCourseStore();
  const module = courses.find((c) => c.id === courseId)?.modules.find((m) => m.id === moduleId);
  const [showModal, setShowModal] = useState(false);

  if (!module) return null;

  function handleCreate(title: string) {
    addLesson(courseId, moduleId, title);
    setShowModal(false);
  }

  return (
    <div className="p-6">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
        <ChevronLeft size={15} /> Modullar
      </button>

      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-800">{module.title}</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
        >
          <Plus size={16} /> Yangi dars
        </button>
      </div>

      {module.lessons.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Inbox size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Hali dars yaratilmagan.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {module.lessons.map((lesson) => (
            <div
              key={lesson.id}
              className="group flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3.5 transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
            >
              <button onClick={() => onOpenLesson(lesson.id)} className="flex flex-1 items-center gap-3 text-left">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                  <FileText size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">{lesson.title}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  lesson.status === 'published' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {lesson.status === 'published' ? "E'lon qilingan" : 'Qoralama'}
                </span>
              </button>
              <button
                onClick={() => deleteLesson(courseId, moduleId, lesson.id)}
                className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 size={15} />
              </button>
              <ChevronRight size={16} className="shrink-0 text-gray-300" />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <PromptModal
          title="Yangi dars"
          placeholder="Dars nomi"
          confirmLabel="Yaratish"
          onConfirm={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
