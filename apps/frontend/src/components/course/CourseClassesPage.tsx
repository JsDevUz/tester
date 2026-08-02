import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, PenTool, Radio, SkipForward, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCourseStore } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import {
  apiActiveClassSessions, apiClassHistory, apiClassSession, apiCreateClassSession,
  apiCreateClassSessionFromSnapshot, apiDeleteClassSession, apiOverrideAttendance,
  type ClassHistoryItem, type ClassSessionDetail,
} from '../../api/classroom';

interface CourseClassesPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectSettings: () => void;
  onSelectLaunch: () => void;
  onSelectGroups: () => void;
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

export function CourseClassesPage({ courseId, onBackToList, onSelectContent, onSelectSettings, onSelectLaunch, onSelectGroups }: CourseClassesPageProps) {
  const navigate = useNavigate();
  const course = useCourseStore((s) => s.courses.find((c) => c.id === courseId));
  const [history, setHistory] = useState<ClassHistoryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [detail, setDetail] = useState<ClassSessionDetail | null>(null);
  const [resumeTarget, setResumeTarget] = useState<ClassSessionDetail | null>(null);
  const [resumeTitle, setResumeTitle] = useState("");
  const [resuming, setResuming] = useState(false);

  const handleResumeFromSnapshot = async () => {
    if (!resumeTarget) return;
    setResuming(true);
    try {
      const { id } = await apiCreateClassSessionFromSnapshot(resumeTarget.id, resumeTitle);
      navigate(`/classroom/host/${id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Darsni davom ettirib bo'lmadi");
      setResuming(false);
    }
  };

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
    <div className="flex flex-col gap-3 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title, onClick: onSelectContent },
            { label: 'Jonli darslar' },
          ]}
        />

        <div className="rounded-2xl bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Jonli darslar</p>
            <button
              type="button"
              onClick={handleStartClick}
              disabled={starting}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors ${activeId ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-900 hover:bg-gray-700'
                } disabled:opacity-50`}
            >
              <Radio size={16} className={activeId ? 'animate-pulse' : ''} />
              {activeId ? 'Darsga qaytish' : starting ? 'Ochilmoqda...' : 'Jonli dars boshlash'}
            </button>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Hozircha darslar o'tkazilmagan</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100 max-h-[calc(100vh-230px)] overflow-y-auto pr-1">
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => void openDetail(h.id)}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 text-left hover:bg-gray-50"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900">{h.title ?? h.pdfName ?? "Jonli dars"}</span>
                    <span className="text-xs text-gray-400">{fmtDate(h.startedAt)}</span>
                  </div>
                  {h.status === 'active' ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">jonli</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-gray-400"><Clock size={12} />{fmtDuration(h.startedAt, h.endedAt)}</span>
                  )}
                  <span className="flex-1" />
                  <span className="text-xs font-medium text-emerald-600">{h.presentCount} keldi</span>
                  <span className="text-xs font-medium text-amber-600">{h.lateCount} kech</span>
                  <span className="text-xs font-medium text-gray-400">{h.absentCount} yo'q</span>
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
      />

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-gray-800">{detail.title ?? "Jonli dars"} — Davomat</h2>
                  <p className="text-xs text-gray-400">{fmtDate(detail.startedAt)}{detail.pdfName ? ` — ${detail.pdfName}` : ''}</p>
                </div>
                <button type="button" onClick={() => setDetail(null)} className="shrink-0 rounded-xl p-2 text-gray-400 hover:bg-gray-100">
                  <X size={18} />
                </button>
              </div>
              {detail.status === 'ended' && (
                <div className="flex flex-wrap items-center gap-2">
                  {detail.hasBoardSnapshot && (
                    <button
                      type="button"
                      onClick={() => navigate(`/classroom-history/${detail.id}/replay?view=board`)}
                      title="Oxirgi chizma holati"
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <PenTool size={14} />
                      Oxirgi chizma
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setResumeTarget(detail);
                      setResumeTitle(detail.title ?? "");
                    }}
                    title="Davom ettirish"
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    <SkipForward size={14} />
                    Davom ettirish
                  </button>
                  {(detail.recordingMode === 'full' || detail.recordingMode === 'boardAudio') && (
                    <button
                      type="button"
                      onClick={() => navigate(`/classroom-history/${detail.id}/replay`)}
                      title="To'liq (ovozli) ko'rish"
                      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      <Radio size={14} />
                      To'liq ko'rish
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(detail.id)}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 size={14} />
                    O'chirish
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {detail.attendance.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">O'quvchilar yo'q</p>
              ) : (
                <div className="flex flex-col divide-y divide-gray-100">
                  {detail.attendance.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {a.name}
                          {a.overridden && <span className="ml-1 text-[10px] text-gray-400">(qo'lda)</span>}
                        </p>
                        <p className="text-xs text-gray-400">
                          {a.firstJoinedAt ? `kirdi ${fmtDate(a.firstJoinedAt)}` : 'kirmagan'}
                          {a.totalSeconds > 0 && ` · ${Math.round(a.totalSeconds / 60)} daqiqa`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => void handleOverride(a.id, opt.value)}
                            className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${a.status === opt.value ? opt.cls : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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
          </div>
        </div>
      )}
      {resumeTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onPointerDown={(event) => { if (event.target === event.currentTarget && !resuming) setResumeTarget(null); }}
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Darsni davom ettirish">
            <h3 className="text-base font-semibold text-gray-900">Jonli darsni davom ettirish</h3>
            <p className="text-xs text-gray-600">
              Ushbu darsning oxirgi taxta holati (sahifalar, chizmalar) bilan yangi jonli dars boshlanadi.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Dars nomi
              </label>
              <input
                type="text"
                value={resumeTitle}
                onChange={(e) => setResumeTitle(e.target.value)}
                placeholder="Dars nomini kiriting"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResumeTarget(null)}
                disabled={resuming}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void handleResumeFromSnapshot()}
                disabled={resuming}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {resuming ? "Boshlanmoqda..." : "Darsni boshlash"}
              </button>
            </div>
          </div>
        </div>
      )}
      {startModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onPointerDown={(event) => { if (event.target === event.currentTarget && !starting) setStartModalOpen(false); }}
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Jonli dars boshlash">
            <h3 className="text-base font-semibold text-gray-900">Jonli dars boshlash</h3>
            <p className="text-xs text-gray-600">
              Ushbu kurs o'quvchilari uchun yangi jonli dars xonasi ochiladi.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Dars nomi (ixtiyoriy)
              </label>
              <input
                type="text"
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
                placeholder="Masalan: 1-dars. Kirish"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStartModalOpen(false)}
                disabled={starting}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmStart()}
                disabled={starting}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {starting ? "Boshlanmoqda..." : "Darsni boshlash"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
