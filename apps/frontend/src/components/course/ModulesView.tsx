import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Layers, Trash2, Inbox } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { PromptModal } from './PromptModal';

interface ModulesViewProps {
  courseId: string;
  onBack: () => void;
  onOpenModule: (moduleId: string) => void;
}

export function ModulesView({ courseId, onBack, onOpenModule }: ModulesViewProps) {
  const { courses, addModule, deleteModule } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const [showModal, setShowModal] = useState(false);

  if (!course) return null;

  function handleCreate(title: string) {
    addModule(courseId, title);
    setShowModal(false);
  }

  return (
    <div className="p-6">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
        <ChevronLeft size={15} /> Kurslar
      </button>

      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-800">{course.title}</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
        >
          <Plus size={16} /> Yangi modul
        </button>
      </div>

      {course.modules.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Inbox size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Hali modul yaratilmagan.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {course.modules.map((module) => (
            <div
              key={module.id}
              className="group flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3.5 transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
            >
              <button onClick={() => onOpenModule(module.id)} className="flex flex-1 items-center gap-3 text-left">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                  <Layers size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">{module.title}</p>
                  <p className="text-xs text-gray-400">{module.lessons.length} ta dars</p>
                </div>
              </button>
              <button
                onClick={() => deleteModule(courseId, module.id)}
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
          title="Yangi modul"
          placeholder="Modul nomi"
          confirmLabel="Yaratish"
          onConfirm={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
