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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-pin-modal-title"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <h2 id="test-pin-modal-title" className="text-sm font-semibold text-gray-800 truncate">{testName} — Guruhga tayinlash</h2>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div role="status" className="flex justify-center py-12">
              <div aria-hidden="true" className="w-7 h-7 rounded-full border border-gray-200 border-t-gray-900 animate-spin" />
              <span className="sr-only">Yuklanmoqda</span>
            </div>
          ) : loadError ? (
            <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-gray-600">Tayinlash ma'lumotlarini yuklab bo'lmadi.</p>
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
              >
                Qayta urinish
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="test-pin-course" className="mb-1 block text-xs font-semibold text-gray-600">Kurs</label>
                <select
                  id="test-pin-course"
                  value={courseId}
                  onChange={(e) => { setCourseId(e.target.value); setSelectedGroupIds([]); }}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
                >
                  <option value="">Tanlang</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              {courseId && (
                <div>
                  <span className="mb-1 block text-xs font-semibold text-gray-600">Guruhlar</span>
                  <label htmlFor="test-pin-all-groups" className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                    <input
                      id="test-pin-all-groups"
                      type="checkbox"
                      checked={allGroups}
                      disabled={groupsLoading}
                      onChange={(e) => setAllGroups(e.target.checked)}
                    />
                    Barchasi
                  </label>
                  {!allGroups && (
                    <div aria-busy={groupsLoading} className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
                      {groupsLoading ? (
                        <p role="status" className="text-xs text-gray-400 px-1 py-1">Guruhlar yuklanmoqda...</p>
                      ) : groups.length === 0 ? (
                        <p className="text-xs text-gray-400 px-1 py-1">Guruhlar topilmadi</p>
                      ) : null}
                      {groups.map((g) => (
                        <label key={g.id} htmlFor={`test-pin-group-${g.id}`} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            id={`test-pin-group-${g.id}`}
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
                            disabled={groupsLoading}
                            onChange={() => toggleGroup(g.id)}
                          />
                          {g.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="test-pin-starts-at" className="mb-1 block text-xs font-semibold text-gray-600">Boshlanish vaqti</label>
                <input
                  id="test-pin-starts-at"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label htmlFor="test-pin-ends-at" className="mb-1 block text-xs font-semibold text-gray-600">Tugash vaqti</label>
                <input
                  id="test-pin-ends-at"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>
          )}
        </div>

        {!loading && !loadError && (
          <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
            {hasExistingPin && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={saving}
                className="flex-1 rounded-lg border border-red-200 py-2 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                Olib tashlash
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || groupsLoading}
              className="flex-1 rounded-lg bg-indigo-500 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              {hasExistingPin ? "Saqlash" : "Tayinlash"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
