import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ApiStudentSearchResult } from '../../api/school';
import { UserAvatar } from '../UserAvatar';
import type { SchoolStaffRole } from '../../stores/schoolStore';

interface AddStaffModalProps {
  onSearch: (query: string) => Promise<ApiStudentSearchResult[]>;
  onConfirm: (studentId: string, role: SchoolStaffRole) => void;
  onClose: () => void;
}

const ROLE_OPTIONS: { value: SchoolStaffRole; label: string }[] = [
  { value: 'teacher_staff', label: "O'qituvchi" },
  { value: 'curator', label: 'Kurator' },
];

export function AddStaffModal({ onSearch, onConfirm, onClose }: AddStaffModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApiStudentSearchResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState<SchoolStaffRole>('teacher_staff');

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      void onSearch(query).then((items) => {
        if (!cancelled) setResults(items);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, onSearch]);

  function handleSubmit() {
    if (!selectedId) return;
    onConfirm(selectedId, role);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/10 dark:bg-black/30 p-0 sm:items-center sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl sm:max-w-md sm:rounded-3xl shadow-2xl text-[var(--text-primary)]">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Xodim qo'shish</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ism yoki telefon bo'yicha qidirish..."
              className="w-full rounded-xl bg-[var(--card-bg)] border border-slate-200/60 dark:border-white/5 py-2 pl-9 pr-4 text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {results.length === 0 ? (
            <p className="py-8 text-center text-xs font-medium text-[var(--text-muted)]">
              {query.trim() ? 'Hech narsa topilmadi.' : "Qidirish uchun ism yoki telefon kiriting."}
            </p>
          ) : (
            <div className="flex flex-col gap-1 pb-2">
              {results.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-[var(--card-hover)]"
                >
                  <input
                    type="radio"
                    name="student"
                    checked={selectedId === s.id}
                    onChange={() => setSelectedId(s.id)}
                    className="h-3.5 w-3.5 shrink-0 accent-indigo-600 cursor-pointer"
                  />
                  <UserAvatar name={s.name} avatarUrl={s.avatarUrl} className="h-8 w-8 rounded-full text-xs font-bold" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[var(--text-primary)]">{s.name}</p>
                    <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">{s.phone}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-3">
          <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as SchoolStaffRole)}
            className="w-full rounded-xl bg-[var(--card-bg)] border border-slate-200/60 dark:border-white/5 py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value} className="bg-[var(--surface-bg)] text-[var(--text-primary)]">{r.label}</option>
            ))}
          </select>
        </div>

        <div className="px-5 pb-5 pt-1">
          <button
            onClick={handleSubmit}
            disabled={!selectedId}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            Qo'shish
          </button>
        </div>
      </div>
    </div>
  );
}
