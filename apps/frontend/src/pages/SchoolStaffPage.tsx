import { useEffect, useState } from 'react';
import { Inbox, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { AddStaffModal } from '../components/school/AddStaffModal';
import { useSchoolStore, type SchoolStaffRole } from '../stores/schoolStore';
import { UserAvatar } from '../components/UserAvatar';
import { DataLoadingState } from '../components/DataLoadingState';
import { PaginationControls } from '../components/PaginationControls';


const ROLE_BADGE: Record<SchoolStaffRole, { label: string; className: string }> = {
  teacher_staff: { label: "O'qituvchi", className: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' },
  curator: { label: 'Kurator', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
};

export function SchoolStaffPage() {
  const { staff, staffTotal, staffLoading, staffLoaded, staffError, loadStaff, searchStudents, addStaff, removeStaff } = useSchoolStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    void loadStaff(pageSize, (page - 1) * pageSize).catch(() => undefined);
  }, [loadStaff, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(staffTotal / pageSize));
  const pageStaff = staff;
  const staffLimitReached = staffTotal >= 30;

  async function handleAddStaff(studentId: string, role: SchoolStaffRole) {
    if (staffLimitReached) return;
    try {
      await addStaff(studentId, role);
      setModalOpen(false);
      setPage(Math.ceil((staffTotal + 1) / pageSize));
      toast.success("Xodim qo'shildi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Xodim qo'shib bo'lmadi");
    }
  }

  return (
    <AppShell>
      <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
        <div className="flex min-h-full flex-col gap-3">
          {/* Top Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Mening xodimlarim</h1>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Maktabingiz o'qituvchi va kuratorlari ro'yxati ({staffTotal}/30)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={staffLimitReached}
              title={staffLimitReached ? "Bitta maktabga maksimal 30 ta xodim qo'shish mumkin" : undefined}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <Plus size={15} /> Xodim qo'shish
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row items-start">
            <div className="min-w-0 flex-1 space-y-3">
              {staffLimitReached && (
                <p className="rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Maksimal 30 ta xodim qo'shilgan. Yangi xodim qo'shish uchun avval mavjud xodimlardan birini olib tashlang.
                </p>
              )}

              {staffLoading && !staffLoaded ? (
                <DataLoadingState label="Xodimlar yuklanmoqda..." className="min-h-60" />
              ) : staffError && staff.length === 0 ? (
                <div className="rounded-2xl bg-[var(--surface-bg)] py-16 text-center text-xs font-semibold text-[var(--text-muted)] shadow-xs">
                  <p>{staffError}</p>
                  <button type="button" onClick={() => void loadStaff(pageSize, (page - 1) * pageSize).catch(() => undefined)} className="mt-3 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 cursor-pointer">Qayta urinish</button>
                </div>
              ) : staffLoaded && staff.length === 0 ? (
                <div className="rounded-2xl bg-[var(--surface-bg)] py-16 text-center text-[var(--text-muted)] shadow-xs">
                  <Inbox size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-medium">Hali xodim yo'q</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {pageStaff.map((s) => {
                    const badge = ROLE_BADGE[s.role];
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-[var(--surface-bg)] px-4 py-3 shadow-xs transition-colors hover:bg-[var(--card-hover)]">
                        <UserAvatar name={s.name} avatarUrl={s.avatarUrl} className="h-9 w-9 shrink-0 rounded-full text-xs font-bold" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-[var(--text-primary)]">{s.name}</p>
                          <p className="truncate text-[11px] font-medium text-[var(--text-muted)] mt-0.5">{s.phone}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => void removeStaff(s.id)}
                          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                          aria-label="Xodimni olib tashlash"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    );
                  })}
                  <div className="p-2">
                    <PaginationControls page={page} pageCount={pageCount} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1); }} />
                  </div>
                </div>
              )}
            </div>

            <SchoolSidePanel />
          </div>
        </div>

        {modalOpen && (
          <AddStaffModal
            onSearch={searchStudents}
            onConfirm={handleAddStaff}
            onClose={() => setModalOpen(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
