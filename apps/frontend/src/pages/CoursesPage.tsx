import { useEffect, useState } from 'react';
import { GraduationCap, MousePointerClick } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { CourseTreePanel } from '../components/course/CourseTreePanel';
import { LessonEditorView } from '../components/course/LessonEditorView';
import { useCourseStore } from '../stores/courseStore';
import { PromptModal } from '../components/course/PromptModal';

export function CoursesPage() {
  const { courses, addCourse } = useCourseStore();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ moduleId: string; lessonId: string } | null>(null);
  const [showFirstCourseModal, setShowFirstCourseModal] = useState(false);

  useEffect(() => {
    if (courseId === null && courses.length > 0) {
      setCourseId(courses[0].id);
    }
  }, [courses, courseId]);

  function handleSelectCourse(id: string) {
    setCourseId(id);
    setSelection(null);
  }

  function handleCreateFirstCourse(title: string) {
    const course = addCourse(title);
    setCourseId(course.id);
    setShowFirstCourseModal(false);
  }

  if (!courseId) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <GraduationCap size={32} className="mb-4 text-indigo-200" />
          <p className="mb-2 text-lg font-bold text-gray-900">Hali kurs yaratilmagan</p>
          <p className="mb-6 text-sm text-gray-400">Boshlash uchun birinchi kursingizni yarating.</p>
          <button
            onClick={() => setShowFirstCourseModal(true)}
            className="rounded-2xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
          >
            + Yangi kurs
          </button>
        </div>
        {showFirstCourseModal && (
          <PromptModal
            title="Yangi kurs"
            placeholder="Kurs nomi"
            confirmLabel="Yaratish"
            onConfirm={handleCreateFirstCourse}
            onClose={() => setShowFirstCourseModal(false)}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col gap-3 p-3 sm:flex-row">
        <CourseTreePanel
          courseId={courseId}
          onSelectCourse={handleSelectCourse}
          selectedLessonId={selection?.lessonId ?? null}
          onSelectLesson={(moduleId, lessonId) => setSelection({ moduleId, lessonId })}
        />

        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border-2 border-gray-100 bg-white">
          {selection ? (
            <LessonEditorView
              courseId={courseId}
              moduleId={selection.moduleId}
              lessonId={selection.lessonId}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-gray-300">
              <MousePointerClick size={28} className="mb-3 opacity-50" />
              <p className="text-sm">Chapdan darsni tanlang</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
