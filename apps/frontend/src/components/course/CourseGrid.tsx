import { useState } from 'react';
import { Plus, GraduationCap, Layers, Inbox } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { PromptModal } from './PromptModal';

interface CourseGridProps {
  onOpenCourse: (courseId: string) => void;
}

export function CourseGrid({ onOpenCourse }: CourseGridProps) {
  const { courses, addCourse } = useCourseStore();
  const [showModal, setShowModal] = useState(false);

  function handleCreate(title: string) {
    const course = addCourse(title);
    setShowModal(false);
    onOpenCourse(course.id);
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-800">Kurslar</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
        >
          <Plus size={16} /> Yangi kurs
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Inbox size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Hali kurs yaratilmagan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <button
              key={course.id}
              onClick={() => onOpenCourse(course.id)}
              className="flex flex-col gap-3 rounded-2xl border-2 border-gray-100 bg-white p-4 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                <GraduationCap size={20} />
              </div>
              <div>
                <p className="truncate text-sm font-semibold text-gray-800">{course.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                  <Layers size={12} /> {course.modules.length} ta modul
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <PromptModal
          title="Yangi kurs"
          placeholder="Kurs nomi"
          confirmLabel="Yaratish"
          onConfirm={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
