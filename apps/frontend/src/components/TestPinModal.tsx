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

export function TestPinModal({ testId, testName, onClose, onSaved, onRemoved }: Props) {
  const [loading, setLoading] = useState(true);
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
    apiListCourses().then(setCourses).catch(() => toast.error("Kurslarni yuklab bo'lmadi"));
    apiGetTestPin(testId)
      .then((pin) => {
        if (pin) {
          setHasExistingPin(true);
          setCourseId(pin.courseId);
          setAllGroups(pin.groupIds.length === 0);
          setSelectedGroupIds(pin.groupIds);
          setStartsAt(pin.startsAt.slice(0, 16));
          setEndsAt(pin.endsAt.slice(0, 16));
        }
      })
      .finally(() => setLoading(false));
  }, [testId]);

  useEffect(() => {
    if (!courseId) {
      setGroups([]);
      return;
    }
    apiListGroups(courseId).then(setGroups).catch(() => toast.error("Guruhlarni yuklab bo'lmadi"));
  }, [courseId]);

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
    setSaving(true);
    try {
      await apiUpsertTestPin(testId, {
        courseId,
        groupIds: allGroups ? [] : selectedGroupIds,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      toast.success("Test tayinlandi");
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Saqlab bo'lmadi");
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
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Olib tashlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-800 truncate">{testName} — Guruhga tayinlash</h2>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 rounded-full border border-gray-200 border-t-gray-900 animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Kurs</label>
                <select
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
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Guruhlar</label>
                  <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={allGroups} onChange={(e) => setAllGroups(e.target.checked)} />
                    Barchasi
                  </label>
                  {!allGroups && (
                    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
                      {groups.length === 0 && <p className="text-xs text-gray-400 px-1 py-1">Guruhlar topilmadi</p>}
                      {groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
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
                <label className="mb-1 block text-xs font-semibold text-gray-600">Boshlanish vaqti</label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Tugash vaqti</label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>
          )}
        </div>

        {!loading && (
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
              disabled={saving}
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
