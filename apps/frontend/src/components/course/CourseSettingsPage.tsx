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
  onSelectChallenges: () => void;
}

const TITLE_MAX = 80;

export function CourseSettingsPage({ courseId, onBackToList, onSelectContent, onSelectLaunch, onSelectGroups, onSelectClasses, onSelectChallenges }: CourseSettingsPageProps) {
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
    <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
      <div className="flex min-h-full flex-col gap-3">
        <div className="px-1 py-1">
          <Breadcrumb
            items={[
              { label: 'Kurslar', onClick: onBackToList },
              { label: course.title, onClick: onSelectContent },
              { label: 'Sozlamalar' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
              <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Ma'lumot va moslashtirish</h2>
              <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">Kurs haqidagi asosiy ma'lumotlarni bu yerdan tahrirlashingiz mumkin.</p>

              <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Kurs nomi</label>
              <input
                value={course.title}
                onChange={(e) => void renameCourse(courseId, e.target.value.slice(0, TITLE_MAX))}
                className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              <p className="mt-1 text-right text-[10px] font-semibold text-[var(--text-muted)]">{course.title.length} / {TITLE_MAX}</p>
            </div>

            <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
              <h2 className="mb-3 text-xs font-bold text-[var(--text-primary)]">Amallar</h2>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/20 cursor-pointer"
              >
                <Trash2 size={15} /> Kursni o'chirish
              </button>
            </div>
          </div>

          <CourseSidePanel
            onBackToList={onBackToList}
            activeFullTab="settings"
            onSelectContent={onSelectContent}
            onSelectSettings={() => { }}
            onSelectLaunch={onSelectLaunch}
            onSelectGroups={onSelectGroups}
            onSelectClasses={onSelectClasses}
            onSelectChallenges={onSelectChallenges}
          />
        </div>

        {confirmDelete && (
          <ConfirmDeleteModal
            title="Kursni o'chirish"
            description={`"${course.title}" kursi butunlay o'chiriladi. Barcha modullar, darslar, tariflar va guruhlar ham yo'qoladi.`}
            onConfirm={handleConfirmDelete}
            onClose={() => setConfirmDelete(false)}
          />
        )}
      </div>
    </div>
  );
}
