import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, MoreVertical, Star, UserRound, X } from 'lucide-react';
import { apiListCourses, type ApiCourse } from '../../api/courses';
import { apiListGroups, apiEnrollStudent, apiUpdateGroupMember, type ApiGroup } from '../../api/groups';
import { apiListEnrollments, type ApiSchoolEnrollment } from '../../api/school';
import { apiListLaunches, type ApiPricingPlan } from '../../api/launches';
import { useAuthStore } from '../../stores/authStore';

interface StudentProfileModalProps {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  onClose: () => void;
  onEnrolled: () => void;
}

const AVATAR_PALETTES = [
  'bg-gray-200 text-gray-700',
  'bg-amber-100 text-amber-600',
  'bg-teal-100 text-teal-600',
  'bg-rose-100 text-rose-600',
  'bg-violet-100 text-violet-600',
  'bg-cyan-100 text-cyan-600',
];

function paletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function progressColor(pct: number) {
  if (pct >= 70) return 'text-green-500';
  if (pct >= 30) return 'text-amber-500';
  return 'text-gray-400';
}

export function StudentProfileModal({ studentId, studentName, studentPhone, onClose, onEnrolled }: StudentProfileModalProps) {
  const admin = useAuthStore((s) => s.admin);
  const canManageCourses = admin?.role === 'teacher' || admin?.role === 'super';
  const [enrollments, setEnrollments] = useState<ApiSchoolEnrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [enrollFlowOpen, setEnrollFlowOpen] = useState(false);

  const [courses, setCourses] = useState<ApiCourse[]>([]);
  const [courseId, setCourseId] = useState('');
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [plans, setPlans] = useState<ApiPricingPlan[]>([]);
  const [planId, setPlanId] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function refreshEnrollments() {
    setLoadingEnrollments(true);
    return apiListEnrollments()
      .then((rows) => setEnrollments(rows.filter((r) => r.studentId === studentId)))
      .finally(() => setLoadingEnrollments(false));
  }

  useEffect(() => {
    void refreshEnrollments();
  }, [studentId]);

  useEffect(() => {
    if (!enrollFlowOpen) return;
    void apiListCourses().then(setCourses);
  }, [enrollFlowOpen]);

  useEffect(() => {
    setGroupId('');
    setGroups([]);
    if (!courseId) return;
    setLoadingGroups(true);
    void apiListGroups(courseId).then(setGroups).finally(() => setLoadingGroups(false));
  }, [courseId]);

  useEffect(() => {
    setPlanId('');
    setPlans([]);
    if (!courseId || !groupId) return;
    setLoadingPlans(true);
    void apiListLaunches(courseId)
      .then((launches) => setPlans(launches.flatMap((l) => l.plans).filter((p) => p.groupId === groupId)))
      .finally(() => setLoadingPlans(false));
  }, [courseId, groupId]);

  const totalStars = useMemo(
    () => enrollments.reduce((sum, e) => sum + e.starsEarned, 0),
    [enrollments],
  );
  const totalStarsMax = useMemo(
    () => enrollments.reduce((sum, e) => sum + e.starsMax, 0),
    [enrollments],
  );
  const enrolledCourseIds = useMemo(
    () => new Set(enrollments.map((e) => e.courseId)),
    [enrollments],
  );
  const availableCourses = useMemo(
    () => courses.filter((course) => !enrolledCourseIds.has(course.id)),
    [courses, enrolledCourseIds],
  );

  const canSave = Boolean(groupId);

  useEffect(() => {
    if (courseId && enrolledCourseIds.has(courseId)) {
      setCourseId('');
      setGroupId('');
      setPlanId('');
    }
  }, [courseId, enrolledCourseIds]);

  async function handleEnroll() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (enrolledCourseIds.has(courseId)) {
        throw new Error("Bu o'quvchi bu kursga allaqachon qo'shilgan.");
      }
      const member = await apiEnrollStudent(groupId, studentId);
      if (planId) {
        await apiUpdateGroupMember(groupId, member.id, { selectedPlanId: planId });
      }
      setEnrollFlowOpen(false);
      setCourseId('');
      setGroupId('');
      setPlanId('');
      await refreshEnrollments();
      onEnrolled();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message ?? err?.message ?? "Xato yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setSaving(false);
    }
  }

  function closeEnrollFlow() {
    setEnrollFlowOpen(false);
    setCourseId('');
    setGroupId('');
    setPlanId('');
    setSaveError(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-white sm:max-w-lg sm:rounded-3xl">
        {/* Profile header */}
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold ${paletteFor(studentId)}`}
            >
              {initials(studentName)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900">{studentName}</h2>
              <p className="truncate text-xs text-gray-400">{studentPhone ?? '—'}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {canManageCourses && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActionsOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Harakatlar"
              >
                <MoreVertical size={18} />
              </button>
              {actionsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
                  <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-2xl bg-white py-1.5 shadow-lg ring-1 ring-black/5">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        setEnrollFlowOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <GraduationCap size={16} className="text-gray-600" />
                      Kursga qo'shish
                    </button>
                  </div>
                </>
              )}
            </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Yopish"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {totalStarsMax > 0 && (
          <div className="mx-6 mb-4 flex items-center gap-2 rounded-2xl bg-amber-50 px-3.5 py-2.5">
            <Star size={15} fill="currentColor" className="text-amber-400" />
            <span className="text-sm font-bold text-amber-600">{totalStars} / {totalStarsMax}</span>
            <span className="text-xs font-medium text-amber-500/80">jami yulduz</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Ta'lim</p>
          {loadingEnrollments ? (
            <p className="py-6 text-center text-sm text-gray-400">Yuklanmoqda...</p>
          ) : enrollments.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 py-10 text-center text-gray-400">
              <UserRound size={26} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">Hali hech qanday kursga yozilmagan</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {enrollments.map((e) => (
                <div key={`${e.courseId}-${e.groupName}`} className="rounded-2xl bg-gray-50 px-3.5 py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-gray-800">{e.courseTitle}</p>
                    <span className={`shrink-0 text-xs font-bold ${progressColor(e.progressPercent)}`}>
                      {e.progressPercent}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{e.groupName} • {e.lessonsCompleted}/{e.lessonsTotal} dars</span>
                    {e.starsMax > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-amber-500">
                        <Star size={11} fill="currentColor" /> {e.starsEarned}/{e.starsMax}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {enrollFlowOpen && (
        <EnrollStudentModal
          courseId={courseId}
          groupId={groupId}
          planId={planId}
          availableCourses={availableCourses}
          groups={groups}
          plans={plans}
          loadingGroups={loadingGroups}
          loadingPlans={loadingPlans}
          saving={saving}
          saveError={saveError}
          canSave={canSave}
          onCourseChange={setCourseId}
          onGroupChange={setGroupId}
          onPlanChange={setPlanId}
          onConfirm={handleEnroll}
          onClose={closeEnrollFlow}
        />
      )}
    </div>
  );
}

function EnrollStudentModal({
  courseId,
  groupId,
  planId,
  availableCourses,
  groups,
  plans,
  loadingGroups,
  loadingPlans,
  saving,
  saveError,
  canSave,
  onCourseChange,
  onGroupChange,
  onPlanChange,
  onConfirm,
  onClose,
}: {
  courseId: string;
  groupId: string;
  planId: string;
  availableCourses: ApiCourse[];
  groups: ApiGroup[];
  plans: ApiPricingPlan[];
  loadingGroups: boolean;
  loadingPlans: boolean;
  saving: boolean;
  saveError: string | null;
  canSave: boolean;
  onCourseChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onPlanChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/20 sm:items-center"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-sm sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-900">Kursga qo'shish</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Yopish"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <SelectRow
            label="Kurs"
            value={courseId}
            onChange={onCourseChange}
            placeholder={availableCourses.length > 0 ? 'Kursni tanlang...' : "Qo'shilmagan kurs qolmagan"}
            options={availableCourses.map((c) => ({ value: c.id, label: c.title }))}
            disabled={availableCourses.length === 0}
          />
          <SelectRow
            label="Guruh"
            value={groupId}
            onChange={onGroupChange}
            placeholder={loadingGroups ? 'Yuklanmoqda...' : 'Guruhni tanlang...'}
            options={groups.map((g) => ({ value: g.id, label: g.name }))}
            disabled={!courseId || loadingGroups}
          />
          <SelectRow
            label="Tarif (ixtiyoriy)"
            value={planId}
            onChange={onPlanChange}
            placeholder={loadingPlans ? 'Yuklanmoqda...' : 'Tarifsiz'}
            options={plans.map((p) => ({ value: p.id, label: `${p.name} — ${p.price.toLocaleString('uz-UZ')} so'm` }))}
            disabled={!groupId || loadingPlans}
          />

          {saveError && <p className="text-xs font-semibold text-red-500">{saveError}</p>}

          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={!canSave || saving}
            className="mt-1 w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Biriktirilmoqda...' : 'Biriktirish'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  placeholder,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full appearance-none rounded-xl bg-white px-3.5 py-2.5 pr-9 text-sm text-gray-700 outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </label>
  );
}
