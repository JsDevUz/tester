import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { AdminModal } from '../components/AdminModal';
import { apiListAdmins, apiCreateAdmin, apiDeleteAdmin, apiUpdateUserRole } from '../api/admins';
import { useAuthStore } from '../stores/authStore';
import type { Admin } from '../api/auth';

export function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [showModal, setShowModal] = useState(false);
  const currentAdmin = useAuthStore((s) => s.admin);
  const navigate = useNavigate();

  async function load() {
    const list = await apiListAdmins();
    setAdmins(list);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(email: string, password: string, name: string) {
    await apiCreateAdmin(email, password, name);
    setShowModal(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Bu adminni o\'chirishni tasdiqlaysizmi?')) return;
    await apiDeleteAdmin(id);
    load();
  }

  async function handleRoleChange(id: string, role: Admin['role']) {
    await apiUpdateUserRole(id, role);
    load();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="p-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← Orqaga</button>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Adminlar</h2>
          </div>
          <button onClick={() => setShowModal(true)} className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600">
            + Admin qo'shish
          </button>
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {admins.map((admin) => (
            <div key={admin.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{admin.name}</p>
                <p className="text-xs text-gray-400">{admin.email} · {admin.role}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={admin.role}
                  disabled={admin.id === currentAdmin?.id}
                  onChange={(e) => handleRoleChange(admin.id, e.target.value as Admin['role'])}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 disabled:opacity-40"
                >
                  <option value="student">O'quvchi</option>
                  <option value="teacher">Ustoz</option>
                  <option value="super">Super</option>
                </select>
                {admin.id !== currentAdmin?.id && (
                  <button onClick={() => handleDelete(admin.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                    O'chirish
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {showModal && <AdminModal onSubmit={handleCreate} onClose={() => setShowModal(false)} />}
    </div>
  );
}
