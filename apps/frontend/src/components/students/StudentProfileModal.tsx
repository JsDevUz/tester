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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/10 dark:bg-black/30 p-0 sm:p-4 sm:items-center animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card relative flex w-full max-h-[92dvh] flex-col rounded-t-3xl shadow-2xl sm:max-w-lg sm:rounded-3xl animate-in zoom-in-95 duration-150 text-[var(--text-primary)]">
        {/* Profile header */}
        <div className="relative z-30 flex items-start justify-between gap-3 px-6 pb-4 pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar name={studentName} avatarUrl={studentAvatarUrl} className="h-13 w-13 rounded-full text-base font-bold shrink-0" />
            <div className="min-w-0">
              <h2 className="truncate text-base sm:text-lg font-bold text-[var(--text-primary)]">{studentName}</h2>
              {studentTelegramName && (
                <p className="truncate text-xs font-semibold text-indigo-500">tg: {studentTelegramName}</p>
              )}
              <p className="truncate text-xs font-medium text-[var(--text-muted)]">{studentPhone ?? '—'}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {canManageCourses && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActionsOpen((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] cursor-pointer"
                  aria-label="Harakatlar"
                >
                  <MoreVertical size={18} />
                </button>
                {actionsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setActionsOpen(false)} />
                    <div className="glass-card absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-2xl p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setActionsOpen(false);
                          setEnrollFlowOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs sm:text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                      >
                        <GraduationCap size={16} className="text-indigo-500" />
                        Kursga qo'shish
                      </button>
                      <button
                        type="button"
                        onClick={() => { setActionsOpen(false); setNameDraft(studentName); setEditingName(true); setSaveError(null); }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs sm:text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                      >
                        <Pencil size={16} className="text-[var(--text-muted)]" />
                        Ismni tahrirlash
                      </button>
                      <button
                        type="button"
                        onClick={() => { setActionsOpen(false); setPasswordDraft(''); setEditingPassword(true); setPasswordError(null); }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs sm:text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                      >
                        <KeyRound size={16} className="text-[var(--text-muted)]" />
                        Parolni o'zgartirish
                      </button>
                      <div className="my-1 border-t border-black/5 dark:border-white/10" />
                      <button
                        type="button"
                        onClick={() => { setActionsOpen(false); setRemoveError(null); setRemoveConfirmOpen(true); }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/10 cursor-pointer"
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
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] cursor-pointer"
              aria-label="Yopish"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {editingName && (
          <div className="mx-6 mb-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 p-3.5">
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">O'quvchi ismi</label>
            <div className="flex gap-2">
              <input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={120} className="min-w-0 flex-1 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#30313a] px-3.5 py-2 text-xs sm:text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/30" />
              <button type="button" onClick={() => void handleSaveName()} disabled={savingName || !nameDraft.trim()} className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"><Check size={14} /> Saqlash</button>
              <button type="button" onClick={() => setEditingName(false)} className="rounded-xl px-3 py-2 text-xs font-bold text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] cursor-pointer">Bekor</button>
            </div>
            {saveError && <p className="mt-2 text-xs font-semibold text-red-500">{saveError}</p>}
          </div>
        )}

        {editingPassword && (
          <div className="mx-6 mb-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 p-3.5">
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Yangi parol (kamida 8 belgi)</label>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={passwordDraft}
                onChange={(event) => setPasswordDraft(event.target.value)}
                maxLength={128}
                placeholder="Yangi parol"
                className="min-w-0 flex-1 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#30313a] px-3.5 py-2 text-xs sm:text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button type="button" onClick={() => void handleSavePassword()} disabled={savingPassword || passwordDraft.trim().length < 8} className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"><Check size={14} /> Saqlash</button>
              <button type="button" onClick={() => setEditingPassword(false)} className="rounded-xl px-3 py-2 text-xs font-bold text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] cursor-pointer">Bekor</button>
            </div>
            {passwordError && <p className="mt-2 text-xs font-semibold text-red-500">{passwordError}</p>}
          </div>
        )}

        {passwordSuccess && (
          <div className="mx-6 mb-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 px-3.5 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            Parol muvaffaqiyatli yangilandi.
          </div>
        )}

        {totalStarsMax > 0 && (
          <div className="mx-6 mb-4 flex items-center gap-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5">
            <Star size={15} fill="currentColor" className="text-amber-500" />
            <span className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400">{totalStars} / {totalStarsMax}</span>
            <span className="text-xs font-medium text-amber-600/80 dark:text-amber-400/80">jami yulduz</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Ta'lim</p>
          {loadingEnrollments ? (
            <p className="py-6 text-center text-xs font-semibold text-[var(--text-muted)]">Yuklanmoqda...</p>
          ) : enrollments.length === 0 ? (
            <div className="rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 py-10 text-center text-[var(--text-muted)]">
              <UserRound size={26} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs sm:text-sm font-bold">Hali hech qanday kursga yozilmagan</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {enrollments.map((e) => (
                <div key={`${e.courseId}-${e.groupName}`} className="rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-xs sm:text-sm font-bold text-[var(--text-primary)]">{e.courseTitle}</p>
                    <span className={`shrink-0 text-xs font-bold ${progressColor(e.progressPercent)}`}>
                      {e.progressPercent}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)] font-medium">
                    <span>{e.groupName} • {e.lessonsCompleted}/{e.lessonsTotal} dars</span>
                    {e.starsMax > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 font-bold text-amber-500">
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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/10 dark:bg-black/30 p-0 sm:p-4 sm:items-center animate-in fade-in duration-150"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="glass-card w-full rounded-t-3xl p-6 shadow-2xl sm:max-w-sm sm:rounded-3xl animate-in zoom-in-95 duration-150 text-[var(--text-primary)]">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">Kursga qo'shish</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
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
            className="mt-1 w-full rounded-2xl bg-indigo-600 py-3 text-xs sm:text-sm font-bold text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/10 dark:bg-black/30 p-0 sm:p-4 sm:items-center animate-in fade-in duration-150"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="glass-card w-full rounded-t-3xl p-6 shadow-2xl sm:max-w-sm sm:rounded-3xl animate-in zoom-in-95 duration-150 text-[var(--text-primary)]">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-500">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">O'quvchini chetlashtirish</h2>
            <p className="mt-1 text-xs sm:text-sm font-medium text-[var(--text-muted)] leading-relaxed">
              <span className="font-bold text-[var(--text-primary)]">{studentName}</span> maktabdan va barcha kurslardan chiqariladi.
              Uning bajargan darslari, testlari va to'lov tarixi butunlay o'chib ketadi.
            </p>
          </div>
        </div>

        {removeError && <p className="mb-3 text-xs font-semibold text-red-500">{removeError}</p>}

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={removing}
            className="flex-1 rounded-xl bg-black/5 dark:bg-white/10 py-2.5 text-xs sm:text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-black/10 dark:hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={removing}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-red-600/30 transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-[var(--text-muted)]">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-4 py-2.5 pr-9 text-xs sm:text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <option value="" className="bg-[var(--surface-bg)] text-[var(--text-primary)]">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-[var(--surface-bg)] text-[var(--text-primary)]">{o.label}</option>
          ))}
        </select>
      </div>
    </label>
  );
}
