import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { MOCK_STUDENTS } from '../../pages/StudentsPage';

interface AddStudentToGroupModalProps {
  alreadyInGroup: string[];
  onConfirm: (studentIds: string[]) => void;
  onClose: () => void;
}

export function AddStudentToGroupModal({ alreadyInGroup, onConfirm, onClose }: AddStudentToGroupModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(alreadyInGroup));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_STUDENTS;
    return MOCK_STUDENTS.filter((s) => s.name.toLowerCase().includes(q) || s.phone.includes(q));
  }, [query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-white sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">O'quvchi qo'shish</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ism yoki telefon bo'yicha qidirish..."
              className="w-full rounded-2xl bg-gray-50 py-2.5 pl-9 pr-4 text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Hech narsa topilmadi.</p>
          ) : (
            <div className="flex flex-col gap-1 pb-2">
              {filtered.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="h-4 w-4 shrink-0 accent-gray-900"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.phone}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-3">
          <button
            onClick={() => onConfirm([...selected])}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
          >
            Qo'shish
          </button>
        </div>
      </div>
    </div>
  );
}
