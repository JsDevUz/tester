import { useEffect, useState } from "react";
import { AdminModal } from "./AdminModal";
import {
  apiListAdmins,
  apiCreateAdmin,
  apiDeleteAdmin,
  apiUpdateUserRole,
} from "../api/admins";
import type { Admin } from "../api/auth";

export function AdminsSection({ currentAdminId }: { currentAdminId: string | null }) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [showModal, setShowModal] = useState(false);

  async function load() {
    const list = await apiListAdmins();
    setAdmins(list);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(email: string, password: string, name: string) {
    await apiCreateAdmin(email, password, name);
    setShowModal(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu adminni o'chirishni tasdiqlaysizmi?")) return;
    await apiDeleteAdmin(id);
    load();
  }

  async function handleRoleChange(id: string, role: Admin["role"]) {
    await apiUpdateUserRole(id, role);
    load();
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Foydalanuvchilar
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="text-xs font-semibold text-indigo-500 hover:text-indigo-600"
        >
          + Admin qo'shish
        </button>
      </div>
      <div className="overflow-hidden rounded-xl bg-gray-50">
        {admins.map((admin) => (
          <div
            key={admin.id}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{admin.name}</p>
              <p className="truncate text-xs text-gray-400">
                {admin.email} · {admin.role}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <select
                value={admin.role}
                disabled={admin.id === currentAdminId}
                onChange={(e) => handleRoleChange(admin.id, e.target.value as Admin["role"])}
                className="rounded-lg bg-white px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
              >
                <option value="student">O'quvchi</option>
                <option value="teacher">Ustoz</option>
                <option value="super">Super</option>
              </select>
              {admin.id !== currentAdminId && (
                <button
                  onClick={() => handleDelete(admin.id)}
                  className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                >
                  O'chirish
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {showModal && <AdminModal onSubmit={handleCreate} onClose={() => setShowModal(false)} />}
    </div>
  );
}
