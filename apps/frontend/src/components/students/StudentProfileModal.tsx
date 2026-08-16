import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, GraduationCap, KeyRound, MoreVertical, Pencil, Star, UserRound, UserX, X } from 'lucide-react';
import { apiListCourses, type ApiCourse } from '../../api/courses';
import { apiListGroups, apiEnrollStudent, apiUpdateGroupMember, type ApiGroup } from '../../api/groups';
import { apiListEnrollments, apiRemoveStudent, apiUpdateStudentName, apiUpdateStudentPassword, type ApiSchoolEnrollment } from '../../api/school';
import { apiListLaunches, type ApiPricingPlan } from '../../api/launches';
import { useAuthStore } from '../../stores/authStore';
import { UserAvatar } from '../UserAvatar';

interface StudentProfileModalProps {
  studentId: string;
  studentName: string;
  studentTelegramName: string | null;
  studentPhone: string | null;
  studentAvatarUrl: string | null;
  onClose: () => void;
  onEnrolled: () => void;
  onNameUpdated: (name: string) => void;
  onRemoved: () => void;
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

function progressColor(pct: number) {
  if (pct >= 70) return 'text-green-500';
  if (pct >= 30) return 'text-amber-500';
  return 'text-gray-400';
}

export function StudentProfileModal({ studentId, studentName, studentTelegramName, studentPhone, studentAvatarUrl, onClose, onEnrolled, onNameUpdated, onRemoved }: StudentProfileModalProps) {
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
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(studentName);
  const [savingName, setSavingName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  function refreshEnrollments() {
    setLoadingEnrollments(true);
    return apiListEnrollments(100, 0)
      .then((page) => setEnrollments(page.items.filter((r) => r.studentId === studentId)))
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
    let cancelled = false;
    setLoadingGroups(true);
    void apiListGroups(courseId)
      .then((rows) => {
        if (!cancelled) setGroups(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingGroups(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    setPlanId('');
    setPlans([]);
    if (!courseId || !groupId) return;
    let cancelled = false;
    setLoadingPlans(true);
    void apiListLaunches(courseId)
      .then((launches) => {
        if (!cancelled) {
          setPlans(launches.flatMap((l) => l.plans).filter((p) => p.groupId === groupId));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPlans(false);
      });
    return () => {
      cancelled = true;
    };
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

  async function handleSaveName() {
    const trimmedName = nameDraft.trim();
    if (!trimmedName || savingName) return;
    setSavingName(true);
    try {
      const updated = await apiUpdateStudentName(studentId, trimmedName);
      onNameUpdated(updated.name);
      setEditingName(false);
    } catch (error: any) {
      setSaveError(error?.response?.data?.message ?? "Ismni yangilab bo'lmadi.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSavePassword() {
    const trimmedPassword = passwordDraft.trim();
    if (trimmedPassword.length < 8 || savingPassword) return;
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await apiUpdateStudentPassword(studentId, trimmedPassword);
      setEditingPassword(false);
      setPasswordDraft('');
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (error: any) {
      setPasswordError(error?.response?.data?.message ?? "Parolni yangilab bo'lmadi.");
    } finally {
      setSavingPassword(false);
    }
  }

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

  async function handleRemoveStudent() {
    if (removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await apiRemoveStudent(studentId);
      onRemoved();
      onClose();
    } catch (error: any) {
      setRemoveError(error?.response?.data?.message ?? "O'quvchini chetlashtirib bo'lmadi.");
      setRemoving(false);
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
        <div className="flex items-start justify-between gap-2 px-6 pb-4 pt-6">
          <div className="flex min-w-0 items-center gap-2">
            <UserAvatar name={studentName} avatarUrl={studentAvatarUrl} className={`h-14 w-14 rounded-full text-lg font-bold ${paletteFor(studentId)}`} />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900">{studentName}</h2>
              {studentTelegramName && (
                <p className="truncate text-xs font-medium text-indigo-500">tg: {studentTelegramName}</p>
              )}
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
                      <button
                        type="button"
                        onClick={() => { setActionsOpen(false); setNameDraft(studentName); setEditingName(true); setSaveError(null); }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <Pencil size={16} className="text-gray-600" />
                        Ismni tahrirlash
                      </button>
                      <button
                        type="button"
                        onClick={() => { setActionsOpen(false); setPasswordDraft(''); setEditingPassword(true); setPasswordError(null); }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <KeyRound size={16} className="text-gray-600" />
                        Parolni o'zgartirish
                      </button>
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        type="button"
                        onClick={() => { setActionsOpen(false); setRemoveError(null); setRemoveConfirmOpen(true); }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                      >
                        <UserX size={16} />
                        Chetlashtirish
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

        {editingName && (
          <div className="mx-6 mb-4 rounded-2xl bg-gray-50 p-3">
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">O'quvchi ismi</label>
            <div className="flex gap-2">
              <input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={120} className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              <button type="button" onClick={() => void handleSaveName()} disabled={savingName || !nameDraft.trim()} className="inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Check size={14} /> Saqlash</button>
              <button type="button" onClick={() => setEditingName(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-200">Bekor</button>
            </div>
            {saveError && <p className="mt-2 text-xs text-red-500">{saveError}</p>}
          </div>
        )}

        {editingPassword && (
          <div className="mx-6 mb-4 rounded-2xl bg-gray-50 p-3">
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Yangi parol (kamida 8 belgi)</label>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={passwordDraft}
                onChange={(event) => setPasswordDraft(event.target.value)}
                maxLength={128}
                placeholder="Yangi parol"
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <button type="button" onClick={() => void handleSavePassword()} disabled={savingPassword || passwordDraft.trim().length < 8} className="inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Check size={14} /> Saqlash</button>
              <button type="button" onClick={() => setEditingPassword(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-200">Bekor</button>
            </div>
            {passwordError && <p className="mt-2 text-xs text-red-500">{passwordError}</p>}
          </div>
        )}

        {passwordSuccess && (
          <div className="mx-6 mb-4 rounded-2xl bg-green-50 px-3.5 py-2.5 text-xs font-semibold text-green-600">
            Parol muvaffaqiyatli yangilandi.
          </div>
        )}

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

      {removeConfirmOpen && (
        <RemoveStudentConfirmModal
          studentName={studentName}
          removing={removing}
          removeError={removeError}
          onConfirm={handleRemoveStudent}
          onClose={() => { if (!removing) setRemoveConfirmOpen(false); }}
        />
      )}

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
        <div className="mb-4 flex items-center justify-between gap-2">
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

        <div className="flex flex-col gap-2">
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

function RemoveStudentConfirmModal({
  studentName,
  removing,
  removeError,
  onConfirm,
  onClose,
}: {
  studentName: string;
  removing: boolean;
  removeError: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/20 sm:items-center"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-sm sm:rounded-3xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">O'quvchini chetlashtirish</h2>
            <p className="mt-1 text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{studentName}</span> maktabdan va barcha kurslardan chiqariladi.
              Uning bajargan darslari, testlari va to'lov tarixi butunlay o'chib ketadi — bu amalni ortga qaytarib bo'lmaydi.
            </p>
          </div>
        </div>

        {removeError && <p className="mb-3 text-xs font-semibold text-red-500">{removeError}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={removing}
            className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={removing}
            className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {removing ? 'Chetlashtirilmoqda...' : 'Chetlashtirish'}
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
