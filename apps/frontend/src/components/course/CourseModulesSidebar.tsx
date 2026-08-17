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
        className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${
          locked
            ? "cursor-not-allowed opacity-40 bg-transparent text-[var(--text-muted)]"
            : active
            ? "bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold"
            : "bg-black/5 dark:bg-white/5 border border-transparent text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10 hover:border-black/5 dark:hover:border-white/10 cursor-pointer"
        }`}
      >
        <div
          className="h-10 w-10 relative flex shrink-0 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10 text-[var(--text-secondary)]"
        >
          {locked ? (
            <Lock size={16} />
          ) : hasVideo ? (
            <Film size={18} />
          ) : (
            <BookOpen size={18} />
          )}
          {hasVideo && !locked && (
            <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-[var(--surface-bg)] bg-indigo-600 text-white">
              <Play size={8} fill="currentColor" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`${
              mobile ? "text-sm" : "text-xs"
            } line-clamp-2 font-bold ${
              active ? "text-indigo-600 dark:text-indigo-400" : locked ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"
            }`}
          >
            {lesson.title}
          </p>
          <div
            className={`${
              mobile ? "text-xs" : "text-[11px]"
            } mt-0.5 flex flex-wrap items-center gap-1.5 font-semibold text-[var(--text-muted)]`}
          >
            <span>Modul {moduleIndex + 1}</span>
            {videoDurationLabel && (
              <span className="rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px]">
                {videoDurationLabel}
              </span>
            )}
            {hasPractice && (
              <span className="rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px]">
                Amaliyot
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {totalStars > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              <Star size={11} fill="currentColor" /> {totalStars}
            </span>
          )}
          <span className="text-[var(--text-muted)]">
            {locked ? (
              <Lock size={15} />
            ) : isDone ? (
              <CheckCircle2 size={16} className="text-emerald-500" />
            ) : (
              <ChevronRight size={16} />
            )}
          </span>
        </div>
      </button>
    );
  };

  return (
    <aside className="hidden max-w-full overflow-hidden border-b border-black/5 dark:border-white/10 bg-[var(--surface-bg)] p-4 text-[var(--text-primary)] lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="mb-5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 px-3.5 py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} /> Kurslar
        </button>
        {courseStars.max > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            <Star size={13} fill="currentColor" /> {courseStars.earned} /{" "}
            {courseStars.max}
          </span>
        )}
      </div>

      <div className="glass-card mb-4 rounded-3xl p-4 shadow-sm border border-black/5 dark:border-white/10">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[var(--text-primary)]">Jarayon</span>
          <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
            {progressCount} / {totalLessons}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="-mx-3 flex max-w-[100vw] gap-2 overflow-x-auto px-3 pb-1 sm:gap-2 lg:mx-0 lg:max-w-none lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {course.modules.map((module, moduleIndex) => (
          <div key={module.id} className="contents lg:block">
            <div className="mb-2.5 hidden items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] lg:flex">
              <Layers3 size={14} />
              <span>{module.title || `Modul ${moduleIndex + 1}`}</span>
            </div>
            <div className="contents lg:block lg:space-y-2">
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
