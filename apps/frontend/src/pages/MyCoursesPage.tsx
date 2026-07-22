import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Lock,
  MessageCircle,
  Play,
  Radio,
  Star,
  Trophy,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "../components/student/StudentShell";
import {
  apiGetMyCourseDetail,
  apiGetMyCourseLeaderboard,
  apiGetMyCourses,
  apiMarkLessonComplete,
  type ApiMyCourse,
  type ApiMyCourseDetail,
  type ApiMyCourseLeaderboard,
  type ApiMyLesson,
} from "../api/groups";
import { apiGetOrCreatePracticeChatForCourse } from "../api/practiceMessenger";
import type { ApiContentBlock } from "../api/contentBlocks";
import { HlsVideoPlayer } from "../components/course/HlsVideoPlayer";
import { ImageLightbox } from "../components/student/ImageLightbox";
import { PracticeScreen } from "../components/student/PracticeScreen";
import { TestTaker } from "../components/test/TestTaker";
import { schedulePageScrollReset } from "../utils/scroll";
import { UserAvatar } from "../components/UserAvatar";

function pauseLessonVideos() {
  document.querySelectorAll("video").forEach((video) => {
    video.pause();
  });
}

function useLessonAntiCapture(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;

    const prevent = (event: Event) => {
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey;
      const isScreenshotCombo =
        event.metaKey && event.shiftKey && ["3", "4", "5"].includes(key);
      const isDevToolsCombo =
        event.key === "F12" ||
        (hasModifier && event.shiftKey && ["i", "j", "c"].includes(key));
      const isBlockedShortcut =
        hasModifier && ["p", "s", "u", "c"].includes(key);

      if (event.key === "PrintScreen") {
        event.preventDefault();
        pauseLessonVideos();
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText("").catch(() => undefined);
        }
        return;
      }

      if (isScreenshotCombo || isDevToolsCombo || isBlockedShortcut) {
        event.preventDefault();
        pauseLessonVideos();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) pauseLessonVideos();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", pauseLessonVideos);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    document.addEventListener("paste", prevent);
    document.addEventListener("dragstart", prevent);
    document.addEventListener("selectstart", prevent);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", pauseLessonVideos);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
      document.removeEventListener("paste", prevent);
      document.removeEventListener("dragstart", prevent);
      document.removeEventListener("selectstart", prevent);
    };
  }, [enabled]);
}

export function MyCoursesPage() {
  const [courses, setCourses] = useState<ApiMyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [leaderboardCourse, setLeaderboardCourse] =
    useState<ApiMyCourse | null>(null);

  function loadCourses() {
    setLoading(true);
    setLoadError(null);
    return apiGetMyCourses()
      .then(setCourses)
      .catch(() => {
        setLoadError("Kurslarni yuklab bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void loadCourses();
  }, []);

  useLayoutEffect(() => {
    return schedulePageScrollReset();
  }, [selectedCourseId]);

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
      <div className="w-full  rounded-2xl bg-white p-4 sm:p-5">
        <h1 className="mb-4 text-lg font-bold text-gray-800">
          Mening kurslarim
        </h1>

        {loading && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

        {!loading && loadError && courses.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-400">
            <p className="mx-auto max-w-xs text-sm leading-6">{loadError}</p>
            <p className="mt-3 text-xs text-gray-300">Yangilash uchun yuqoridan pastga torting</p>
          </div>
        )}

        {!loading && !loadError && courses.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali hech qanday kursga qo'shilmagansiz</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
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
                    <div className="mb-3 flex flex-wrap items-center gap-3">
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
              <button
                type="button"
                onClick={() => setLeaderboardCourse(c)}
                className="mt-3 inline-flex w-fit shrink-0 self-start items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-white"
              >
                <Trophy size={14} className="text-amber-500" /> Peshqadamlar
              </button>
            </div>
          ))}
        </div>
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

function CourseLeaderboardModal({
  course,
  onClose,
}: {
  course: ApiMyCourse;
  onClose: () => void;
}) {
  const [leaderboard, setLeaderboard] = useState<ApiMyCourseLeaderboard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGetMyCourseLeaderboard(course.courseId)
      .then((data) => {
        if (active) setLeaderboard(data);
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError?.response?.data?.message ??
              "Reytingni yuklab bo‘lmadi.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [course.courseId]);

  const topThree = leaderboard?.entries.slice(0, 3) ?? [];
  const remaining = leaderboard?.entries.slice(3) ?? [];
  const rankStyle: Record<number, { podium: string; avatar: string }> = {
    1: { podium: "order-2 h-32 bg-amber-400", avatar: "bg-amber-400" },
    2: { podium: "order-1 h-24 bg-slate-300", avatar: "bg-slate-400" },
    3: { podium: "order-3 h-20 bg-orange-300", avatar: "bg-orange-400" },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-gradient-to-br from-cyan-600 via-sky-600 to-indigo-600 p-4 text-white shadow-2xl sm:rounded-3xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Kurs peshqadamlari"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-white/70">
              {course.courseTitle}
            </p>
            <h2 className="mt-0.5 flex items-center gap-2 text-xl font-bold">
              <Trophy size={20} className="text-amber-300" /> Peshqadamlar
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white/80 hover:bg-white/20"
            aria-label="Yopish"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-white/75">
            Reyting yuklanmoqda...
          </p>
        ) : error ? (
          <p className="py-16 text-center text-sm text-red-100">{error}</p>
        ) : leaderboard?.entries.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/75">
            Hali reyting uchun o‘quvchilar yo‘q.
          </p>
        ) : (
          <>
            <div className="mt-6 flex items-end justify-center gap-2 sm:gap-4">
              {[topThree[1], topThree[0], topThree[2]]
                .filter(Boolean)
                .map((entry) => {
                  const style = rankStyle[entry.rank];
                  return (
                    <div
                      key={entry.studentId}
                      className={`flex w-[30%] max-w-40 flex-col items-center ${style.podium.includes("order-2") ? "mb-0" : "mb-0"}`}
                    >
                      <div className="relative mb-2">
                        <UserAvatar
                          name={entry.studentName}
                          avatarUrl={entry.studentAvatarUrl}
                          className={`h-12 w-12 rounded-full border-2 border-white/70 text-sm font-bold text-white shadow-lg ${style.avatar}`}
                        />
                        <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-gray-800">
                          {entry.rank}
                        </span>
                      </div>
                      <p className="w-full truncate text-center text-xs font-semibold">
                        {entry.studentName}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-amber-100">
                        <Star size={11} fill="currentColor" />{" "}
                        {entry.starsEarned}
                      </p>
                      <div
                        className={`mt-2 flex w-full items-center justify-center rounded-t-xl text-3xl font-black text-white/90 ${style.podium}`}
                      >
                        {entry.rank}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="mt-4 space-y-2">
              {remaining.map((entry) => (
                <div
                  key={entry.studentId}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${entry.isCurrentStudent ? "bg-white/25 ring-1 ring-white/50" : "bg-white/15"}`}
                >
                  <span className="w-6 text-center text-sm font-bold text-white/80">
                    {entry.rank}
                  </span>
                  <UserAvatar
                    name={entry.studentName}
                    avatarUrl={entry.studentAvatarUrl}
                    className="h-8 w-8 rounded-full bg-white/20 text-xs font-bold"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {entry.studentName}
                      {entry.isCurrentStudent ? " (Siz)" : ""}
                    </p>
                    <p className="text-[11px] text-white/70">
                      {entry.lessonsCompleted}/{entry.lessonsTotal} dars
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-1 text-xs font-bold text-amber-950">
                    <Star size={12} fill="currentColor" /> {entry.starsEarned}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
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
  const selected =
    lessons.find((item) => item.lesson.id === selectedLessonId) ?? lessons[0];
  const selectedIndex = selected
    ? lessons.findIndex((item) => item.lesson.id === selected.lesson.id)
    : -1;
  // Har bir bo'lim o'zining MUSTAQIL ketma-ket unlock zanjiriga ega —
  // bo'limning birinchi darsi har doim ochiq (oldingi bo'lim tugallanmagan
  // bo'lsa ham), shu bo'lim ichida esa navbatdagi dars faqat oldingisi
  // tugallangach ochiladi. Bitta bo'limdagi progress boshqa bo'limlarni
  // ochib yubormaydi — global (butun kurs bo'ylab) indeks emas, har bir
  // bo'lim o'z ichida alohida hisoblanadi.
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

  const renderLessonButton = (
    moduleIndex: number,
    lesson: ApiMyLesson,
    mobile = false,
  ) => {
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
        ? `${String(Math.floor(videoBlock.durationSec / 60)).padStart(2, "0")}:${String(videoBlock.durationSec % 60).padStart(2, "0")}`
        : null;

    return (
      <button
        key={lesson.id}
        type="button"
        onClick={() => {
          if (locked) return;
          setSelectedLessonId(lesson.id);
          if (mobile) setMobileLessonsOpen(false);
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
          className={`${mobile ? "h-11 w-11 rounded-xl" : "h-11 w-11 rounded-xl"} relative flex shrink-0 items-center justify-center bg-gray-100 text-gray-300`}
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
            className={`${mobile ? "text-sm" : "text-xs"} line-clamp-2 font-bold ${active ? "text-gray-900" : locked ? "text-gray-400" : "text-gray-900"}`}
          >
            {lesson.title}
          </p>
          <div
            className={`${mobile ? "text-xs" : "text-[11px]"} mt-0.5 flex flex-wrap items-center gap-1.5 font-semibold text-gray-400`}
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
              <CheckCircle2
                size={mobile ? 18 : 16}
                className="text-green-500"
              />
            ) : (
              <ChevronRight size={mobile ? 18 : 16} />
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
          <p className="text-sm font-semibold">
            Bu kursda hozircha ochiq dars yo‘q
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] select-none bg-white text-gray-900"
      onContextMenu={(e) => e.preventDefault()}
    >
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

      {mobileLessonsOpen && (
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
                  renderLessonButton(moduleIndex, lesson, true),
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
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-gray-900">Jarayon</span>
              <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-[11px] font-bold text-white">
                {progressCount} / {lessons.length}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[var(--color-indigo-500)] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="-mx-3 flex max-w-[100vw] gap-2 overflow-x-auto px-3 pb-1 sm:gap-3 lg:mx-0 lg:max-w-none lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
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
                if (block.testSlug)
                  setActiveTest({ slug: block.testSlug, submissionId });
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

function LessonReader({
  lesson,
  moduleTitle,
  curatorName,
  lessonNumber,
  totalLessons,
  hasPractice,
  blockedByThreshold,
  onOpenMessenger,
  onOpenPractice,
  onPrev,
  onNext,
}: {
  lesson: ApiMyLesson;
  moduleTitle: string;
  curatorName: string | null;
  lessonNumber: number;
  totalLessons: number;
  hasPractice: boolean;
  blockedByThreshold: boolean;
  onOpenMessenger: () => void;
  onOpenPractice: () => void | Promise<void>;
  onPrev: () => void;
  onNext: () => void | Promise<void>;
}) {
  const readyBlocks = lesson.blocks.filter(
    (block) =>
      block.type !== "video" ||
      block.embedUrl ||
      block.processingStatus === "ready",
  );

  return (
    <article className="mx-auto w-full max-w-full overflow-hidden pb-12 text-gray-900">
      <div className="-mx-4 mb-4 bg-white/95 px-4 pb-3 pt-2 backdrop-blur sm:-mx-6 sm:mb-6 sm:px-6 lg:sticky lg:top-0 lg:z-10 lg:-mx-10 lg:px-10">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-gray-400 sm:text-xs">
            {moduleTitle}
          </p>
          <h1 className="mt-1.5 text-xl font-black leading-tight text-gray-950 sm:mt-3 sm:text-4xl">
            {lesson.title}
          </h1>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenMessenger}
        className="mb-5 flex w-full items-center justify-between rounded-2xl bg-gray-100 px-3 py-3 text-left transition-colors sm:mb-6 sm:px-4 lg:rounded-xl hover:bg-gray-200"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white sm:h-9 sm:w-9">
            <MessageCircle size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-gray-900">
              {curatorName
                ? `${curatorName} bilan suhbatlashish`
                : "Ustozga murojaat"}
            </span>
            <span className="block truncate text-[11px] font-semibold text-gray-500">
              {curatorName
                ? "Kuratorga savolingizni berishingiz mumkin"
                : "Kurator biriktirilmaguncha ustozingizga yozishingiz mumkin"}
            </span>
          </span>
        </span>
        <MessageCircle size={18} className="shrink-0 text-gray-700" />
      </button>

      <div className="space-y-5 sm:space-y-6">
        {readyBlocks.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 py-16 text-center text-gray-400">
            <BookOpen size={30} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm font-semibold">
              Dars kontenti hozircha tayyor emas
            </p>
          </div>
        ) : (
          readyBlocks.map((block) => (
            <LessonBlock key={block.id} block={block} />
          ))
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 sm:mt-10 sm:gap-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={lessonNumber <= 1}
          className="rounded-xl bg-gray-100 px-3.5 py-2.5 text-xs font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
        >
          Orqaga
        </button>
        <button
          type="button"
          onClick={() => {
            if (hasPractice) void onOpenPractice();
            else void onNext();
          }}
          disabled={!hasPractice && blockedByThreshold}
          className={`rounded-xl px-3.5 py-2.5 text-xs font-bold text-white sm:px-4 ${
            !hasPractice && blockedByThreshold
              ? 'cursor-not-allowed bg-gray-200 text-gray-400'
              : 'bg-[var(--color-indigo-500)]'
          }`}
        >
          {hasPractice
            ? "Amaliyot"
            : lessonNumber >= totalLessons
              ? "Yakunlash"
              : "Keyingi dars"}
        </button>
      </div>
      {!hasPractice && blockedByThreshold && (
        <p className="mt-2 text-right text-xs font-semibold text-red-500">
          Keyingi darsni ochish uchun o'tish balidan yetarlicha ball to'plang
        </p>
      )}
    </article>
  );
}

function LiveClassBlockTile({ classSessionId }: { classSessionId: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/classroom-history/${classSessionId}/replay`)}
      className="flex w-full items-center gap-3 rounded-xl bg-gray-100 px-3 py-2.5 text-left transition-colors hover:bg-gray-200"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
        <Radio size={18} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold text-gray-900">Jonli dars</span>
        <span className="block text-xs font-semibold text-gray-400">Yozuvni ko'rish</span>
      </span>
    </button>
  );
}

function LessonBlock({ block }: { block: ApiContentBlock }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (block.type === "editor") {
    return (
      <>
        <div
          className="lesson-reader-html max-w-full overflow-hidden text-sm leading-7 text-gray-900 sm:text-base [&_*]:max-w-full [&_iframe]:aspect-video [&_iframe]:w-full [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-xl [&_video]:aspect-video [&_video]:w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1"
          dangerouslySetInnerHTML={{ __html: block.html ?? "" }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") {
              setLightboxSrc((target as HTMLImageElement).src);
            }
          }}
        />
        {lightboxSrc && (
          <ImageLightbox
            src={lightboxSrc}
            onClose={() => setLightboxSrc(null)}
          />
        )}
      </>
    );
  }

  if (block.type === "video") {
    if (block.embedUrl) {
      return (
        <div className="max-w-full overflow-hidden rounded-2xl bg-black">
          <iframe
            src={block.embedUrl}
            title={block.label ?? block.fileName ?? "Video"}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    return <HlsVideoPlayer blockId={block.id} watermark />;
  }

  if (block.type === "image" && block.previewUrl) {
    return (
      <figure>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block w-full max-w-full cursor-zoom-in overflow-hidden"
          aria-label="Rasmni kattalashtirish"
        >
          <img
            src={block.previewUrl}
            alt={block.label ?? block.fileName ?? ""}
            draggable={false}
            className="max-h-[260px] w-full rounded-2xl object-contain sm:max-h-[420px]"
          />
        </button>
        {block.label && (
          <figcaption className="mt-2 text-xs font-semibold text-gray-400">
            {block.label}
          </figcaption>
        )}
        {lightboxOpen && (
          <ImageLightbox
            src={block.previewUrl}
            alt={block.label ?? block.fileName ?? ""}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </figure>
    );
  }

  if (block.type === "file" && block.previewUrl) {
    const ext =
      (block.fileName ?? block.label ?? "FILE")
        .split(".")
        .pop()
        ?.toUpperCase() ?? "FILE";
    return (
      <a
        href={block.previewUrl}
        download={block.fileName ?? block.label ?? "fayl"}
        className="flex items-center gap-3 rounded-xl bg-gray-100 px-3 py-2.5 transition-colors hover:bg-gray-200"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-[11px] font-black text-white">
          {ext.slice(0, 4)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-gray-900">
            {block.label || block.fileName || "Fayl"}
          </span>
          <span className="block text-xs font-semibold text-gray-400">
            Yuklab olish
          </span>
        </span>
        <Download size={18} className="text-gray-400" />
      </a>
    );
  }

  if (block.type === "live_class" && block.classSessionId) {
    return <LiveClassBlockTile classSessionId={block.classSessionId} />;
  }

  if (block.type === "button") {
    if (!block.buttonUrl) return null;
    return (
      <div className="flex justify-center py-2">
        <a
          href={block.buttonUrl}
          target={block.openInNewTab ? "_blank" : undefined}
          rel={block.openInNewTab ? "noreferrer" : undefined}
          className="rounded-xl px-5 py-2.5 text-sm font-bold"
          style={{
            backgroundColor: block.buttonColor || "#4F46E5",
            color: block.buttonTextColor || "#FFFFFF",
          }}
        >
          {block.label || "O'tish"}
        </a>
      </div>
    );
  }

  if (block.type === "message") {
    const lines = block.messageLines ?? [];
    if (lines.length === 0 || !block.messageSender) return null;
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2">
          <UserAvatar
            name={block.messageSender.name}
            avatarUrl={block.messageSender.avatarUrl}
            className="h-8 w-8 rounded-full text-xs font-bold"
          />
          <span className="text-xs font-bold text-gray-600">{block.messageSender.name}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {[...lines].sort((a, b) => a.orderIndex - b.orderIndex).map((line) => (
            <div key={line.id} className="max-w-[85%] rounded-2xl rounded-tl-sm bg-gray-100 px-3.5 py-2.5 text-sm text-gray-800">
              {line.text}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-400">
      {block.type === "image" ? (
        <ImageIcon size={18} />
      ) : (
        <FileText size={18} />
      )}
      <span>Kontent ochilmadi</span>
    </div>
  );
}
