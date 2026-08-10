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
    <div className="p-4">
      <ActiveClassBanner />

      <div className="mb-6 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-800 dark:text-zinc-100">Kurslar</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowStartClass(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-100 dark:shadow-none transition-colors hover:bg-red-600"
          >
            <Radio size={16} /> Jonli dars
          </button>
          <button
            type="button"
            onClick={() => navigate("/free-classes")}
            className="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-700"
          >
            <PenTool size={16} /> Erkin darslar
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 dark:shadow-none transition-colors hover:bg-indigo-600"
          >
            <Plus size={16} /> Yangi kurs
          </button>
        </div>
      </div>

      {coursesLoading && !coursesLoaded ? (
        <DataLoadingState label="Kurslar yuklanmoqda..." className="min-h-64" />
      ) : coursesError && courses.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-white text-center text-gray-400">
          <p className="text-sm">{coursesError}</p>
          <button
            type="button"
            onClick={() => void loadCourses().catch(() => undefined)}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white"
          >
            <RefreshCw size={14} /> Qayta urinish
          </button>
        </div>
      ) : coursesLoaded && courses.length === 0 ? (
        <div className="py-16 text-center text-gray-300">
          <Inbox size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Hali kurs yaratilmagan</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(280px,420px))]">
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
                className="relative flex min-h-37 cursor-pointer flex-col overflow-hidden rounded-[22px] bg-white p-4 text-left transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center gap-2 pr-20 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2.5 py-1 text-white">
                    <Star size={13} fill="currentColor" />0 / {totalStars}
                  </span>
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <Users size={14} className="text-gray-700" />
                    {groupCount}
                  </span>
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <ThumbsUp size={14} className="text-gray-700" />
                    5.0
                  </span>
                </div>

                <div className="absolute right-4 top-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
                  <GraduationCap size={28} />
                  <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-xl bg-gray-900 text-white">
                    <Play size={14} fill="currentColor" />
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="mt-4 max-w-[calc(100%-5rem)] text-[17px] font-bold leading-snug text-gray-900">
                    {course.title}
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-8 text-xs font-semibold text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Play
                      size={14}
                      className="text-gray-700"
                      fill="currentColor"
                    />
                    1
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={14} className="text-gray-700" />
                    {groupCount} guruh
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers size={14} className="text-gray-700" />
                    {course.modules.length} modul
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <BookOpen size={14} className="text-gray-700" />
                    {lessonCount} dars
                  </span>
                </div>
              </button>
            );
          })}
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

      {showStartClass && (
        <StartClassModal onClose={() => setShowStartClass(false)} />
      )}
    </div>
  );
}
