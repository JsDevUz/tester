import { useEffect, useState } from 'react';
import { Inbox, Plus, X } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { AddStaffModal } from '../components/school/AddStaffModal';
import { useSchoolStore, type SchoolStaffRole } from '../stores/schoolStore';

const AVATAR_PALETTES = [
  'bg-indigo-100 text-indigo-600',
  'bg-amber-100 text-amber-600',
  'bg-teal-100 text-teal-600',
  'bg-rose-100 text-rose-600',
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

const ROLE_BADGE: Record<SchoolStaffRole, { label: string; className: string }> = {
  teacher_staff: { label: "O'qituvchi", className: 'bg-teal-100 text-teal-600' },
  curator: { label: 'Kurator', className: 'bg-amber-100 text-amber-600' },
};

export function SchoolStaffPage() {
  const { staff, loadStaff, searchStudents, addStaff, removeStaff } = useSchoolStore();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  function handleAddStaff(studentId: string, role: SchoolStaffRole) {
    void addStaff(studentId, role).then(() => setModalOpen(false));
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-3 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-gray-800">Mening xodimlarim</h1>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
            >
              <Plus size={16} /> Xodim qo'shish
            </button>
          </div>

          {staff.length === 0 ? (
            <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
              <Inbox size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Hali xodim yo'q</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {staff.map((s) => {
                const badge = ROLE_BADGE[s.role];
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${paletteFor(s.id)}`}>
                      {initials(s.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800">{s.name}</p>
                      <p className="truncate text-xs text-gray-400">{s.email}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeStaff(s.id)}
                      className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label="Xodimni olib tashlash"
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <SchoolSidePanel />
      </div>

      {modalOpen && (
        <AddStaffModal
          onSearch={searchStudents}
          onConfirm={handleAddStaff}
          onClose={() => setModalOpen(false)}
        />
      )}
    </AppShell>
  );
}
