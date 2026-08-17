import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  GraduationCap,
  Inbox,
  Layers,
  PenTool,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Star,
  ThumbsUp,
  Users,
} from "lucide-react";
import { useCourseStore } from "../../stores/courseStore";
import { PromptModal } from "./PromptModal";
import { DataLoadingState } from "../DataLoadingState";
import { ActiveClassBanner } from "../classroom/ActiveClassBanner";
import { StartClassModal } from "../classroom/StartClassModal";

interface CourseGridProps {
  onOpenCourse: (courseId: string) => void;
}

export function CourseGrid({ onOpenCourse }: CourseGridProps) {
  const navigate = useNavigate();
  const {
    courses,
    coursesLoading,
    coursesLoaded,
    coursesError,
    loadCourses,
    addCourse,
  } = useCourseStore();
  const [showModal, setShowModal] = useState(false);
  const [showStartClass, setShowStartClass] = useState(false);

  async function handleCreate(title: string) {
    const course = await addCourse(title);
    setShowModal(false);
    onOpenCourse(course.id);
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
      <div className="flex min-h-full flex-col gap-3">
        <ActiveClassBanner />

        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Kurslar</h1>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">O'quv kurslari va guruhlarni boshqarish</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowStartClass(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-red-700 cursor-pointer"
            >
              <Radio size={15} /> Jonli dars
            </button>
            <button
              type="button"
              onClick={() => navigate("/free-classes")}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--surface-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
            >
              <PenTool size={15} /> Erkin darslar
            </button>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 cursor-pointer"
            >
              <Plus size={15} /> Yangi kurs
            </button>
          </div>
        </div>

        {coursesLoading && !coursesLoaded ? (
          <DataLoadingState label="Kurslar yuklanmoqda..." className="min-h-64" />
        ) : coursesError && courses.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-[var(--surface-bg)] text-center text-xs text-[var(--text-muted)] shadow-xs">
            <p>{coursesError}</p>
            <button
              type="button"
              onClick={() => void loadCourses().catch(() => undefined)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 cursor-pointer"
            >
              <RefreshCw size={14} /> Qayta urinish
            </button>
          </div>
        ) : coursesLoaded && courses.length === 0 ? (
          <div className="rounded-2xl bg-[var(--surface-bg)] py-16 text-center text-[var(--text-muted)] shadow-xs">
            <Inbox size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs font-medium">Hali kurs yaratilmagan</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,420px))]">
            {courses.map((course) => {
              const lessonCount = course.modules.reduce(
                (sum, m) => sum + m.lessons.length,
                0,
              );
              const groupCount =
                (course as { groups?: unknown[] }).groups?.length ?? 0;
              const totalStars = Math.max(lessonCount * 5, 1);

              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onOpenCourse(course.id)}
                  className="relative flex min-h-[170px] cursor-pointer flex-col overflow-hidden rounded-3xl bg-[var(--surface-bg)] p-5 text-left shadow-xs transition-colors hover:bg-[var(--card-hover)]"
                >
                  <div className="flex items-center gap-3 pr-20 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--app-bg)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)]">
                      <Star size={13} fill="currentColor" />0 / {totalStars}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                      <Users size={15} />
                      {groupCount}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                      <ThumbsUp size={15} />
                      5.0
                    </span>
                  </div>

                  <div className="absolute right-5 top-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--app-bg)] text-[var(--text-primary)]">
                    <GraduationCap size={28} />
                    <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 dark:bg-black/70 text-white shadow-xs">
                      <Play size={12} fill="currentColor" />
                    </span>
                  </div>

                  <div className="min-w-0 my-auto py-2">
                    <p className="max-w-[calc(100%-5rem)] text-lg sm:text-xl font-bold leading-tight text-[var(--text-primary)]">
                      {course.title}
                    </p>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-3 text-xs font-semibold text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1.5">
                      <Play
                        size={13}
                        fill="currentColor"
                      />
                      1
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={14} />
                      {groupCount} guruh
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Layers size={14} />
                      {course.modules.length} modul
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen size={14} />
                      {lessonCount} dars
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <PromptModal
          title="Yangi kurs"
          placeholder="Kurs nomi"
          confirmLabel="Yaratish"
          onConfirm={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}

      {showStartClass && (
        <StartClassModal onClose={() => setShowStartClass(false)} />
      )}
    </div>
  );
}
