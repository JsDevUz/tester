import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Film,
  Layers3,
  Lock,
  Play,
  Star,
} from "lucide-react";
import type { ApiMyCourseDetail, ApiMyLesson } from "../../api/groups";

interface CourseModulesSidebarProps {
  course: ApiMyCourseDetail;
  selectedLessonId: string | null;
  unlockedLessonIds: Set<string>;
  progressCount: number;
  totalLessons: number;
  progressPercent: number;
  courseStars: { earned: number; max: number };
  onBack: () => void;
  onSelectLesson: (lessonId: string) => void;
}

export function CourseModulesSidebar({
  course,
  selectedLessonId,
  unlockedLessonIds,
  progressCount,
  totalLessons,
  progressPercent,
  courseStars,
  onBack,
  onSelectLesson,
}: CourseModulesSidebarProps) {
  const renderLessonButton = (
    moduleIndex: number,
    lesson: ApiMyLesson,
    mobile = false,
  ) => {
    const active = lesson.id === selectedLessonId;
    const videoBlock = lesson.blocks.find((block) => block.type === "video");
    const hasVideo = Boolean(videoBlock);
    const isDone = lesson.completed;
    const locked = !unlockedLessonIds.has(lesson.id);
    const totalStars =
      lesson.practiceBlocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0) +
      (lesson.completionScore ?? 0);
    const hasPractice = lesson.practiceBlocks.length > 0;
    const videoDurationLabel =
      videoBlock?.durationSec != null
        ? `${String(Math.floor(videoBlock.durationSec / 60)).padStart(2, "0")}:${String(
            videoBlock.durationSec % 60,
          ).padStart(2, "0")}`
        : null;

    return (
      <button
        key={lesson.id}
        type="button"
        onClick={() => {
          if (locked) return;
          onSelectLesson(lesson.id);
        }}
        disabled={locked}
        className={
          mobile
            ? `flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
                locked
                  ? "cursor-not-allowed border-transparent bg-gray-50 text-gray-300 opacity-70"
                  : active
                  ? "border-gray-900 bg-white text-gray-900"
                  : "border-transparent bg-white text-gray-900 hover:border-gray-300"
              }`
            : `flex w-full items-center gap-2.5 rounded-xl border bg-white p-2.5 text-left transition-colors ${
                locked
                  ? "cursor-not-allowed border-transparent text-gray-300 opacity-70"
                  : active
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-900 hover:border-gray-300"
              }`
        }
      >
        <div
          className={`${
            mobile ? "h-11 w-11 rounded-xl" : "h-11 w-11 rounded-xl"
          } relative flex shrink-0 items-center justify-center bg-gray-100 text-gray-300`}
        >
          {locked ? (
            <Lock size={mobile ? 18 : 18} />
          ) : hasVideo ? (
            <Film size={mobile ? 19 : 19} />
          ) : (
            <BookOpen size={mobile ? 19 : 19} />
          )}
          {hasVideo && !locked && (
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white">
              <Play size={10} fill="currentColor" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`${
              mobile ? "text-sm" : "text-xs"
            } line-clamp-2 font-bold ${
              active ? "text-gray-900" : locked ? "text-gray-400" : "text-gray-900"
            }`}
          >
            {lesson.title}
          </p>
          <div
            className={`${
              mobile ? "text-xs" : "text-[11px]"
            } mt-0.5 flex flex-wrap items-center gap-1.5 font-semibold text-gray-400`}
          >
            <span>Modul {moduleIndex + 1}</span>
            {videoDurationLabel && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-500">
                {videoDurationLabel}
              </span>
            )}
            {hasPractice && (
              <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-600">
                Amaliyot
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {totalStars > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-500">
              <Star size={11} fill="currentColor" /> {totalStars}
            </span>
          )}
          <span className="text-gray-400">
            {locked ? (
              <Lock size={mobile ? 18 : 15} />
            ) : isDone ? (
              <CheckCircle2 size={mobile ? 18 : 16} className="text-green-500" />
            ) : (
              <ChevronRight size={mobile ? 18 : 16} />
            )}
          </span>
        </div>
      </button>
    );
  };

  return (
    <aside className="hidden max-w-full overflow-hidden border-b border-gray-200 bg-gray-100/80 p-3 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-600"
        >
          <ArrowLeft size={16} /> Kurslar
        </button>
        {courseStars.max > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-500">
            <Star size={13} fill="currentColor" /> {courseStars.earned} /{" "}
            {courseStars.max}
          </span>
        )}
      </div>

      <div className="mb-3 rounded-2xl bg-white p-3 sm:mb-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-gray-900">Jarayon</span>
          <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-[11px] font-bold text-white">
            {progressCount} / {totalLessons}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-[var(--color-indigo-500)] transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="-mx-3 flex max-w-[100vw] gap-2 overflow-x-auto px-3 pb-1 sm:gap-2 lg:mx-0 lg:max-w-none lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {course.modules.map((module, moduleIndex) => (
          <div key={module.id} className="contents lg:block">
            <div className="mb-2 hidden items-center gap-2 px-1 text-xs font-bold uppercase tracking-wide text-gray-400 lg:flex">
              <Layers3 size={14} />
              <span>{module.title || `Modul ${moduleIndex + 1}`}</span>
            </div>
            <div className="contents lg:block lg:space-y-2.5">
              {module.lessons.map((lesson) =>
                renderLessonButton(moduleIndex, lesson),
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
