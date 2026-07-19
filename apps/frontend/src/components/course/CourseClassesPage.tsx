import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Radio, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCourseStore } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import {
  apiActiveClassSessions, apiClassHistory, apiClassSession, apiCreateClassSession,
  apiOverrideAttendance,
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

  const handleStart = async () => {
    if (activeId) {
      navigate(`/classroom/host/${activeId}`);
      return;
    }
    setStarting(true);
    try {
      const { id } = await apiCreateClassSession(courseId);
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
              onClick={() => void handleStart()}
              disabled={starting}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
                activeId ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-900 hover:bg-gray-700'
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
            <div className="flex flex-col divide-y divide-gray-100">
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => void openDetail(h.id)}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-2 py-3 text-left hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-800">{fmtDate(h.startedAt)}</span>
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
        onSelectClasses={() => {}}
      />

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-gray-800">Davomat</h2>
                <p className="text-xs text-gray-400">{fmtDate(detail.startedAt)}{detail.pdfName ? ` — ${detail.pdfName}` : ''}</p>
              </div>
              {detail.status === 'ended' && (
                <button
                  type="button"
                  onClick={() => navigate(`/classroom-history/${detail.id}/replay`)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Radio size={14} />
                  Replay ko'rish
                </button>
              )}
              <button type="button" onClick={() => setDetail(null)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
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
                            className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                              a.status === opt.value ? opt.cls : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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
    </div>
  );
}
