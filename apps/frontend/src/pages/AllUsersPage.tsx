import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Inbox,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "../components/AppShell";
import { StudentsSectionTabs } from "../components/students/StudentsSectionTabs";
import { apiListAllStudents, type ApiSchoolStudent } from "../api/school";

const AVATAR_PALETTES = [
  "bg-indigo-100 text-indigo-600",
  "bg-amber-100 text-amber-600",
  "bg-teal-100 text-teal-600",
  "bg-rose-100 text-rose-600",
  "bg-violet-100 text-violet-600",
  "bg-cyan-100 text-cyan-600",
];

function paletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const PAGE_SIZE = 7;

export function AllUsersPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<ApiSchoolStudent[]>([]);

  useEffect(() => {
    void apiListAllStudents().then(setUsers);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.phone ?? "").includes(q),
    );
  }, [query, users]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function handleSearch(value: string) {
    setQuery(value);
    setPage(1);
  }

  return (
    <AppShell>
      <div className="min-h-screen p-3 sm:p-4">
        <div className="flex min-h-full flex-col gap-3">
          <div className="rounded-2xl bg-white p-4">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">
              Barcha maktab foydalanuvchilari
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Maktabingiz foydalanuvchilari haqida to'liq ma'lumot
            </p>
          </div>

          <StudentsSectionTabs counts={{ "/students": users.length, "/students/list": users.length }} />

          <div className="relative w-fit max-w-full">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Ism yoki telefon raqami bo'yicha qidirish..."
              className="w-[min(560px,calc(100vw-2rem))] rounded-xl bg-gray-50 py-2.5 pl-10 pr-4 text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
            />
          </div>

          <div className="rounded-2xl bg-white p-4">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Inbox size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {query
                    ? "Hech narsa topilmadi."
                    : "Hali foydalanuvchilar yo'q."}
                </p>
              </div>
            ) : (
              <>
                <div className="md:hidden flex flex-col gap-2">
                {pageItems.map((u) => (
                  <div
                    key={u.id}
                    className="bg-white rounded-2xl px-3.5 py-3 flex items-center gap-3"
                  >
                    <div
                      className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${paletteFor(u.id)}`}
                    >
                      {initials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {u.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">—</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center justify-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-500">
                        {u.productsCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

                <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-210 text-left">
                  <thead className="text-sm font-medium text-gray-700">
                    <tr>
                      <th className="px-5 py-4">Foydalanuvchi</th>
                      <th className="px-5 py-4">Tizimga kirish</th>
                      <th className="px-5 py-4 text-center">Mahsulotlar</th>
                      <th className="px-5 py-4 text-center">Kuratorlar</th>
                      <th className="px-5 py-4 text-center">Daromad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((u) => (
                      <tr
                        key={u.id}
                        className="transition-colors hover:bg-indigo-50/40 rounded-2xl min-h-17.5"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${paletteFor(u.id)}`}
                            >
                              {initials(u.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">
                                {u.name}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">—</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500">
                          {u.phone}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {u.productsCount > 0 ? (
                            <span className="inline-flex items-center justify-center rounded-full bg-indigo-100 w-6 h-6 text-xs font-bold text-indigo-600">
                              {u.productsCount}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center rounded-full bg-gray-100 w-6 h-6 text-xs font-bold text-gray-400">
                              0
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center text-sm text-gray-300">
                          —
                        </td>
                        <td className="px-5 py-4 text-center text-sm text-gray-500">
                          {u.totalPaid > 0 ? u.totalPaid.toLocaleString('uz-UZ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

                {pageCount > 1 && (
                  <div className="flex items-center justify-center gap-1.5 mt-5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Oldingi sahifa"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-xl text-sm font-semibold transition-colors ${
                          p === currentPage
                            ? "bg-indigo-500 text-white"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={currentPage === pageCount}
                    className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Keyingi sahifa"
                  >
                    <ChevronRight size={16} />
                  </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
