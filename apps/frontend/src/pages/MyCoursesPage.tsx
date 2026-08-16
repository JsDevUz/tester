import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Film,
  Layers3,
  Loader2,
  Lock,
  Play,
  Star,
  Trophy,
  UserRound,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "../components/student/StudentShell";
import { StudentActiveBanners } from "../components/student/StudentActiveBanners";
import {
  apiGetMyCourseDetail,
  apiGetMyCourses,
  apiMarkLessonComplete,
  type ApiMyCourse,
  type ApiMyCourseDetail,
  type ApiMyLesson,
} from "../api/groups";
import { apiGetOrCreatePracticeChatForCourse } from "../api/practiceMessenger";
import { PracticeScreen } from "../components/student/PracticeScreen";
import { TestTaker } from "../components/test/TestTaker";
import { schedulePageScrollReset } from "../utils/scroll";
import { useLessonAntiCapture } from "../hooks/useLessonAntiCapture";
import { CourseLeaderboardModal } from "../components/course/CourseLeaderboardModal";
import { CourseModulesSidebar } from "../components/course/CourseModulesSidebar";
import { LessonReader } from "../components/course/LessonContentRenderer";

export function MyCoursesPage() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<ApiMyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [leaderboardCourse, setLeaderboardCourse] = useState<ApiMyCourse | null>(null);

  function loadCourses() {
    setLoading(true);
    setLoadError(null);
    return apiGetMyCourses(schoolId)
      .then(setCourses)
      .catch((err) => {
        const message = err?.response?.data?.message;
        setLoadError(
          Array.isArray(message)
            ? message[0]
            : message || "Kurslarni yuklab bo‘lmadi",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void loadCourses();
  }, [schoolId]);

  if (selectedCourseId) {
    return (
      <StudentCourseReader
        courseId={selectedCourseId}
        onBack={() => {
          setSelectedCourseId(null);
          void loadCourses();
        }}
      />
    );
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel w-full p-4 sm:p-5">
        {schoolId ? (
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/schools")}
              aria-label="Maktablarga qaytish"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-bold text-gray-800">Kurslar</h1>
          </div>
        ) : (
          <h1 className="mb-4 text-lg font-bold text-gray-800">
            Mening kurslarim
          </h1>
        )}

        <StudentActiveBanners className="mb-4" />

        {loading && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

        {!loading && loadError && courses.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-400">
            <p className="mx-auto max-w-xs text-sm leading-6">{loadError}</p>
            <p className="mt-3 text-xs text-gray-300">
              Yangilash uchun yuqoridan pastga torting
            </p>
          </div>
        )}

        {!loading && !loadError && courses.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali hech qanday kursga qo'shilmagansiz</p>
          </div>
        )}

        {!loading && !loadError && courses.length > 0 && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {courses.map((c) => (
              <div
                key={`${c.courseId}-${c.groupName}`}
                className="student-course-card flex min-h-[150px] flex-col rounded-3xl p-4 sm:min-h-[185px] sm:p-5"
              >
                <button
                  type="button"
                  onClick={() => setSelectedCourseId(c.courseId)}
                  className="flex flex-1 w-full flex-col justify-between gap-6 text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {c.starsMax > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-2 text-sm font-bold text-white">
                            <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-gray-900">
                              <Star size={13} fill="currentColor" />
                            </span>
                            {c.starsEarned} / {c.starsMax}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
                          <UserRound size={16} className="text-gray-700" />
                          {c.studentCount}
                        </span>
                      </div>

                      <p className="line-clamp-2 text-lg font-bold leading-tight text-gray-950 sm:text-xl">
                        {c.courseTitle}
                      </p>
                    </div>

                    <div className="student-course-card-icon grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl sm:h-16 sm:w-16">
                      <BookOpen size={23} className="text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex min-w-0 items-center gap-2 text-xs font-medium text-gray-950 sm:text-sm">
                      <Zap size={16} />
                      <span className="shrink-0">
                        {c.lessonsCompleted} / {c.lessonsTotal}
                      </span>
                      <span className="shrink-0">•</span>
                      <span className="shrink-0">{c.progressPercent}%</span>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-400/35 sm:h-2">
                      <div
                        className="h-full rounded-full bg-[var(--color-indigo-500)]"
                        style={{ width: `${c.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </button>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLeaderboardCourse(c)}
                    className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-white"
                  >
                    <Trophy size={14} className="text-amber-500" /> Peshqadamlar
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/challanges")}
                    className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-white"
                  >
                    <BookOpen size={14} className="text-indigo-500" /> Challenge-lar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {leaderboardCourse && (
        <CourseLeaderboardModal
          course={leaderboardCourse}
          onClose={() => setLeaderboardCourse(null)}
        />
      )}
    </StudentShell>
  );
}

function StudentCourseReader({
  courseId,
  onBack,
}: {
  courseId: string;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const [course, setCourse] = useState<ApiMyCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [mobileLessonsOpen, setMobileLessonsOpen] = useState(false);
  const [showPractice, setShowPractice] = useState(false);
  const [activeTest, setActiveTest] = useState<{
    slug: string;
    submissionId?: string;
  } | null>(null);

  useLessonAntiCapture(!loading && !error && Boolean(course));

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiGetMyCourseDetail(courseId)
      .then((data) => {
        setCourse(data);
        const allLessons = data.modules.flatMap((m) => m.lessons);
        const lastViewedId = localStorage.getItem(`course:${courseId}:lastLessonId`);
        const lastViewedLesson = allLessons.find((l) => l.id === lastViewedId);
        if (lastViewedLesson) {
          setSelectedLessonId(lastViewedLesson.id);
          return;
        }
        let resumeIndex = 0;
        for (let i = 0; i < allLessons.length - 1; i++) {
          if (!allLessons[i].completed) break;
          resumeIndex = i + 1;
        }
        const resumeLesson = allLessons.length > 0 ? allLessons[resumeIndex] : undefined;
        setSelectedLessonId(resumeLesson?.id ?? null);
      })
      .catch((err) => {
        setCourse(null);
        setSelectedLessonId(null);
        const message = err?.response?.data?.message;
        setError(
          Array.isArray(message)
            ? message[0]
            : message || "To'lov muddati kelgan, lekin to'lanmagan",
        );
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  function refreshCourseSilently() {
    return apiGetMyCourseDetail(courseId)
      .then(setCourse)
      .catch(() => {});
  }

  const lessons = useMemo(
    () =>
      course?.modules.flatMap((module) =>
        module.lessons.map((lesson) => ({ module, lesson })),
      ) ?? [],
    [course],
  );
  const selected = lessons.find((item) => item.lesson.id === selectedLessonId) ?? lessons[0];
  const selectedIndex = selected
    ? lessons.findIndex((item) => item.lesson.id === selected.lesson.id)
    : -1;

  const unlockedLessonIds = useMemo(() => {
    const unlocked = new Set<string>();
    for (const module of course?.modules ?? []) {
      for (let i = 0; i < module.lessons.length; i++) {
        const lesson = module.lessons[i];
        if (i === 0) {
          unlocked.add(lesson.id);
          continue;
        }
        if (module.lessons[i - 1].completed) unlocked.add(lesson.id);
        else break;
      }
    }
    return unlocked;
  }, [course]);

  const progressCount = lessons.filter((item) => item.lesson.completed).length;
  const progressPercent =
    lessons.length > 0 ? (progressCount / lessons.length) * 100 : 0;

  const courseStars = useMemo(() => {
    let earned = 0;
    let max = 0;
    for (const { lesson } of lessons) {
      for (const block of lesson.practiceBlocks) {
        max += block.maxScore ?? 0;
        earned += block.earnedScore ?? 0;
      }
      if (lesson.completionScore !== null) {
        max += lesson.completionScore;
        if (lesson.completed) earned += lesson.completionScore;
      }
    }
    return { earned, max };
  }, [lessons]);

  useEffect(() => {
    setShowPractice(false);
    setActiveTest(null);
  }, [selectedLessonId]);

  useEffect(() => {
    if (!selectedLessonId) return;
    localStorage.setItem(`course:${courseId}:lastLessonId`, selectedLessonId);
  }, [courseId, selectedLessonId]);

  useLayoutEffect(() => {
    return schedulePageScrollReset();
  }, [selectedLessonId, showPractice, activeTest]);

  function markSelectedLessonComplete() {
    if (!selected) return Promise.resolve();
    const lessonId = selected.lesson.id;
    return apiMarkLessonComplete(lessonId).then(() => {
      setCourse((current) => {
        if (!current) return current;
        return {
          ...current,
          modules: current.modules.map((module) => ({
            ...module,
            lessons: module.lessons.map((lesson) =>
              lesson.id === lessonId ? { ...lesson, completed: true } : lesson,
            ),
          })),
        };
      });
    });
  }

  function isLessonPassing(lesson: ApiMyLesson): boolean {
    const allTestsAttempted = lesson.practiceBlocks
      .filter((block) => block.type === "test")
      .every((block) => block.submissions.length > 0);
    if (!allTestsAttempted) return false;
    if (!lesson.passThresholdEnabled) return true;
    if (lesson.combinedPracticePercent === null) return false;
    return lesson.combinedPracticePercent >= (lesson.passThresholdPercent ?? 0);
  }

  const renderMobileLessonButton = (moduleIndex: number, lesson: ApiMyLesson) => {
    const active = lesson.id === selected?.lesson.id;
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
          setSelectedLessonId(lesson.id);
          setMobileLessonsOpen(false);
        }}
        disabled={locked}
        className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
          locked
            ? "cursor-not-allowed border-transparent bg-gray-50 text-gray-300 opacity-70"
            : active
            ? "border-gray-900 bg-white text-gray-900"
            : "border-transparent bg-white text-gray-900 hover:border-gray-300"
        }`}
      >
        <div className="h-11 w-11 rounded-xl relative flex shrink-0 items-center justify-center bg-gray-100 text-gray-300">
          {locked ? (
            <Lock size={18} />
          ) : hasVideo ? (
            <Film size={19} />
          ) : (
            <BookOpen size={19} />
          )}
          {hasVideo && !locked && (
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white">
              <Play size={10} fill="currentColor" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm line-clamp-2 font-bold ${
              active ? "text-gray-900" : locked ? "text-gray-400" : "text-gray-900"
            }`}
          >
            {lesson.title}
          </p>
          <div className="text-xs mt-0.5 flex flex-wrap items-center gap-1.5 font-semibold text-gray-400">
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
              <Lock size={18} />
            ) : isDone ? (
              <CheckCircle2 size={18} className="text-green-500" />
            ) : (
              <ChevronRight size={18} />
            )}
          </span>
        </div>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white">
        <Loader2 className="animate-spin text-gray-900" size={28} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-white p-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-500"
        >
          <ArrowLeft size={18} /> Kurslarga qaytish
        </button>
        <div className="rounded-2xl bg-gray-50 py-20 text-center text-gray-400">
          <Lock size={34} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  if (!course || lessons.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-white p-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-500"
        >
          <ArrowLeft size={18} /> Kurslarga qaytish
        </button>
        <div className="rounded-2xl bg-gray-50 py-20 text-center text-gray-400">
          <BookOpen size={34} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-semibold">Bu kursda hozircha ochiq dars yo‘q</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] select-none bg-white text-gray-900"
      onContextMenu={(e) => e.preventDefault()}
    >
      {!activeTest && (
        <div className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 px-3 py-2.5 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600"
            >
              <ArrowLeft size={21} />
            </button>
            <button
              type="button"
              onClick={() => setMobileLessonsOpen((value) => !value)}
              className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-gray-900"
            >
              <span className="truncate">Darslar Tartibi</span>
              {mobileLessonsOpen ? (
                <ChevronUp size={20} className="text-gray-700" />
              ) : (
                <ChevronDown size={20} className="text-gray-700" />
              )}
            </button>
            <span className="shrink-0 rounded-full bg-gray-900 px-2.5 py-1 text-xs font-bold text-white">
              {progressCount} / {lessons.length}
            </span>
          </div>
        </div>
      )}

      {!activeTest && mobileLessonsOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-gray-50 px-3 pb-24 pt-3 lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600"
            >
              <ArrowLeft size={21} />
            </button>
            <button
              type="button"
              onClick={() => setMobileLessonsOpen(false)}
              className="flex items-center gap-1.5 text-base font-semibold text-gray-900"
            >
              Darslar Tartibi <ChevronUp size={20} />
            </button>
            <span className="rounded-full bg-gray-900 px-2.5 py-1 text-xs font-bold text-white">
              {progressCount} / {lessons.length}
            </span>
          </div>

          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold">Jarayon</span>
              <span className="text-xs font-bold text-gray-500">
                {progressCount} / {lessons.length}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[var(--color-indigo-500)] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            {course.modules.map((module, moduleIndex) => (
              <div key={module.id} className="space-y-2">
                <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  <Layers3 size={13} />
                  <span>{module.title || `Modul ${moduleIndex + 1}`}</span>
                </div>
                {module.lessons.map((lesson) =>
                  renderMobileLessonButton(moduleIndex, lesson),
                )}
              </div>
            ))}
          </div>

          <div className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/95 p-3 backdrop-blur">
            <button
              type="button"
              onClick={() => setMobileLessonsOpen(false)}
              className="h-11 w-full rounded-xl bg-gray-100 text-sm font-semibold text-gray-700"
            >
              Yopish
            </button>
          </div>
        </div>
      )}

      <div className="grid min-h-0 lg:min-h-screen lg:grid-cols-[340px_minmax(0,1fr)]">
        <CourseModulesSidebar
          course={course}
          selectedLessonId={selected?.lesson.id ?? null}
          unlockedLessonIds={unlockedLessonIds}
          progressCount={progressCount}
          totalLessons={lessons.length}
          progressPercent={progressPercent}
          courseStars={courseStars}
          onBack={onBack}
          onSelectLesson={(id) => setSelectedLessonId(id)}
        />

        <main
          className={`min-w-0 overflow-hidden py-4 lg:py-6 ${
            activeTest ? "px-0 sm:px-4 lg:px-8" : "px-4 sm:px-6 lg:px-10"
          }`}
        >
          {selected && activeTest ? (
            <TestTaker
              slug={activeTest.slug}
              submissionId={activeTest.submissionId}
              practiceMode={true}
              onNavigateResult={() => {
                void refreshCourseSilently();
              }}
              onExit={() => {
                setActiveTest(null);
                void refreshCourseSilently();
              }}
            />
          ) : selected && showPractice ? (
            <PracticeScreen
              lesson={selected.lesson}
              onBack={() => setShowPractice(false)}
              onStartPractice={(block) => {
                if (block.testSlug) setActiveTest({ slug: block.testSlug });
              }}
              onViewSubmission={(block, submissionId) => {
                if (block.testSlug) setActiveTest({ slug: block.testSlug, submissionId });
              }}
              onImageSubmitted={() => void refreshCourseSilently()}
              hasNext={selectedIndex + 1 < lessons.length}
              canComplete={isLessonPassing(selected.lesson)}
              onNext={async () => {
                await markSelectedLessonComplete();
                const next = lessons[selectedIndex + 1];
                if (next) setSelectedLessonId(next.lesson.id);
              }}
            />
          ) : selected ? (
            <LessonReader
              lesson={selected.lesson}
              moduleTitle={selected.module.title}
              curatorName={course.curatorName}
              lessonNumber={selectedIndex + 1}
              totalLessons={lessons.length}
              hasPractice={selected.lesson.practiceBlocks.length > 0}
              blockedByThreshold={
                selected.lesson.passThresholdEnabled &&
                !isLessonPassing(selected.lesson)
              }
              onOpenMessenger={async () => {
                try {
                  await apiGetOrCreatePracticeChatForCourse(courseId);
                  navigate(`/messenger?courseId=${courseId}`);
                } catch {
                  toast.error("Suhbatni ochib bo'lmadi");
                }
              }}
              onOpenPractice={() => {
                setShowPractice(true);
              }}
              onPrev={() => {
                const prev = lessons[selectedIndex - 1];
                if (prev) setSelectedLessonId(prev.lesson.id);
              }}
              onNext={async () => {
                await markSelectedLessonComplete();
                if (
                  selected.lesson.passThresholdEnabled &&
                  !isLessonPassing(selected.lesson)
                )
                  return;
                const next = lessons[selectedIndex + 1];
                if (next) setSelectedLessonId(next.lesson.id);
              }}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
