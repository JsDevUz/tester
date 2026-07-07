import { useEffect, useRef, useState } from 'react';
import { Inbox, Plus } from 'lucide-react';
import { useCourseStore, type PricingPlan } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { CreatePricingPlanModal } from './CreatePricingPlanModal';

interface CourseLaunchPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectSettings: () => void;
  onSelectGroups: () => void;
}

const LAUNCH_NAME_MAX = 65;

function formatPlanDateRange(plan: PricingPlan): string {
  if (!plan.startDate && !plan.endDate) return 'Cheksiz';
  const start = plan.startDate ?? '…';
  const end = plan.endDate ?? '…';
  return `${start} — ${end}`;
}

export function CourseLaunchPage({ courseId, onBackToList, onSelectContent, onSelectSettings, onSelectGroups }: CourseLaunchPageProps) {
  const { courses, addLaunch, toggleLaunchActive, renameLaunch, addPricingPlan } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const [modalOpen, setModalOpen] = useState(false);
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

  function handleCreatePlan(plan: Omit<PricingPlan, 'id'>) {
    addPricingPlan(courseId, launch.id, plan);
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-3 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title, onClick: onSelectContent },
            { label: 'Ishga tushirish va tariflar' },
          ]}
        />

        <div className="mb-4 rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Ishga tushirish sozlamalari</h2>
          <p className="mb-4 text-sm text-gray-400">Bu yerda ishga tushirish sozlamalarini o'zgartirishingiz mumkin.</p>

          <div className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800">
                {launch.active ? 'Ishga tushirish sotuvda' : 'Ishga tushirish sotuvda emas'}
              </p>
              <p className="text-xs text-gray-400">Bosing, ishga tushirish savdo holatini o'zgartirish uchun</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              launch.active ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'
            }`}>
              {launch.active ? 'Faol' : 'Qoralama'}
            </span>
            <button
              type="button"
              onClick={() => toggleLaunchActive(courseId, launch.id)}
              className={`relative inline-block h-6 w-11 shrink-0 rounded-full p-0 transition-colors ${
                launch.active ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  launch.active ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-sm text-gray-500">Ishga tushirish nomi</p>
            <input
              value={launch.name}
              onChange={(e) => renameLaunch(courseId, launch.id, e.target.value.slice(0, LAUNCH_NAME_MAX))}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mt-1 text-right text-xs text-gray-300">{launch.name.length} / {LAUNCH_NAME_MAX}</p>
          </div>

          <p className="mt-4 text-center text-xs text-gray-300">Barchasi saqlandi</p>
        </div>

        <div className="rounded-2xl bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="mb-1 text-lg font-bold text-gray-800">Tariflar</h2>
              <p className="text-sm text-gray-400">Bu yerda tariflarni qo'shishingiz mumkin</p>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
            >
              <Plus size={16} /> Tarif yaratish
            </button>
          </div>

          {launch.plans.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 py-14 text-center">
              <Inbox size={30} className="mx-auto mb-3 text-indigo-200" />
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
        onSelectLaunch={() => {}}
      />

      {modalOpen && (
        <CreatePricingPlanModal
          groups={course.groups}
          onConfirm={handleCreatePlan}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
