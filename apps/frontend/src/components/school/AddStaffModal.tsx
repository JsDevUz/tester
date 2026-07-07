import { useState } from 'react';
import { X } from 'lucide-react';
import type { SchoolStaffRole } from '../../stores/schoolStore';

interface AddStaffModalProps {
  onConfirm: (data: { name: string; email: string; role: SchoolStaffRole }) => void;
  onClose: () => void;
}

const ROLE_OPTIONS: { value: SchoolStaffRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'teacher', label: "O'qituvchi" },
  { value: 'curator', label: 'Kurator' },
];

export function AddStaffModal({ onConfirm, onClose }: AddStaffModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SchoolStaffRole>('teacher');

  const canSubmit = name.trim().length > 0 && email.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onConfirm({ name: name.trim(), email: email.trim(), role });
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
            <p className="mb-1.5 text-sm text-gray-500">Ism</p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Xodim ismi"
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm text-gray-500">Email</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@maktab.uz"
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
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
