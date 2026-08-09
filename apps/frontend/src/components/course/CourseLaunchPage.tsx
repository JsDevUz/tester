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
    <div className="flex flex-col gap-3 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title, onClick: onSelectContent },
            { label: 'Tariflar' },
          ]}
        />

        <div className="rounded-2xl bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="mb-1 text-lg font-bold text-gray-800">Tariflar</h2>
              <p className="text-sm text-gray-400">Bu yerda tariflarni qo'shishingiz mumkin</p>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={planLimitReached}
              title={planLimitReached ? "Bitta kursga maksimal 4 ta tarif ochish mumkin" : undefined}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              <Plus size={16} /> Tarif yaratish
            </button>
          </div>
          {planLimitReached && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Bu kursda maksimal 4 ta tarif mavjud. Yangi tarif yaratish uchun avval mavjud tariflardan birini o'chiring.
            </p>
          )}

          {launch.plans.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 py-14 text-center">
              <Inbox size={30} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-semibold text-gray-700">Hali tarif yo'q</p>
              <p className="mt-1 text-xs text-gray-400">Yuqoridagi tugma orqali birinchi tarifni yarating</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {launch.plans.map((plan) => (
                <div key={plan.id} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-green-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{plan.name}</p>
                    <p className="text-xs text-gray-400">{formatPlanDateRange(plan)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-gray-700">{plan.price.toLocaleString()} UZS</p>
                  <button
                    type="button"
                    onClick={() => setEditTarget(plan)}
                    aria-label={`${plan.name} tarifini tahrirlash`}
                    title="Tarifni tahrirlash"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-500"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(plan)}
                    aria-label={`${plan.name} tarifini o'chirish`}
                    title="Tarifni o'chirish"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={15} />
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
        onSelectLaunch={() => {}}
      />

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
  );
}
