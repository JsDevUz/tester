import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { AdminModal } from "./AdminModal";
import {
  apiListAdmins,
  apiCreateAdmin,
  apiDeleteAdmin,
  apiUpdateUserRole,
} from "../api/admins";
import type { Admin } from "../api/auth";
import { toast } from "sonner";

export function AdminsSection({ currentAdminId }: { currentAdminId: string | null }) {
  const PAGE_SIZE = 20;
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const filteredAdmins = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return admins;
    return admins.filter((admin) =>
      [admin.name, admin.phone, admin.role]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(query)),
    );
  }, [admins, search]);
  const visibleAdmins = filteredAdmins.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAdmins.length;

  async function load() {
    try {
      setAdmins(await apiListAdmins());
    } catch {
      toast.error("Foydalanuvchilarni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredAdmins.length));
      }
    }, { rootMargin: "120px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [filteredAdmins.length, hasMore, visibleCount]);

  async function handleCreate(phone: string, password: string, name: string) {
    try {
      await apiCreateAdmin(phone, password, name);
      setShowModal(false);
      await load();
      toast.success("Admin qo'shildi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Adminni qo'shib bo'lmadi");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu adminni o'chirishni tasdiqlaysizmi?")) return;
    try {
      setUpdatingId(id);
      await apiDeleteAdmin(id);
      await load();
      toast.success("Foydalanuvchi o'chirildi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Foydalanuvchini o'chirib bo'lmadi");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRoleChange(id: string, role: Admin["role"]) {
    try {
      setUpdatingId(id);
      const updated = await apiUpdateUserRole(id, role);
      setAdmins((current) => current.map((item) => item.id === id ? updated : item));
      toast.success("Foydalanuvchi roli yangilandi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Rolni yangilab bo'lmadi");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">
          Foydalanuvchilar
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="text-xs font-semibold text-indigo-500 hover:text-indigo-600"
        >
          + Admin qo'shish
        </button>
      </div>
      <div className="relative mb-2">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ism, telefon yoki rol bo'yicha qidirish"
          className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-xs text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
      <div className="max-h-80 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800/70">
        {loading && <p className="px-4 py-5 text-center text-xs text-gray-400">Yuklanmoqda...</p>}
        {!loading && admins.length === 0 && <p className="px-4 py-5 text-center text-xs text-gray-400">Foydalanuvchilar topilmadi</p>}
        {!loading && filteredAdmins.length === 0 && admins.length > 0 && (
          <p className="px-4 py-5 text-center text-xs text-gray-400">Qidiruv bo'yicha foydalanuvchi topilmadi</p>
        )}
        {visibleAdmins.map((admin) => (
          <div
            key={admin.id}
            className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 last:border-0 dark:border-zinc-700"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-zinc-100">{admin.name}</p>
              <p className="truncate text-xs text-gray-400">
                {admin.phone} · {admin.role}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <select
                value={admin.role}
                disabled={admin.id === currentAdminId || updatingId === admin.id}
                onChange={(e) => handleRoleChange(admin.id, e.target.value as Admin["role"])}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 outline-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <option value="student">O'quvchi</option>
                <option value="teacher">Ustoz</option>
                <option value="curator">Kurator</option>
                <option value="super">Super</option>
              </select>
              {admin.id !== currentAdminId && (
                <button
                  onClick={() => handleDelete(admin.id)}
                  disabled={updatingId === admin.id}
                  className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40"
                >
                  O'chirish
                </button>
              )}
            </div>
          </div>
        ))}
        {hasMore && (
          <div ref={loadMoreRef} className="flex items-center justify-center gap-1.5 py-3 text-xs text-gray-400">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
          </div>
        )}
      </div>
      {showModal && <AdminModal onSubmit={handleCreate} onClose={() => setShowModal(false)} />}
    </div>
  );
}
