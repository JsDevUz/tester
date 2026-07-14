import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search, Inbox, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { StudentsSectionTabs } from "../components/students/StudentsSectionTabs";
import { formatDate } from "../utils/date";
import {
  apiListAllStudents,
  apiListEnrollments,
  type ApiSchoolStudent,
  type ApiSchoolEnrollment,
} from "../api/school";
import { StudentProfileModal } from "../components/students/StudentProfileModal";

export interface StudentRow {
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

// TODO: mock data — AddStudentToGroupModal hali shundan foydalanadi, /school/students/search ga o'tganda olib tashlanadi
export const MOCK_STUDENTS: StudentRow[] = [
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
];

function progressColor(pct: number) {
  if (pct >= 70) return "text-green-500";
  if (pct >= 30) return "text-amber-500";
  return "text-gray-400";
}

const PAGE_SIZE = 7;

type SectionStatus = "all" | "list";

function statusForPath(pathname: string): SectionStatus {
  if (pathname.startsWith("/students/list") || pathname.startsWith("/students/pending")) return "list";
  return "all";
}

export function StudentsPage() {
  const location = useLocation();
  const status = statusForPath(location.pathname);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [allUsers, setAllUsers] = useState<ApiSchoolStudent[]>([]);
  const [enrollments, setEnrollments] = useState<ApiSchoolEnrollment[]>([]);
  const [profileTarget, setProfileTarget] = useState<{ id: string; name: string; phone: string | null } | null>(null);

  function refreshAllUsers() {
    return apiListAllStudents().then(setAllUsers);
  }

  useEffect(() => {
    if (status === "all") {
      void refreshAllUsers();
    } else if (status === "list") {
      void apiListEnrollments().then(setEnrollments);
    }
  }, [status]);

  useEffect(() => {
    setQuery("");
    setPage(1);
  }, [status]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.phone ?? "").includes(q),
    );
  }, [query, allUsers]);

  const filteredEnrollments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enrollments;
    return enrollments.filter(
      (e) =>
        e.studentName.toLowerCase().includes(q) ||
        (e.studentPhone ?? "").includes(q) ||
        e.courseTitle.toLowerCase().includes(q),
    );
  }, [query, enrollments]);

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function handleSearch(value: string) {
    setQuery(value);
    setPage(1);
  }

  const tabCounts = {
    "/students": allUsers.length,
    "/students/list": allUsers.length,
  };

  const title = status === "list" ? "O'quvchilar" : "Barcha maktab foydalanuvchilari";

  const subtitle =
    status === "list"
      ? "Kurslaringizda tahsil olayotgan o'quvchilar haqida to'liq ma'lumot"
      : "Maktabingiz foydalanuvchilari haqida to'liq ma'lumot";

  return (
    <AppShell>
      <div className="min-h-screen p-3 sm:p-4">
        <div className="flex min-h-full flex-col gap-3">
          <div className="rounded-2xl bg-white p-4">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">
              {title}
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              {subtitle}
            </p>
          </div>

          <StudentsSectionTabs counts={tabCounts} />

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

          {status === "list" ? (
            <div className="rounded-2xl bg-white">
              {filteredEnrollments.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Inbox size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {query ? "Hech narsa topilmadi." : "Hali o'quvchilar yo'q."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="md:hidden flex flex-col gap-2">
                    {filteredEnrollments.map((e) => (
                      <div key={`${e.studentId}-${e.courseId}`} className="bg-white rounded-2xl px-3.5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${paletteFor(e.studentId)}`}
                          >
                            {initials(e.studentName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">
                                {e.studentName}
                              </p>
                              {!e.active && (
                                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                                  Faol emas
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{e.studentPhone ?? ""}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-400">{e.joinedAt ? formatDate(e.joinedAt) : ""}</p>
                          </div>
                        </div>
                        <div className="mt-2.5 pt-2.5 border-t border-border flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex items-center gap-1.5 text-gray-500">
                            <span className="truncate">{e.courseTitle} • {e.groupName}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {e.starsMax > 0 && (
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-500">
                                <Star size={12} fill="currentColor" /> {e.starsEarned}/{e.starsMax}
                              </span>
                            )}
                            <span className={`font-semibold ${progressColor(e.progressPercent)}`}>
                              {e.progressPercent}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-210 text-left">
                      <thead className="text-sm font-medium text-gray-700">
                        <tr>
                          <th className="px-5 py-4">O'quvchi</th>
                          <th className="px-5 py-4">Kurs / guruh</th>
                          <th className="px-5 py-4">Progress</th>
                          <th className="px-5 py-4">Yulduzlar</th>
                          <th className="px-5 py-4">Qo'shilgan sana</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEnrollments.map((e) => (
                          <tr key={`${e.studentId}-${e.courseId}`} className="transition-colors hover:bg-indigo-50/40 rounded-2xl min-h-17.5">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${paletteFor(e.studentId)}`}
                                >
                                  {initials(e.studentName)}
                                </div>
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 truncate">
                                    {e.studentName}
                                  </p>
                                  {!e.active && (
                                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                                      Faol emas
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-600">
                              {e.courseTitle} <span className="text-gray-400">• {e.groupName}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`text-sm font-semibold ${progressColor(e.progressPercent)}`}>
                                {e.lessonsCompleted}/{e.lessonsTotal} • {e.progressPercent}%
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              {e.starsMax > 0 ? (
                                <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-500">
                                  <Star size={13} fill="currentColor" /> {e.starsEarned} / {e.starsMax}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-500">
                              {e.joinedAt ? formatDate(e.joinedAt) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-white">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Inbox size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {query ? "Hech narsa topilmadi." : "Hali foydalanuvchilar yo'q."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="md:hidden flex flex-col gap-2">
                    {pageItems.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setProfileTarget({ id: u.id, name: u.name, phone: u.phone })}
                        className="bg-white rounded-2xl px-3.5 py-3 flex items-center gap-3 text-left transition-colors hover:bg-indigo-50/40"
                      >
                        <div
                          className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${paletteFor(u.id)}`}
                        >
                          {initials(u.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">—</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center justify-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-500">
                            {u.productsCount}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-210 text-left">
                      <thead className="text-sm font-medium text-gray-700">
                        <tr>
                          <th className="px-5 py-4">Foydalanuvchi</th>
                          <th className="px-5 py-4">Tizimga kirish</th>
                          <th className="px-5 py-4 text-center">Kurslar</th>
                          <th className="px-5 py-4 text-center">Kuratorlar</th>
                          <th className="px-5 py-4 text-center">Daromad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((u) => (
                          <tr
                            key={u.id}
                            onClick={() => setProfileTarget({ id: u.id, name: u.name, phone: u.phone })}
                            className="cursor-pointer transition-colors hover:bg-indigo-50/40 rounded-2xl min-h-17.5"
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${paletteFor(u.id)}`}
                                >
                                  {initials(u.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">—</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-500">{u.phone}</td>
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
                            <td className="px-5 py-4 text-center text-sm text-gray-300">—</td>
                            <td className="px-5 py-4 text-center text-sm text-gray-500">
                              {u.totalPaid > 0 ? u.totalPaid.toLocaleString("uz-UZ") : "—"}
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
                      {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
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
                      ))}
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
          )}
        </div>
      </div>

      {profileTarget && (
        <StudentProfileModal
          studentId={profileTarget.id}
          studentName={profileTarget.name}
          studentPhone={profileTarget.phone}
          onClose={() => setProfileTarget(null)}
          onEnrolled={() => void refreshAllUsers()}
        />
      )}
    </AppShell>
  );
}
