import { useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { SchoolStaffRole } from '../../stores/schoolStore';
import type { StudentRow } from '../../pages/StudentsPage';

interface AddStaffModalProps {
  students: StudentRow[];
  onConfirm: (data: { name: string; email: string; role: SchoolStaffRole }) => void;
  onClose: () => void;
}

const ROLE_OPTIONS: { value: SchoolStaffRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'teacher', label: "O'qituvchi" },
  { value: 'curator', label: 'Kurator' },
];

export function AddStaffModal({ students, onConfirm, onClose }: AddStaffModalProps) {
  const [query, setQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [role, setRole] = useState<SchoolStaffRole>('teacher');

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredStudents = normalizedQuery
    ? students.filter((student) =>
        `${student.name} ${student.phone}`.toLowerCase().includes(normalizedQuery),
      )
    : students;
  const canSubmit = !!selectedStudent;

  function handleSubmit() {
    if (!selectedStudent) return;
    onConfirm({ name: selectedStudent.name, email: selectedStudent.phone, role });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white sm:max-w-sm sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">Xodim qo'shish</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div>
            <p className="mb-1.5 text-sm text-gray-500">O'quvchini tanlang</p>
            <div className="relative mb-2">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ism yoki telefon bo'yicha qidirish"
                className="w-full rounded-2xl border border-border bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-2xl bg-gray-50 p-1">
              {filteredStudents.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">
                  O'quvchi topilmadi
                </p>
              ) : (
                filteredStudents.map((student) => {
                  const selected = student.id === selectedStudentId;
                  const initials = student.name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')
                    .toUpperCase();
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setSelectedStudentId(student.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        selected ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-white'
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-gray-500">
                        {initials || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">
                          {student.name}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {student.phone}
                        </p>
                      </div>
                      {selected && <Check size={18} className="shrink-0 text-indigo-500" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-gray-500">Rol</p>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as SchoolStaffRole)}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
          >
            Qo'shish
          </button>
        </div>
      </div>
    </div>
  );
}
