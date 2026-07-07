import { useMemo, useState } from "react";
import {
  Search,
  Inbox,
  Plus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "../components/AppShell";

interface UserRow {
  id: string;
  name: string;
  phone: string;
  lastSeen: string;
  productsCount: number;
  active: boolean;
}

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

// TODO: mock data — backend /admins/users endpoint ulanganda almashtiriladi
const MOCK_USERS: UserRow[] = [
  {
    id: "1",
    name: "Aziza Karimova",
    phone: "+998901234567",
    lastSeen: "tarmoqda edi bugun",
    productsCount: 1,
    active: true,
  },
  {
    id: "2",
    name: "+998909876543",
    phone: "+998909876543",
    lastSeen: "onlayn bo'lmagan edi",
    productsCount: 0,
    active: false,
  },
  {
    id: "3",
    name: "Malika Yusupova",
    phone: "+998933456789",
    lastSeen: "tarmoqda edi kecha",
    productsCount: 0,
    active: true,
  },
  {
    id: "4",
    name: "Sardor Aliyev",
    phone: "+998941122334",
    lastSeen: "tarmoqda edi 2 kun oldin",
    productsCount: 2,
    active: true,
  },
  {
    id: "5",
    name: "Nodira Ergasheva",
    phone: "+998977766554",
    lastSeen: "onlayn bo'lmagan edi",
    productsCount: 1,
    active: true,
  },
  {
    id: "6",
    name: "Bekzod Nazarov",
    phone: "+998912233445",
    lastSeen: "tarmoqda edi 1 hafta oldin",
    productsCount: 0,
    active: false,
  },
  {
    id: "7",
    name: "Dilnoza Tosheva",
    phone: "+998950011223",
    lastSeen: "tarmoqda edi bugun",
    productsCount: 1,
    active: true,
  },
  {
    id: "8",
    name: "+998900112233",
    phone: "+998900112233",
    lastSeen: "onlayn bo'lmagan edi",
    productsCount: 0,
    active: false,
  },
  {
    id: "9",
    name: "Ravshan Yoqubov",
    phone: "+998932244556",
    lastSeen: "tarmoqda edi 3 kun oldin",
    productsCount: 1,
    active: true,
  },
];

export function AllUsersPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_USERS;
    return MOCK_USERS.filter(
      (u) => u.name.toLowerCase().includes(q) || u.phone.includes(q),
    );
  }, [query]);

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
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 min-w-0 w-full px-4 py-4 sm:px-6 sm:py-5 max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-4">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">
              Barcha maktab foydalanuvchilari
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Maktabingiz foydalanuvchilari haqida to'liq ma'lumot
            </p>
          </div>

          {/* Add button */}
          <button
            type="button"
            disabled
            title="Tez orada"
            className="mb-5 inline-flex items-center gap-2 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} />
            Foydalanuvchilarni qo'shish
          </button>

          {/* Search */}
          <div className="relative mb-5">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Ism yoki telefon raqami bo'yicha qidirish..."
              className="w-full rounded-2xlbg-gray-50 pl-10 pr-4 py-3 text-sm outline-none transition-colors focus:border-indigo-300 focus:bg-white"
            />
          </div>

          {/* Count */}
          <div className="flex items-center gap-2 mb-3">
            <p className="text-sm font-semibold text-gray-700">Foydalanuvchi</p>
            <span className="inline-flex items-center justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-600">
              {filtered.length}
            </span>
          </div>

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
              {/* Mobile: card list */}
              <div className="md:hidden flex flex-col gap-2">
                {pageItems.map((u) => (
                  <div
                    key={u.id}
                    className="bg-white rounded-2xlpx-3.5 py-3 flex items-center gap-3"
                  >
                    <div
                      className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${paletteFor(u.id)}`}
                    >
                      {initials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {u.name}
                        </p>
                        {!u.active && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                            Faol emas
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {u.lastSeen}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center justify-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-500">
                        {u.productsCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-210 text-left">
                  <thead className="border-b border-border text-sm font-medium text-gray-500">
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
                        className="transition-colors hover:bg-indigo-50/40"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${paletteFor(u.id)}`}
                            >
                              {initials(u.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-800 truncate">
                                  {u.name}
                                </p>
                                {!u.active && (
                                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                                    Faol emas
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {u.lastSeen}
                              </p>
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
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                            <CheckCircle2
                              size={16}
                              className="text-green-400"
                            />
                            —
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
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
    </AppShell>
  );
}
