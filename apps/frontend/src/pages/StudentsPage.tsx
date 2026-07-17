import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search, Inbox, Star } from "lucide-react";
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
import { StudentLearningProgressModal } from "../components/students/StudentLearningProgressModal";
import { UserAvatar } from "../components/UserAvatar";
import { DataLoadingState } from "../components/DataLoadingState";
import { PaginationControls } from "../components/PaginationControls";

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
  "bg-gray-200 text-gray-700",
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

type SectionStatus = "all" | "list";

function statusForPath(pathname: string): SectionStatus {
  if (pathname.startsWith("/students/list") || pathname.startsWith("/students/pending")) return "list";
  return "all";
}

export function StudentsPage() {
  const location = useLocation();
  const status = statusForPath(location.pathname);

  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [allUsers, setAllUsers] = useState<ApiSchoolStudent[]>([]);
  const [allUsersTotal, setAllUsersTotal] = useState(0);
  const [enrollments, setEnrollments] = useState<ApiSchoolEnrollment[]>([]);
  const [enrollmentsTotal, setEnrollmentsTotal] = useState(0);
  const [courseOptions, setCourseOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileTarget, setProfileTarget] = useState<{ id: string; name: string; telegramName: string | null; phone: string | null; avatarUrl: string | null } | null>(null);
  const [progressTarget, setProgressTarget] = useState<ApiSchoolEnrollment | null>(null);

  useEffect(() => {
    setQuery("");
    setCourseFilter("");
    setPage(1);
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    const offset = (page - 1) * pageSize;
    setLoading(true);
    setLoadError(null);

    const request = status === "all"
      ? Promise.all([
          apiListAllStudents(pageSize, offset, query),
          apiListEnrollments(1, 0),
        ]).then(([result, enrollmentMeta]) => {
          if (cancelled) return;
          setAllUsers(result.items);
          setAllUsersTotal(result.total);
          setEnrollmentsTotal(enrollmentMeta.total);
        })
      : Promise.all([
          apiListEnrollments(pageSize, offset, query, courseFilter),
          apiListAllStudents(1, 0),
          apiListEnrollments(100, 0),
        ]).then(([result, allUsersMeta, courseCatalog]) => {
          if (cancelled) return;
          setEnrollments(result.items);
          setEnrollmentsTotal(result.total);
          setAllUsersTotal(allUsersMeta.total);
          setCourseOptions(Array.from(new Set(courseCatalog.items.map((enrollment) => enrollment.courseTitle))).sort());
        });

    void request
      .catch(() => {
        if (!cancelled) setLoadError("O'quvchilarni yuklab bo'lmadi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, page, pageSize, query, courseFilter]);

  const pageCount = Math.max(1, Math.ceil(allUsersTotal / pageSize));
  const pageItems = allUsers;
  const enrollmentPageCount = Math.max(1, Math.ceil(enrollmentsTotal / pageSize));
  const enrollmentPageItems = enrollments;

  function handleSearch(value: string) {
    setQuery(value);
    setPage(1);
  }

  const tabCounts = {
    "/students": allUsersTotal,
    "/students/list": enrollmentsTotal,
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

          <div className="flex flex-wrap items-center gap-2">
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
            {status === "list" && (
              <select
                value={courseFilter}
                onChange={(event) => { setCourseFilter(event.target.value); setPage(1); }}
                className="w-[min(280px,calc(100vw-2rem))] rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 outline-none"
                aria-label="Kurs bo'yicha filter"
              >
                <option value="">Barcha kurslar</option>
                {courseOptions.map((course) => <option key={course} value={course}>{course}</option>)}
              </select>
            )}
          </div>

          {status === "list" && (
            <select
              value={courseFilter}
              onChange={(event) => { setCourseFilter(event.target.value); setPage(1); }}
              className="w-[min(560px,calc(100vw-2rem))] rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 outline-none"
              aria-label="Kurs bo'yicha filter"
            >
              <option value="">Barcha kurslar</option>
              {courseOptions.map((course) => <option key={course} value={course}>{course}</option>)}
            </select>
          )}

          {loading ? (
            <DataLoadingState label="O'quvchilar yuklanmoqda..." className="min-h-80" />
          ) : loadError ? (
            <div className="rounded-2xl bg-white py-16 text-center text-sm text-gray-400">{loadError}</div>
          ) : status === "list" ? (
            <div className="rounded-2xl bg-white">
              {enrollmentsTotal === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Inbox size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {query ? "Hech narsa topilmadi." : "Hali o'quvchilar yo'q."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="md:hidden flex flex-col gap-2">
                    {enrollmentPageItems.map((e) => (
                      <button type="button" onClick={() => setProgressTarget(e)} key={`${e.studentId}-${e.courseId}`} className="bg-white rounded-2xl px-3.5 py-3 text-left transition-colors hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={e.studentName} avatarUrl={e.studentAvatarUrl} className={`h-10 w-10 rounded-full text-sm font-bold ${paletteFor(e.studentId)}`} />
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
                            {e.studentTelegramName && (
                              <p className="truncate text-xs font-medium text-indigo-500">tg: {e.studentTelegramName}</p>
                            )}
                            <p className="text-xs text-gray-400">{e.studentPhone ?? ""}</p>
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
                      </button>
                    ))}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-210 text-left">
                      <thead className="text-sm font-medium text-gray-700">
                        <tr>
                          <th className="px-5 py-4">O'quvchi</th>
                          <th className="px-5 py-4">Kurs / guruh</th>
                          <th className="px-5 py-4">Tarif</th>
                          <th className="px-5 py-4">Progress</th>
                          <th className="px-5 py-4">Yulduzlar</th>
                          <th className="px-5 py-4">Qo'shilgan sana</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrollmentPageItems.map((e) => (
                          <tr key={`${e.studentId}-${e.courseId}`} onClick={() => setProgressTarget(e)} className="cursor-pointer transition-colors hover:bg-gray-50 rounded-2xl min-h-17.5">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <UserAvatar name={e.studentName} avatarUrl={e.studentAvatarUrl} className={`h-9 w-9 rounded-full text-xs font-bold ${paletteFor(e.studentId)}`} />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{e.studentName}</p>
                                    {!e.active && (
                                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">Faol emas</span>
                                    )}
                                  </div>
                                  {e.studentTelegramName && (
                                    <p className="truncate text-xs font-medium text-indigo-500">tg: {e.studentTelegramName}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-600">
                              {e.courseTitle} <span className="text-gray-400">• {e.groupName}</span>
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-600">
                              {e.planName ?? <span className="text-gray-300">Tarifsiz</span>}
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

                  <PaginationControls page={page} pageCount={enrollmentPageCount} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1); }} />
                </>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-white">
              {allUsersTotal === 0 ? (
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
                        onClick={() => setProfileTarget({ id: u.id, name: u.name, telegramName: u.telegramName, phone: u.phone, avatarUrl: u.avatarUrl })}
                        className="bg-white rounded-2xl px-3.5 py-3 flex items-center gap-3 text-left transition-colors hover:bg-gray-50"
                      >
                        <UserAvatar name={u.name} avatarUrl={u.avatarUrl} className={`h-10 w-10 rounded-full text-sm font-bold ${paletteFor(u.id)}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                          <p className={`truncate text-xs mt-0.5 ${u.telegramName ? "font-medium text-indigo-500" : "text-gray-400"}`}>
                            {u.telegramName ? `tg: ${u.telegramName}` : "—"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="student-course-count-badge inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold">
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
                            onClick={() => setProfileTarget({ id: u.id, name: u.name, telegramName: u.telegramName, phone: u.phone, avatarUrl: u.avatarUrl })}
                            className="cursor-pointer transition-colors hover:bg-gray-50 rounded-2xl min-h-17.5"
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} className={`h-9 w-9 rounded-full text-xs font-bold ${paletteFor(u.id)}`} />
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                                  <p className={`truncate text-xs mt-0.5 ${u.telegramName ? "font-medium text-indigo-500" : "text-gray-400"}`}>
                                    {u.telegramName ? `tg: ${u.telegramName}` : "—"}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-500">{u.phone}</td>
                            <td className="px-5 py-4 text-center">
                              {u.productsCount > 0 ? (
                                <span className="student-course-count-badge student-course-count-badge--active inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold">
                                  {u.productsCount}
                                </span>
                              ) : (
                                <span className="student-course-count-badge inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold">
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

                  <PaginationControls page={page} pageCount={pageCount} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1); }} />
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
          studentTelegramName={profileTarget.telegramName}
          studentPhone={profileTarget.phone}
          studentAvatarUrl={profileTarget.avatarUrl}
          onClose={() => setProfileTarget(null)}
          onEnrolled={() => setPage(1)}
          onNameUpdated={(name) => {
            setProfileTarget((current) => current ? { ...current, name } : current);
            setAllUsers((users) => users.map((user) => user.id === profileTarget.id ? { ...user, name } : user));
          }}
        />
      )}
      {progressTarget && (
        <StudentLearningProgressModal
          studentId={progressTarget.studentId}
          courseId={progressTarget.courseId}
          onClose={() => setProgressTarget(null)}
        />
      )}
    </AppShell>
  );
}
