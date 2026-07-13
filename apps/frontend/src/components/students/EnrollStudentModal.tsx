import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiListCourses, type ApiCourse } from '../../api/courses';
import { apiListGroups, apiEnrollStudent, apiUpdateGroupMember, type ApiGroup } from '../../api/groups';
import { apiListLaunches, type ApiPricingPlan } from '../../api/launches';

interface EnrollStudentModalProps {
  studentId: string;
  studentName: string;
  onClose: () => void;
  onEnrolled: () => void;
}

export function EnrollStudentModal({ studentId, studentName, onClose, onEnrolled }: EnrollStudentModalProps) {
  const [courses, setCourses] = useState<ApiCourse[]>([]);
  const [courseId, setCourseId] = useState('');
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [plans, setPlans] = useState<ApiPricingPlan[]>([]);
  const [planId, setPlanId] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiListCourses().then(setCourses);
  }, []);

  useEffect(() => {
    setGroupId('');
    setGroups([]);
    if (!courseId) return;
    setLoadingGroups(true);
    void apiListGroups(courseId)
      .then(setGroups)
      .finally(() => setLoadingGroups(false));
  }, [courseId]);

  useEffect(() => {
    setPlanId('');
    setPlans([]);
    if (!courseId || !groupId) return;
    setLoadingPlans(true);
    void apiListLaunches(courseId)
      .then((launches) => {
        const groupPlans = launches.flatMap((l) => l.plans).filter((p) => p.groupId === groupId);
        setPlans(groupPlans);
      })
      .finally(() => setLoadingPlans(false));
  }, [courseId, groupId]);

  const canSave = Boolean(groupId);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const member = await apiEnrollStudent(groupId, studentId);
      if (planId) {
        await apiUpdateGroupMember(groupId, member.id, { selectedPlanId: planId });
      }
      onEnrolled();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Xato yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-800">Guruhga biriktirish</h2>
            <p className="truncate text-xs text-gray-400">{studentName}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-6 pb-6 pt-3">
          <label>
            <span className="mb-1.5 block text-sm font-medium text-gray-500">Kurs</span>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none"
            >
              <option value="">Kursni tanlang...</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-gray-500">Guruh</span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={!courseId || loadingGroups}
              className="w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{loadingGroups ? 'Yuklanmoqda...' : 'Guruhni tanlang...'}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            {courseId && !loadingGroups && groups.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">Bu kursda hali guruh yo'q</p>
            )}
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-gray-500">Tarif (ixtiyoriy)</span>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              disabled={!groupId || loadingPlans}
              className="w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{loadingPlans ? 'Yuklanmoqda...' : 'Tarifsiz'}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.price.toLocaleString('uz-UZ')} so'm</option>
              ))}
            </select>
          </label>

          {error && <p className="text-sm font-semibold text-red-500">{error}</p>}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
            className="mt-2 w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Biriktirilmoqda...' : 'Biriktirish'}
          </button>
        </div>
      </div>
    </div>
  );
}
