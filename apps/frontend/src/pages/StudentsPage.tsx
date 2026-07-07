import { useMemo, useState } from "react";
import { Search, Inbox, GraduationCap } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { formatDate } from "../utils/date";

interface StudentRow {
  id: string;
  name: string;
  phone: string;
  joinedAt: string;
  active: boolean;
  product: string | null;
  progress: number | null;
  currentLesson: string | null;
  tariff: string | null;
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

// TODO: mock data — /admins/users kabi backend endpoint ulanganda almashtiriladi
const MOCK_STUDENTS: StudentRow[] = [
  {
    id: "1",
    name: "Aziza Karimova",
    phone: "+998901234567",
    joinedAt: "2026-05-12",
    active: true,
    product: "Fizika asoslari",
    progress: 62,
    currentLesson: "Nyuton qonunlari",
    tariff: "Kengaytirilgan",
  },
  {
    id: "2",
    name: "Javlon Rustamov",
    phone: "+998909876543",
    joinedAt: "2026-04-28",
    active: true,
    product: "Fizika asoslari",
    progress: 25,
    currentLesson: "Uy vazifasi",
    tariff: "Bazaviy",
  },
  {
    id: "3",
    name: "Malika Yusupova",
    phone: "+998933456789",
    joinedAt: "2026-06-01",
    active: false,
    product: null,
    progress: null,
    currentLesson: null,
    tariff: null,
  },
  {
    id: "4",
    name: "Sardor Aliyev",
    phone: "+998941122334",
    joinedAt: "2026-03-15",
    active: true,
    product: "Kinematika asoslari",
    progress: 88,
    currentLesson: "Radius-vektor",
    tariff: "Kengaytirilgan",
  },
  {
    id: "5",
    name: "Nodira Ergasheva",
    phone: "+998977766554",
    joinedAt: "2026-06-20",
    active: true,
    product: "Fizika asoslari",
    progress: 11,
    currentLesson: "Vektor amallari",
    tariff: "Bazaviy",
  },
  {
    id: "6",
    name: "Bekzod Nazarov",
    phone: "+998912233445",
    joinedAt: "2026-02-09",
    active: false,
    product: "Kinematika asoslari",
    progress: 100,
    currentLesson: "Yakunlangan",
    tariff: "Kengaytirilgan",
  },
  {
    id: "7",
    name: "Dilnoza Tosheva",
    phone: "+998950011223",
    joinedAt: "2026-06-25",
    active: true,
    product: "Fizika asoslari",
    progress: 34,
    currentLesson: "Zichlik va bosim",
    tariff: "Bazaviy",
  },
];

function progressColor(pct: number) {
  if (pct >= 70) return "text-green-500";
  if (pct >= 30) return "text-amber-500";
  return "text-gray-400";
}

export function StudentsPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_STUDENTS;
    return MOCK_STUDENTS.filter(
      (s) => s.name.toLowerCase().includes(q) || s.phone.includes(q),
    );
  }, [query]);

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 min-w-0 w-full px-4 py-4 sm:px-6 sm:py-5 max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-5">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">
              O'quvchilar
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Mahsulotingizda tahsil olayotgan o'quvchilar haqida to'liq
              ma'lumot
            </p>
          </div>

          {/* Search */}
          <div className="relative mb-5">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ism yoki telefon raqami bo'yicha qidirish..."
              className="w-full rounded-2xlbg-gray-50 pl-10 pr-4 py-3 text-sm outline-none transition-colors focus:border-indigo-300 focus:bg-white"
            />
          </div>

          {/* Count */}
          <div className="flex items-center gap-2 mb-3">
            <p className="text-sm font-semibold text-gray-700">O'quvchi</p>
            <span className="inline-flex items-center justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-600">
              {filtered.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Inbox size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {query ? "Hech narsa topilmadi." : "Hali o'quvchilar yo'q."}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="md:hidden flex flex-col gap-2">
                {filtered.map((s) => (
                  <div key={s.id} className="bg-white rounded-2xlpx-3.5 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${paletteFor(s.id)}`}
                      >
                        {initials(s.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {s.name}
                          </p>
                          {!s.active && (
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                              Faol emas
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {s.phone}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400">
                          {formatDate(s.joinedAt)}
                        </p>
                      </div>
                    </div>
                    {s.product && (
                      <div className="mt-2.5 pt-2.5 border-t border-border flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex items-center gap-1.5 text-gray-500">
                          <GraduationCap
                            size={13}
                            className="text-gray-300 shrink-0"
                          />
                          <span className="truncate">{s.product}</span>
                        </div>
                        {s.progress !== null && (
                          <span
                            className={`shrink-0 font-semibold ${progressColor(s.progress)}`}
                          >
                            {s.progress}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-210 text-left">
                  <thead className="border-b border-border text-sm font-medium text-gray-500">
                    <tr>
                      <th className="px-5 py-4">O'quvchi</th>
                      <th className="px-5 py-4">Mahsulot</th>
                      <th className="px-5 py-4">Progress</th>
                      <th className="px-5 py-4">Joriy dars</th>
                      <th className="px-5 py-4">Tarif</th>
                      <th className="px-5 py-4">Yozilgan sana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr
                        key={s.id}
                        className="transition-colors hover:bg-indigo-50/40"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${paletteFor(s.id)}`}
                            >
                              {initials(s.name)}
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">
                                {s.name}
                              </p>
                              {!s.active && (
                                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                                  Faol emas
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {s.product ?? (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {s.progress !== null ? (
                            <span
                              className={`text-sm font-semibold ${progressColor(s.progress)}`}
                            >
                              {s.progress}%
                            </span>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500">
                          {s.currentLesson ?? (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500">
                          {s.tariff ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500">
                          {formatDate(s.joinedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
