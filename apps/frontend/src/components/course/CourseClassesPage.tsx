import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Radio, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCourseStore } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import {
  apiActiveClassSessions, apiClassHistory, apiClassSession, apiCreateClassSession,
  apiDeleteClassSession, apiOverrideAttendance,
  type ClassHistoryItem, type ClassSessionDetail,
} from '../../api/classroom';

interface CourseClassesPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectSettings: () => void;
  onSelectLaunch: () => void;
  onSelectGroups: () => void;
  onSelectChallenges: () => void;
}

const STATUS_OPTIONS: Array<{ value: 'present' | 'late' | 'absent'; label: string; cls: string }> = [
  { value: 'present', label: "keldi", cls: 'bg-emerald-600 text-white' },
  { value: 'late', label: 'kech', cls: 'bg-amber-500 text-white' },
  { value: 'absent', label: "yo'q", cls: 'bg-gray-400 text-white' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '—';
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return `${mins} daqiqa`;
}

export function CourseClassesPage({ courseId, onBackToList, onSelectContent, onSelectSettings, onSelectLaunch, onSelectGroups, onSelectChallenges }: CourseClassesPageProps) {
  const navigate = useNavigate();
  const loadCourseDetails = useCourseStore((s) => s.loadCourseDetails);
  const course = useCourseStore((s) => s.courses.find((c) => c.id === courseId));

  useEffect(() => {
    if (courseId) void loadCourseDetails(courseId);
  }, [courseId, loadCourseDetails]);
  const [history, setHistory] = useState<ClassHistoryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [detail, setDetail] = useState<ClassSessionDetail | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [h, active] = await Promise.all([apiClassHistory(courseId), apiActiveClassSessions()]);
      setHistory(h);
      setActiveId(active.find((s) => s.courseId === courseId)?.id ?? null);
    } catch {
      toast.error("Darslar tarixini yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { void reload(); }, [reload]);

  if (!course) return null;

  const [startModalOpen, setStartModalOpen] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState("");

  const handleStartClick = () => {
    if (activeId) {
      navigate(`/classroom/host/${activeId}`);
      return;
    }
    setNewLessonTitle("");
    setStartModalOpen(true);
  };

  const handleConfirmStart = async () => {
    setStarting(true);
    try {
      const { id } = await apiCreateClassSession(courseId, newLessonTitle);
      setStartModalOpen(false);
      navigate(`/classroom/host/${id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Darsni boshlab bo'lmadi");
      void reload();
    } finally {
      setStarting(false);
    }
  };

  const openDetail = async (sessionId: string) => {
    try {
      setDetail(await apiClassSession(sessionId));
    } catch {
      toast.error("Davomatni yuklab bo'lmadi");
    }
  };

  const handleOverride = async (recordId: string, status: 'present' | 'late' | 'absent') => {
    if (!detail) return;
    try {
      await apiOverrideAttendance(recordId, status);
      setDetail({
        ...detail,
        attendance: detail.attendance.map((a) => (a.id === recordId ? { ...a, status, overridden: true } : a)),
      });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "O'zgartirib bo'lmadi");
    }
  };

  const handleDelete = async (sessionId: string) => {
    const confirmed = window.confirm(
      "Bu darsni o'chirmoqchimisiz? Chizma tarixi va audio yozuv butunlay yo'qoladi, qaytarib bo'lmaydi.",
    );
    if (!confirmed) return;
    try {
      await apiDeleteClassSession(sessionId);
      setDetail(null);
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Darsni o'chirib bo'lmadi");
    }
  };

  return (
    <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
      <div className="flex min-h-full flex-col gap-3">
        <div className="px-1 py-1">
          <Breadcrumb
            items={[
              { label: 'Kurslar', onClick: onBackToList },
              { label: course.title, onClick: onSelectContent },
              { label: 'Jonli darslar' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Jonli darslar</h2>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">O'tkazilgan darslar tarixi va davomat hisoboti</p>
                </div>
                <button
                  type="button"
                  onClick={handleStartClick}
                  disabled={starting}
                  className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer ${
                    activeId ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  } disabled:opacity-50`}
                >
                  <Radio size={15} className={activeId ? 'animate-pulse' : ''} />
                  {activeId ? 'Darsga qaytish' : starting ? 'Ochilmoqda...' : 'Jonli dars boshlash'}
                </button>
              </div>

              {loading ? (
                <p className="py-12 text-center text-xs font-semibold text-[var(--text-muted)]">Yuklanmoqda...</p>
              ) : history.length === 0 ? (
                <p className="py-12 text-center text-xs font-semibold text-[var(--text-muted)]">Hozircha darslar o'tkazilmagan</p>
              ) : (
                <div className="flex flex-col gap-2 max-h-[calc(100vh-230px)] overflow-y-auto pr-1">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => void openDetail(h.id)}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-[var(--card-bg)] px-4 py-3 text-left transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{h.title ?? h.pdfName ?? "Jonli dars"}</span>
                        <span className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">{fmtDate(h.startedAt)}</span>
                      </div>
                      {h.status === 'active' ? (
                        <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-500">jonli</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)]"><Clock size={12} />{fmtDuration(h.startedAt, h.endedAt)}</span>
                      )}
                      <span className="flex-1" />
                      <span className="text-xs font-bold text-emerald-500">{h.presentCount} keldi</span>
                      <span className="text-xs font-bold text-amber-500">{h.lateCount} kech</span>
                      <span className="text-xs font-bold text-[var(--text-muted)]">{h.absentCount} yo'q</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <CourseSidePanel
            onBackToList={onBackToList}
            activeFullTab="classes"
            onSelectContent={onSelectContent}
            onSelectSettings={onSelectSettings}
            onSelectLaunch={onSelectLaunch}
            onSelectGroups={onSelectGroups}
            onSelectClasses={() => { }}
            onSelectChallenges={onSelectChallenges}
          />
        </div>

        {detail && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs"
            onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}
          >
            <div className="glass-panel flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl text-[var(--text-primary)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                    {detail.title ?? detail.pdfName ?? "Jonli dars"}
                  </h2>
                  <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                    {fmtDate(detail.startedAt)} • {fmtDuration(detail.startedAt, detail.endedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Davomat ({detail.attendance.length} nafar)
                </p>
                {detail.attendance.length === 0 ? (
                  <p className="py-6 text-center text-xs font-medium text-[var(--text-muted)]">O'quvchilar qatnashmadi</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {detail.attendance.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-[var(--card-bg)] px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-[var(--text-primary)]">
                            {a.name}
                            {a.overridden && <span className="ml-1 text-[10px] text-[var(--text-muted)] font-normal">(qo'lda)</span>}
                          </p>
                          <p className="text-[10px] font-medium text-[var(--text-muted)]">
                            {a.firstJoinedAt ? `kirdi ${fmtDate(a.firstJoinedAt)}` : 'kirmagan'}
                            {a.totalSeconds > 0 && ` · ${Math.round(a.totalSeconds / 60)} daq`}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {STATUS_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => void handleOverride(a.id, opt.value)}
                              className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                                a.status === opt.value
                                  ? opt.cls
                                  : 'bg-[var(--surface-bg)] text-[var(--text-muted)] hover:bg-[var(--card-hover)]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[var(--glass-border)] pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDelete(detail.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 cursor-pointer"
                  >
                    <Trash2 size={14} /> Tarixdan o'chirish
                  </button>
                  {detail.status === 'ended' && (detail.recordingMode === 'full' || detail.recordingMode === 'boardAudio') && (
                    <button
                      type="button"
                      onClick={() => navigate(`/classroom-history/${detail.id}/replay`)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600/10 px-3 py-2 text-xs font-bold text-indigo-500 hover:bg-indigo-600/20 cursor-pointer"
                    >
                      <Radio size={14} /> To'liq ko'rish
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 cursor-pointer"
                >
                  Yopish
                </button>
              </div>
            </div>
          </div>
        )}

        {startModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs"
            onClick={(e) => { if (e.target === e.currentTarget && !starting) setStartModalOpen(false); }}
          >
            <div className="glass-panel flex w-full max-w-md flex-col gap-4 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl text-[var(--text-primary)]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Jonli dars boshlash</h2>
                <button
                  type="button"
                  onClick={() => setStartModalOpen(false)}
                  disabled={starting}
                  className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">
                  Dars nomi (ixtiyoriy)
                </label>
                <input
                  type="text"
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  placeholder="Masalan: 1-dars. Kirish"
                  className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStartModalOpen(false)}
                  disabled={starting}
                  className="rounded-xl bg-[var(--card-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] disabled:opacity-50 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmStart()}
                  disabled={starting}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {starting ? "Boshlanmoqda..." : "Darsni boshlash"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
