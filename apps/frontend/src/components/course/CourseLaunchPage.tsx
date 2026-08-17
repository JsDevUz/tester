import { useEffect, useRef, useState } from 'react';
import { Inbox, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCourseStore, type PricingPlan } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { CreatePricingPlanModal } from './CreatePricingPlanModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface CourseLaunchPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectSettings: () => void;
  onSelectGroups: () => void;
  onSelectClasses: () => void;
  onSelectChallenges: () => void;
}

function formatPlanDateRange(plan: PricingPlan): string {
  if (!plan.startDate && !plan.endDate) return 'Cheksiz';
  const formatDate = (date: string | null) => date ? new Intl.DateTimeFormat('uz-UZ').format(new Date(date)) : '…';
  const start = formatDate(plan.startDate);
  const end = formatDate(plan.endDate);
  return `${start} — ${end}`;
}

export function CourseLaunchPage({ courseId, onBackToList, onSelectContent, onSelectSettings, onSelectGroups, onSelectClasses, onSelectChallenges }: CourseLaunchPageProps) {
  const { courses, loadCourseDetails, addLaunch, addPricingPlan, updatePricingPlan, removePricingPlan } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);

  useEffect(() => {
    if (courseId) void loadCourseDetails(courseId);
  }, [courseId, loadCourseDetails]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PricingPlan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PricingPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const didEnsureLaunch = useRef(false);

  useEffect(() => {
    if (didEnsureLaunch.current) return;
    if (course && course.launches.length === 0) {
      didEnsureLaunch.current = true;
      addLaunch(courseId, 'Ishga tushirish №1');
    }
  }, [course, courseId, addLaunch]);

  if (!course) return null;
  const launch = course.launches[0];
  if (!launch) return null;
  const totalPlanCount = course.launches.reduce((count, item) => count + item.plans.length, 0);
  const planLimitReached = totalPlanCount >= 4;

  async function handleCreatePlan(plan: Omit<PricingPlan, 'id'>) {
    try {
      await addPricingPlan(courseId, launch.id, plan);
      setModalOpen(false);
      toast.success("Tarif yaratildi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Tarif yaratib bo'lmadi");
    }
  }

  async function handleUpdatePlan(plan: Omit<PricingPlan, 'id'>) {
    if (!editTarget) return;
    try {
      await updatePricingPlan(courseId, launch.id, editTarget.id, plan);
      setEditTarget(null);
      toast.success("Tarif yangilandi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Tarifni yangilab bo'lmadi");
    }
  }

  async function handleDeletePlan() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await removePricingPlan(courseId, launch.id, deleteTarget.id);
      setDeleteTarget(null);
      toast.success("Tarif o'chirildi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Tarifni o'chirib bo'lmadi");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
      <div className="flex min-h-full flex-col gap-3">
        <div className="px-1 py-1">
          <Breadcrumb
            items={[
              { label: 'Kurslar', onClick: onBackToList },
              { label: course.title, onClick: onSelectContent },
              { label: 'Tariflar' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Tariflar</h2>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">Bu yerda tariflarni qo'shishingiz mumkin</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  disabled={planLimitReached}
                  title={planLimitReached ? "Bitta kursga maksimal 4 ta tarif ochish mumkin" : undefined}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <Plus size={15} /> Tarif yaratish
                </button>
              </div>
              {planLimitReached && (
                <p className="mb-3 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Bu kursda maksimal 4 ta tarif mavjud. Yangi tarif yaratish uchun avval mavjud tariflardan birini o'chiring.
                </p>
              )}

              {launch.plans.length === 0 ? (
                <div className="rounded-2xl bg-[var(--card-bg)] py-14 text-center">
                  <Inbox size={30} className="mx-auto mb-2 text-[var(--text-muted)] opacity-40" />
                  <p className="text-xs font-bold text-[var(--text-primary)]">Hali tarif yo'q</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Yuqoridagi tugma orqali birinchi tarifni yarating</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {launch.plans.map((plan) => (
                    <div key={plan.id} className="flex items-center gap-3 rounded-2xl bg-[var(--card-bg)] px-4 py-3">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-[var(--text-primary)]">{plan.name}</p>
                        <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">{formatPlanDateRange(plan)}</p>
                      </div>
                      <p className="shrink-0 text-xs font-bold text-[var(--text-primary)]">{plan.price.toLocaleString()} UZS</p>
                      <button
                        type="button"
                        onClick={() => setEditTarget(plan)}
                        aria-label={`${plan.name} tarifini tahrirlash`}
                        title="Tarifni tahrirlash"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-indigo-500/10 hover:text-indigo-500 cursor-pointer"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(plan)}
                        aria-label={`${plan.name} tarifini o'chirish`}
                        title="Tarifni o'chirish"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <CourseSidePanel
            onBackToList={onBackToList}
            activeFullTab="launch"
            onSelectContent={onSelectContent}
            onSelectSettings={onSelectSettings}
            onSelectGroups={onSelectGroups}
            onSelectClasses={onSelectClasses}
            onSelectChallenges={onSelectChallenges}
            onSelectLaunch={() => { }}
          />
        </div>

      {modalOpen && (
        <CreatePricingPlanModal
          groups={course.groups}
          onConfirm={handleCreatePlan}
          onClose={() => setModalOpen(false)}
        />
      )}
      {editTarget && (
        <CreatePricingPlanModal
          groups={course.groups}
          initialPlan={editTarget}
          onConfirm={(plan) => void handleUpdatePlan(plan)}
          onClose={() => setEditTarget(null)}
        />
      )}
        {deleteTarget && (
          <ConfirmDeleteModal
            title="Tarifni o'chirish"
            description={`"${deleteTarget.name}" tarifi o'chiriladi. Eski to'lov summalari va hisobotlar saqlanadi. Agar tarif o'quvchiga biriktirilgan bo'lsa, avval uning tarifini almashtirish kerak.`}
            confirmLabel={deleting ? "O'chirilmoqda..." : "O'chirish"}
            onConfirm={() => void handleDeletePlan()}
            onClose={() => { if (!deleting) setDeleteTarget(null); }}
          />
        )}
      </div>
    </div>
  );
}
