import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Download, FileText, Film, Image as ImageIcon,
  Layers3, Loader2, Lock, MessageCircle, Play,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StudentShell } from '../components/student/StudentShell';
import {
  apiGetMyCourseDetail,
  apiGetMyCourses,
  apiMarkLessonComplete,
  type ApiMyCourse,
  type ApiMyCourseDetail,
  type ApiMyLesson,
} from '../api/groups';
import type { ApiContentBlock } from '../api/contentBlocks';
import { HlsVideoPlayer } from '../components/course/HlsVideoPlayer';
import { ImageLightbox } from '../components/student/ImageLightbox';
import { PracticeScreen } from '../components/student/PracticeScreen';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Kutilmoqda',
  partial: 'Qisman to\'langan',
  paid: 'To\'landi',
  debt: 'Qarzdorlik',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-gray-200 text-gray-500',
  partial: 'bg-amber-100 text-amber-600',
  paid: 'bg-green-100 text-green-600',
  debt: 'bg-red-100 text-red-600',
};

function pauseLessonVideos() {
  document.querySelectorAll('video').forEach((video) => {
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
      const isScreenshotCombo = event.metaKey && event.shiftKey && ['3', '4', '5'].includes(key);
      const isDevToolsCombo = (
        event.key === 'F12'
        || (hasModifier && event.shiftKey && ['i', 'j', 'c'].includes(key))
      );
      const isBlockedShortcut = hasModifier && ['p', 's', 'u', 'c'].includes(key);

      if (event.key === 'PrintScreen') {
        event.preventDefault();
        pauseLessonVideos();
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText('').catch(() => undefined);
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

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', pauseLessonVideos);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('copy', prevent);
    document.addEventListener('cut', prevent);
    document.addEventListener('paste', prevent);
    document.addEventListener('dragstart', prevent);
    document.addEventListener('selectstart', prevent);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', pauseLessonVideos);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('copy', prevent);
      document.removeEventListener('cut', prevent);
      document.removeEventListener('paste', prevent);
      document.removeEventListener('dragstart', prevent);
      document.removeEventListener('selectstart', prevent);
    };
  }, [enabled]);
}

export function MyCoursesPage() {
  const [courses, setCourses] = useState<ApiMyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  useEffect(() => {
    apiGetMyCourses()
      .then(setCourses)
      .finally(() => setLoading(false));
  }, []);

  if (selectedCourseId) {
    return <StudentCourseReader courseId={selectedCourseId} onBack={() => setSelectedCourseId(null)} />;
  }

  return (
    <StudentShell>
      <div className="rounded-2xl bg-white p-4 sm:p-5">
        <h1 className="mb-4 text-lg font-bold text-gray-800">Mening kurslarim</h1>

        {loading && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

        {!loading && courses.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali hech qanday kursga qo'shilmagansiz</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {courses.map((c) => (
            <button
              key={`${c.courseId}-${c.groupName}`}
              type="button"
              onClick={() => setSelectedCourseId(c.courseId)}
              className="rounded-2xl bg-gray-50 p-4 text-left transition-colors hover:bg-indigo-50/40"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-gray-800">{c.courseTitle}</p>
                  <p className="text-xs text-gray-400">{c.groupName}</p>
                </div>
                {c.latestPaymentStatus && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[c.latestPaymentStatus]}`}>
                    {STATUS_LABEL[c.latestPaymentStatus]}
                  </span>
                )}
              </div>

              <p className="mb-3 text-xs text-gray-400">
                {c.selectedPlanName ? `Tarif: ${c.selectedPlanName}` : "Tarif hali belgilanmagan"}
              </p>

              {c.hasAccess ? (
                <div className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <BookOpen size={15} /> Darslarga kirish ochiq
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
                  <Lock size={15} /> {c.selectedPlanName ? "To'lov muddati kelgan, lekin to'lanmagan" : "Tarif hali belgilanmagan"}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </StudentShell>
  );
}

function StudentCourseReader({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const navigate = useNavigate();
  const [course, setCourse] = useState<ApiMyCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(0);
  const [mobileLessonsOpen, setMobileLessonsOpen] = useState(false);
  const [showPractice, setShowPractice] = useState(false);

  useLessonAntiCapture(!loading && !error && Boolean(course));

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiGetMyCourseDetail(courseId)
      .then((data) => {
        setCourse(data);
        const firstLesson = data.modules.flatMap((m) => m.lessons)[0];
        setSelectedLessonId(firstLesson?.id ?? null);
        setMaxUnlockedIndex(firstLesson ? 0 : -1);
      })
      .catch((err) => {
        setCourse(null);
        setSelectedLessonId(null);
        setMaxUnlockedIndex(0);
        const message = err?.response?.data?.message;
        setError(Array.isArray(message) ? message[0] : message || "To'lov muddati kelgan, lekin to'lanmagan");
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  const lessons = useMemo(() => course?.modules.flatMap((module) => module.lessons.map((lesson) => ({ module, lesson }))) ?? [], [course]);
  const selected = lessons.find((item) => item.lesson.id === selectedLessonId) ?? lessons[0];
  const selectedIndex = selected ? lessons.findIndex((item) => item.lesson.id === selected.lesson.id) : -1;
  const progressCount = lessons.length > 0 ? Math.min(maxUnlockedIndex + 1, lessons.length) : 0;
  const progressPercent = lessons.length > 0 ? (progressCount / lessons.length) * 100 : 0;

  const renderLessonButton = (moduleIndex: number, lesson: ApiMyLesson, mobile = false) => {
    const globalIndex = lessons.findIndex((item) => item.lesson.id === lesson.id);
    const active = lesson.id === selected?.lesson.id;
    const hasVideo = lesson.blocks.some((block) => block.type === 'video');
    const isDone = globalIndex >= 0 && globalIndex < maxUnlockedIndex;
    const locked = globalIndex > maxUnlockedIndex;

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
                ? 'cursor-not-allowed border-transparent bg-gray-50 text-gray-300 opacity-70'
                : active
                  ? 'border-[var(--color-indigo-500)] bg-white text-[var(--color-indigo-500)]'
                  : 'border-transparent bg-white text-gray-900 hover:border-indigo-200'
            }`
            : `flex w-full items-center gap-2.5 rounded-xl border bg-white p-2.5 text-left transition-colors ${
              locked
                ? 'cursor-not-allowed border-transparent text-gray-300 opacity-70'
                : active
                  ? 'border-[var(--color-indigo-500)] text-[var(--color-indigo-500)]'
                  : 'border-transparent text-gray-900 hover:border-indigo-200'
            }`
        }
      >
        <div className={`${mobile ? 'h-11 w-11 rounded-xl' : 'h-11 w-11 rounded-xl'} relative flex shrink-0 items-center justify-center bg-gray-100 text-gray-300`}>
          {locked ? <Lock size={mobile ? 18 : 18} /> : hasVideo ? <Film size={mobile ? 19 : 19} /> : <BookOpen size={mobile ? 19 : 19} />}
          {hasVideo && !locked && (
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white">
              <Play size={10} fill="currentColor" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`${mobile ? 'text-sm' : 'text-xs'} line-clamp-2 font-bold ${active ? 'text-[var(--color-indigo-500)]' : locked ? 'text-gray-400' : 'text-gray-900'}`}>
            {lesson.title}
          </p>
          <p className={`${mobile ? 'text-xs text-gray-400' : 'text-[11px] text-gray-400'} mt-0.5 font-semibold`}>Modul {moduleIndex + 1}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-gray-400">
          {locked ? <Lock size={mobile ? 18 : 15} /> : isDone ? <CheckCircle2 size={mobile ? 18 : 16} className="text-green-500" /> : <ChevronRight size={mobile ? 18 : 16} />}
        </div>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white">
        <Loader2 className="animate-spin text-[var(--color-indigo-500)]" size={28} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-white p-5">
        <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-500">
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
        <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-500">
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
    <div className="min-h-[100dvh] select-none bg-white text-gray-900" onContextMenu={(e) => e.preventDefault()}>
      <div className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 px-3 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600">
            <ArrowLeft size={21} />
          </button>
          <button
            type="button"
            onClick={() => setMobileLessonsOpen((value) => !value)}
            className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-gray-900"
          >
            <span className="truncate">Darslar Tartibi</span>
            {mobileLessonsOpen ? <ChevronUp size={20} className="text-[var(--color-indigo-500)]" /> : <ChevronDown size={20} className="text-[var(--color-indigo-500)]" />}
          </button>
          <span className="shrink-0 rounded-full bg-[var(--color-indigo-500)] px-2.5 py-1 text-xs font-bold text-white">
            {progressCount} / {lessons.length}
          </span>
        </div>
      </div>

      {mobileLessonsOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-gray-50 px-3 pb-24 pt-3 lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600">
              <ArrowLeft size={21} />
            </button>
            <button type="button" onClick={() => setMobileLessonsOpen(false)} className="flex items-center gap-1.5 text-base font-semibold text-[var(--color-indigo-500)]">
              Darslar Tartibi <ChevronUp size={20} />
            </button>
            <span className="rounded-full bg-[var(--color-indigo-500)] px-2.5 py-1 text-xs font-bold text-white">
              {progressCount} / {lessons.length}
            </span>
          </div>

          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold">Jarayon</span>
              <span className="text-xs font-bold text-gray-500">{progressCount} / {lessons.length}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-[var(--color-indigo-500)] transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="space-y-3">
            {course.modules.map((module, moduleIndex) => (
              <div key={module.id} className="space-y-2">
                <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  <Layers3 size={13} />
                  <span>{module.title || `Modul ${moduleIndex + 1}`}</span>
                </div>
                {module.lessons.map((lesson) => renderLessonButton(moduleIndex, lesson, true))}
              </div>
            ))}
          </div>

          <div className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/95 p-3 backdrop-blur">
            <button type="button" onClick={() => setMobileLessonsOpen(false)} className="h-11 w-full rounded-xl bg-gray-100 text-sm font-semibold text-gray-700">
              Yopish
            </button>
          </div>
        </div>
      )}

      <div className="grid min-h-0 lg:min-h-screen lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="hidden max-w-full overflow-hidden border-b border-gray-200 bg-gray-100/80 p-3 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-600"
          >
            <ArrowLeft size={16} /> Kurslar
          </button>

          <div className="mb-3 rounded-2xl bg-white p-3 sm:mb-4">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-gray-900">Jarayon</span>
              <span className="rounded-full bg-[var(--color-indigo-500)] px-2.5 py-0.5 text-[11px] font-bold text-white">
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
                {module.lessons.map((lesson) => renderLessonButton(moduleIndex, lesson))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden px-4 py-4 sm:px-6 lg:px-10 lg:py-6">
          {selected && showPractice ? (
            <PracticeScreen
              lesson={selected.lesson}
              onBack={() => setShowPractice(false)}
              onStartPractice={(block) => {
                if (block.testSlug) navigate(`/t/${block.testSlug}?practice=1`);
              }}
              onViewSubmission={(block, submissionId) => {
                if (block.testSlug) navigate(`/t/${block.testSlug}/result?sid=${submissionId}&practice=1`);
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
              onOpenPractice={() => setShowPractice(true)}
              onPrev={() => {
                const prev = lessons[selectedIndex - 1];
                if (prev) setSelectedLessonId(prev.lesson.id);
              }}
              onNext={() => {
                const nextIndex = selectedIndex + 1;
                const next = lessons[nextIndex];
                if (next) {
                  setMaxUnlockedIndex((current) => Math.max(current, nextIndex));
                  setSelectedLessonId(next.lesson.id);
                }
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
  onOpenPractice: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const readyBlocks = lesson.blocks.filter((block) => block.type !== 'video' || block.embedUrl || block.processingStatus === 'ready');

  return (
    <article className="mx-auto w-full max-w-3xl overflow-hidden pb-12 text-gray-900">
      <div className="-mx-4 mb-4 bg-white/95 px-4 pb-3 pt-2 backdrop-blur sm:-mx-6 sm:mb-6 sm:px-6 lg:sticky lg:top-0 lg:z-10 lg:-mx-10 lg:px-10">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-gray-400 sm:text-xs">{moduleTitle}</p>
          <h1 className="mt-1.5 text-xl font-black leading-tight text-gray-950 sm:mt-3 sm:text-4xl">{lesson.title}</h1>
        </div>
      </div>

      <button
        type="button"
        className="mb-5 flex w-full items-center justify-between rounded-2xl bg-gray-100 px-3 py-3 text-left sm:mb-6 sm:px-4 lg:rounded-xl"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white sm:h-9 sm:w-9">
            <MessageCircle size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-gray-900">
              {curatorName ? `${curatorName} bilan suhbatlashish` : 'Kurator biriktirilmagan'}
            </span>
            <span className="block truncate text-[11px] font-semibold text-gray-500">
              {curatorName ? 'Istalgan savolni bering' : 'Bu kurs uchun hozircha kurator tanlanmagan'}
            </span>
          </span>
        </span>
        <MessageCircle size={18} className="shrink-0 text-[var(--color-indigo-500)]" />
      </button>

      <div className="space-y-5 sm:space-y-6">
        {readyBlocks.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 py-16 text-center text-gray-400">
            <BookOpen size={30} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm font-semibold">Dars kontenti hozircha tayyor emas</p>
          </div>
        ) : (
          readyBlocks.map((block) => <LessonBlock key={block.id} block={block} />)
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 sm:mt-10 sm:gap-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={lessonNumber <= 1}
          className="rounded-xl bg-gray-100 px-3.5 py-2.5 text-xs font-bold text-[var(--color-indigo-500)] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
        >
          Orqaga
        </button>
        <button
          type="button"
          onClick={async () => {
            await apiMarkLessonComplete(lesson.id);
            if (hasPractice) onOpenPractice();
            else onNext();
          }}
          disabled={!hasPractice && lessonNumber >= totalLessons}
          className="rounded-xl bg-[var(--color-indigo-500)] px-3.5 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-200 sm:px-4"
        >
          {hasPractice ? 'Amaliyot' : 'Keyingi dars'}
        </button>
      </div>
    </article>
  );
}

function LessonBlock({ block }: { block: ApiContentBlock }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (block.type === 'editor') {
    return (
      <>
        <div
          className="lesson-reader-html max-w-full overflow-hidden text-sm leading-7 text-gray-900 sm:text-base [&_*]:max-w-full [&_iframe]:aspect-video [&_iframe]:w-full [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-xl [&_video]:aspect-video [&_video]:w-full"
          dangerouslySetInnerHTML={{ __html: block.html ?? '' }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG') {
              setLightboxSrc((target as HTMLImageElement).src);
            }
          }}
        />
        {lightboxSrc && (
          <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        )}
      </>
    );
  }

  if (block.type === 'video') {
    if (block.embedUrl) {
      return (
        <div className="max-w-full overflow-hidden rounded-2xl bg-black">
          <iframe
            src={block.embedUrl}
            title={block.label ?? block.fileName ?? 'Video'}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    return (
      <div>
        <HlsVideoPlayer blockId={block.id} watermark />
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-0 rounded-full bg-[var(--color-indigo-500)]" />
        </div>
      </div>
    );
  }

  if (block.type === 'image' && block.previewUrl) {
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
            alt={block.label ?? block.fileName ?? ''}
            draggable={false}
            className="max-h-[260px] w-full rounded-2xl object-contain sm:max-h-[420px]"
          />
        </button>
        {block.label && <figcaption className="mt-2 text-xs font-semibold text-gray-400">{block.label}</figcaption>}
        {lightboxOpen && (
          <ImageLightbox
            src={block.previewUrl}
            alt={block.label ?? block.fileName ?? ''}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </figure>
    );
  }

  if (block.type === 'file' && block.previewUrl) {
    const ext = (block.fileName ?? block.label ?? 'FILE').split('.').pop()?.toUpperCase() ?? 'FILE';
    return (
      <a
        href={block.previewUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-xl bg-gray-100 px-3 py-2.5 transition-colors hover:bg-gray-200"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-indigo-500)] text-[11px] font-black text-white">
          {ext.slice(0, 4)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-gray-900">{block.label || block.fileName || 'Fayl'}</span>
          <span className="block text-xs font-semibold text-gray-400">Yuklab olish</span>
        </span>
        <Download size={18} className="text-gray-400" />
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-400">
      {block.type === 'image' ? <ImageIcon size={18} /> : <FileText size={18} />}
      <span>Kontent ochilmadi</span>
    </div>
  );
}
