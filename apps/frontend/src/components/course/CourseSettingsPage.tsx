import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface CourseSettingsPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectLaunch: () => void;
  onSelectGroups: () => void;
  onSelectClasses: () => void;
}

const TITLE_MAX = 80;

export function CourseSettingsPage({ courseId, onBackToList, onSelectContent, onSelectLaunch, onSelectGroups, onSelectClasses }: CourseSettingsPageProps) {
  const { courses, loadCourseDetails, renameCourse, deleteCourse } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);

  useEffect(() => {
    if (courseId) void loadCourseDetails(courseId);
  }, [courseId, loadCourseDetails]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!course) return null;

  async function handleConfirmDelete() {
    await deleteCourse(courseId);
    setConfirmDelete(false);
    onBackToList();
  }

  return (
    <div className="flex flex-col gap-3 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title, onClick: onSelectContent },
            { label: 'Sozlamalar' },
          ]}
        />

        <div className="mb-4 rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Ma'lumot va moslashtirish</h2>
          <p className="mb-4 text-sm text-gray-400">Kurs haqidagi asosiy ma'lumotlarni bu yerdan tahrirlashingiz mumkin.</p>

          <p className="mb-1.5 text-sm text-gray-500">Kurs nomi</p>
          <input
            value={course.title}
            onChange={(e) => void renameCourse(courseId, e.target.value.slice(0, TITLE_MAX))}
            className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
          />
          <p className="mt-1 text-right text-xs text-gray-300">{course.title.length} / {TITLE_MAX}</p>
        </div>

        <div className="rounded-2xl bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-gray-800">Amallar</h2>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
          >
            <Trash2 size={16} /> Kursni o'chirish
          </button>
        </div>
      </div>

      <CourseSidePanel
        onBackToList={onBackToList}
        activeFullTab="settings"
        onSelectContent={onSelectContent}
        onSelectSettings={() => {}}
        onSelectLaunch={onSelectLaunch}
        onSelectGroups={onSelectGroups}
        onSelectClasses={onSelectClasses}
      />

      {confirmDelete && (
        <ConfirmDeleteModal
          title="Kursni o'chirish"
          description={`"${course.title}" kursi butunlay o'chiriladi. Barcha modullar, darslar, tariflar va guruhlar ham yo'qoladi.`}
          onConfirm={handleConfirmDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
