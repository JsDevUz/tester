import { useEffect, useState } from 'react';
import { BookOpen, Lock } from 'lucide-react';
import { Toolbar } from '../components/Toolbar';
import { apiGetMyCourses, type ApiMyCourse } from '../api/groups';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Kutilmoqda',
  partial: 'Qisman to\'langan',
  paid: 'To\'landi',
  debt: 'Qarzdorlik',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-gray-200 text-gray-500',
  partial: 'bg-amber-100 text-amber-600',
  paid: 'bg-green-100 text-green-600',
  debt: 'bg-red-100 text-red-600',
};

export function MyCoursesPage() {
  const [courses, setCourses] = useState<ApiMyCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetMyCourses()
      .then(setCourses)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Toolbar />
      <div className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="mb-4 text-lg font-bold text-gray-800">Mening kurslarim</h1>

        {loading && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

        {!loading && courses.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali hech qanday kursga qo'shilmagansiz</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {courses.map((c) => (
            <div key={`${c.courseId}-${c.groupName}`} className="rounded-2xl bg-white p-5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-gray-800">{c.courseTitle}</p>
                  <p className="text-xs text-gray-400">{c.groupName}</p>
                </div>
                {c.latestPaymentStatus && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[c.latestPaymentStatus]}`}>
                    {STATUS_LABEL[c.latestPaymentStatus]}
                  </span>
                )}
              </div>

              <p className="mb-3 text-xs text-gray-400">
                {c.selectedPlanName ? `Tarif: ${c.selectedPlanName}` : "Tarif hali belgilanmagan"}
              </p>

              {c.hasAccess ? (
                <div className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <BookOpen size={15} /> Darslarga kirish ochiq
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
                  <Lock size={15} /> Darslarga kirish yopiq
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
