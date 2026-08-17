import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { apiListCourses, type ApiCourse } from "../api/courses";
import { apiListGroups, type ApiGroup } from "../api/groups";
import { apiGetTestPin, apiRemoveTestPin, apiUpsertTestPin } from "../api/tests";

interface Props {
  testId: string;
  testName: string;
  onClose: () => void;
  onSaved: () => void;
  onRemoved: () => void;
}

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object"
    && error !== null
    && "response" in error
  ) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  return fallback;
}

export function TestPinModal({ testId, testName, onClose, onSaved, onRemoved }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasExistingPin, setHasExistingPin] = useState(false);
  const [courses, setCourses] = useState<ApiCourse[]>([]);
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [courseId, setCourseId] = useState("");
  const [allGroups, setAllGroups] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);

    Promise.all([apiListCourses(), apiGetTestPin(testId)])
      .then(([courseRows, pin]) => {
        if (!active) return;
        setCourses(courseRows);
        setHasExistingPin(!!pin);
        if (pin) {
          setCourseId(pin.courseId);
          setAllGroups(pin.groupIds.length === 0);
          setSelectedGroupIds(pin.groupIds);
          setStartsAt(toLocalDateTimeValue(pin.startsAt));
          setEndsAt(toLocalDateTimeValue(pin.endsAt));
        } else {
          setCourseId("");
          setAllGroups(true);
          setSelectedGroupIds([]);
          setStartsAt("");
          setEndsAt("");
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [testId, loadAttempt]);

  useEffect(() => {
    if (!courseId) {
      setGroups([]);
      setGroupsLoading(false);
      return;
    }
    let active = true;
    setGroups([]);
    setGroupsLoading(true);
    apiListGroups(courseId)
      .then((rows) => {
        if (active) setGroups(rows);
      })
      .catch(() => {
        if (active) toast.error("Guruhlarni yuklab bo'lmadi");
      })
      .finally(() => {
        if (active) setGroupsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [courseId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  }

  async function handleSave() {
    if (!courseId || !startsAt || !endsAt) {
      toast.error("Barcha maydonlarni to'ldiring");
      return;
    }
    if (!allGroups && selectedGroupIds.length === 0) {
      toast.error("Kamida bitta guruh tanlang yoki \"Barchasi\"ni belgilang");
      return;
    }
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      toast.error("Sana va vaqtni to'g'ri kiriting");
      return;
    }
    if (endDate <= startDate) {
      toast.error("Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak");
      return;
    }
    setSaving(true);
    try {
      await apiUpsertTestPin(testId, {
        courseId,
        groupIds: allGroups ? [] : selectedGroupIds,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
      });
      toast.success("Test tayinlandi");
      onSaved();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Saqlab bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      await apiRemoveTestPin(testId);
      toast.success("Tayinlash olib tashlandi");
      onRemoved();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Olib tashlab bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-pin-modal-title"
        className="glass-card flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between gap-2 border-b border-black/5 dark:border-white/10 pb-4">
          <h2 id="test-pin-modal-title" className="text-base font-bold text-[var(--text-primary)] tracking-tight truncate">{testName} — Guruhga tayinlash</h2>
          <button onClick={onClose} className="shrink-0 rounded-xl p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer" aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {loading ? (
            <div role="status" className="flex justify-center py-12">
              <div aria-hidden="true" className="w-7 h-7 rounded-full border-2 border-indigo-500/20 border-t-indigo-600 animate-spin" />
              <span className="sr-only">Yuklanmoqda</span>
            </div>
          ) : loadError ? (
            <div role="alert" className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-xs text-[var(--text-muted)] font-medium">Tayinlash ma'lumotlarini yuklab bo'lmadi.</p>
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Qayta urinish
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="test-pin-course" className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Kurs</label>
                <select
                  id="test-pin-course"
                  value={courseId}
                  onChange={(e) => { setCourseId(e.target.value); setSelectedGroupIds([]); }}
                  className="w-full rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                >
                  <option value="">Tanlang</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              {courseId && (
                <div>
                  <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Guruhlar</span>
                  <label htmlFor="test-pin-all-groups" className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                    <input
                      id="test-pin-all-groups"
                      type="checkbox"
                      checked={allGroups}
                      disabled={groupsLoading}
                      onChange={(e) => setAllGroups(e.target.checked)}
                      className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
                    />
                    Barchasi
                  </label>
                  {!allGroups && (
                    <div aria-busy={groupsLoading} className="flex flex-col gap-1.5 rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 p-2.5">
                      {groupsLoading ? (
                        <p role="status" className="text-xs text-[var(--text-muted)] px-1 py-1">Guruhlar yuklanmoqda...</p>
                      ) : groups.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] px-1 py-1">Guruhlar topilmadi</p>
                      ) : null}
                      {groups.map((g) => (
                        <label key={g.id} htmlFor={`test-pin-group-${g.id}`} className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                          <input
                            id={`test-pin-group-${g.id}`}
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
                            disabled={groupsLoading}
                            onChange={() => toggleGroup(g.id)}
                            className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
                          />
                          {g.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="test-pin-starts-at" className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Boshlanish vaqti</label>
                <input
                  id="test-pin-starts-at"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                />
              </div>
              <div>
                <label htmlFor="test-pin-ends-at" className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Tugash vaqti</label>
                <input
                  id="test-pin-ends-at"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                />
              </div>
            </div>
          )}
        </div>

        {!loading && !loadError && (
          <div className="flex gap-2 border-t border-black/5 dark:border-white/10 pt-4">
            {hasExistingPin && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={saving}
                className="flex-1 rounded-xl bg-red-500/10 py-2.5 text-xs font-bold text-red-500 hover:bg-red-500/20 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Olib tashlash
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || groupsLoading}
              className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {hasExistingPin ? "Saqlash" : "Tayinlash"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
