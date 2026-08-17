import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search, Inbox, Star, Plus } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { StudentsSectionTabs } from "../components/students/StudentsSectionTabs";
import { formatDate } from "../utils/date";
import {
  apiListAllStudents,
  apiListEnrollments,
  apiCreateStudent,
  type ApiSchoolStudent,
  type ApiSchoolEnrollment,
} from "../api/school";
import { StudentProfileModal } from "../components/students/StudentProfileModal";
import { StudentLearningProgressModal } from "../components/students/StudentLearningProgressModal";
import { UserAvatar } from "../components/UserAvatar";
import { DataLoadingState } from "../components/DataLoadingState";
import { PaginationControls } from "../components/PaginationControls";
import { AddStudentModal } from "../components/students/AddStudentModal";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";

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
  const currentAdmin = useAuthStore((state) => state.admin);
  const canCreateStudent = currentAdmin?.role === "teacher" || currentAdmin?.role === "super";

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
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
  }, [status, page, pageSize, query, courseFilter, refreshKey]);

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
      <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
        <div className="flex min-h-full flex-col gap-3">
          {/* Top Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">{title}</h1>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
            </div>
            {canCreateStudent && (
              <button
                type="button"
                onClick={() => setShowAddStudent(true)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 cursor-pointer"
              >
                <Plus size={15} /> O'quvchi qo'shish
              </button>
            )}
          </div>

          {/* Tabs */}
          <StudentsSectionTabs counts={tabCounts} />

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-fit max-w-full">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Ism yoki telefon raqami bo'yicha qidirish..."
                className="w-[min(420px,calc(100vw-2rem))] rounded-xl bg-[var(--surface-bg)] py-2 pl-9 pr-4 text-xs font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            {status === "list" && (
              <select
                value={courseFilter}
                onChange={(event) => { setCourseFilter(event.target.value); setPage(1); }}
                className="w-[min(240px,calc(100vw-2rem))] rounded-xl bg-[var(--surface-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
                aria-label="Kurs bo'yicha filter"
              >
                <option value="">Barcha kurslar</option>
                {courseOptions.map((course) => <option key={course} value={course}>{course}</option>)}
              </select>
            )}
          </div>

          {/* Content Table / List */}
          {loading ? (
            <DataLoadingState label="O'quvchilar yuklanmoqda..." className="min-h-80" />
          ) : loadError ? (
            <div className="rounded-2xl bg-[var(--surface-bg)] py-16 text-center text-xs font-semibold text-[var(--text-muted)] shadow-xs">{loadError}</div>
          ) : status === "list" ? (
            <div className="rounded-2xl bg-[var(--surface-bg)] shadow-xs overflow-hidden">
              {enrollmentsTotal === 0 ? (
                <div className="text-center py-16 text-[var(--text-muted)]">
                  <Inbox size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-medium">
                    {query ? "Hech narsa topilmadi." : "Hali o'quvchilar yo'q."}
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="md:hidden flex flex-col divide-y divide-black/5 dark:divide-white/5">
                    {enrollmentPageItems.map((e) => (
                      <button
                        type="button"
                        onClick={() => setProgressTarget(e)}
                        key={`${e.studentId}-${e.courseId}`}
                        className="px-4 py-3 text-left transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={e.studentName} avatarUrl={e.studentAvatarUrl} className="h-9 w-9 shrink-0 rounded-full text-xs font-bold" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                                {e.studentName}
                              </p>
                              {!e.active && (
                                <span className="shrink-0 rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                                  Faol emas
                                </span>
                              )}
                            </div>
                            {e.studentTelegramName && (
                              <p className="truncate text-[11px] font-semibold text-indigo-500">tg: {e.studentTelegramName}</p>
                            )}
                            <p className="text-[11px] font-medium text-[var(--text-muted)]">{e.studentPhone ?? ""}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-medium text-[var(--text-muted)]">{e.joinedAt ? formatDate(e.joinedAt) : ""}</p>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex items-center gap-1 text-[var(--text-secondary)]">
                            <span className="truncate text-[11px] font-medium">{e.courseTitle} • {e.groupName}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {e.starsMax > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500">
                                <Star size={11} fill="currentColor" /> {e.starsEarned}/{e.starsMax}
                              </span>
                            )}
                            <span className={`text-[11px] font-bold ${progressColor(e.progressPercent)}`}>
                              {e.progressPercent}%
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left border-collapse">
                      <thead className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        <tr>
                          <th className="px-4 py-3.5">O'quvchi</th>
                          <th className="px-4 py-3.5">Kurs / guruh</th>
                          <th className="px-4 py-3.5">Tarif</th>
                          <th className="px-4 py-3.5">Progress</th>
                          <th className="px-4 py-3.5">Yulduzlar</th>
                          <th className="px-4 py-3.5">Qo'shilgan sana</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrollmentPageItems.map((e) => (
                          <tr
                            key={`${e.studentId}-${e.courseId}`}
                            onClick={() => setProgressTarget(e)}
                            className="cursor-pointer transition-colors hover:bg-[var(--card-hover)]"
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <UserAvatar name={e.studentName} avatarUrl={e.studentAvatarUrl} className="h-8.5 w-8.5 shrink-0 rounded-full text-xs font-bold" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <p className="text-xs font-bold text-[var(--text-primary)] truncate">{e.studentName}</p>
                                    {!e.active && (
                                      <span className="shrink-0 rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">Faol emas</span>
                                    )}
                                  </div>
                                  {e.studentTelegramName ? (
                                    <p className="truncate text-[11px] font-semibold text-indigo-500">tg: {e.studentTelegramName}</p>
                                  ) : (
                                    <p className="truncate text-[11px] font-medium text-[var(--text-muted)]">{e.studentPhone ?? "—"}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-xs font-semibold text-[var(--text-primary)]">
                              {e.courseTitle} <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">{e.groupName}</p>
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium text-[var(--text-secondary)]">
                              {e.planName ?? <span className="text-[var(--text-muted)]">Tarifsiz</span>}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={`text-xs font-bold ${progressColor(e.progressPercent)}`}>
                                {e.lessonsCompleted}/{e.lessonsTotal} • {e.progressPercent}%
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              {e.starsMax > 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500">
                                  <Star size={12} fill="currentColor" /> {e.starsEarned} / {e.starsMax}
                                </span>
                              ) : (
                                <span className="text-xs text-[var(--text-muted)]">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium text-[var(--text-muted)]">
                              {e.joinedAt ? formatDate(e.joinedAt) : <span className="text-[var(--text-muted)]">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3.5">
                    <PaginationControls page={page} pageCount={enrollmentPageCount} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1); }} />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--surface-bg)] shadow-xs overflow-hidden">
              {allUsersTotal === 0 ? (
                <div className="text-center py-16 text-[var(--text-muted)]">
                  <Inbox size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-medium">
                    {query ? "Hech narsa topilmadi." : "Hali foydalanuvchilar yo'q."}
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Users List */}
                  <div className="md:hidden flex flex-col divide-y divide-black/5 dark:divide-white/5">
                    {pageItems.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setProfileTarget({ id: u.id, name: u.name, telegramName: u.telegramName, phone: u.phone, avatarUrl: u.avatarUrl })}
                        className="px-4 py-3 flex items-center gap-2.5 text-left transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
                      >
                        <UserAvatar name={u.name} avatarUrl={u.avatarUrl} className="h-9 w-9 shrink-0 rounded-full text-xs font-bold" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] truncate">{u.name}</p>
                          <p className={`truncate text-[11px] mt-0.5 ${u.telegramName ? "font-semibold text-indigo-500" : "font-medium text-[var(--text-muted)]"}`}>
                            {u.telegramName ? `tg: ${u.telegramName}` : (u.phone ?? "—")}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 px-2 text-[11px] font-bold text-[var(--text-primary)]">
                            {u.productsCount} ta kurs
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Desktop Users Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left border-collapse">
                      <thead className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        <tr>
                          <th className="px-4 py-3.5">Foydalanuvchi</th>
                          <th className="px-4 py-3.5">Tizimga kirish (Telefon)</th>
                          <th className="px-4 py-3.5 text-center">Kurslar</th>
                          <th className="px-4 py-3.5 text-center">Kuratorlar</th>
                          <th className="px-4 py-3.5 text-center">Daromad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((u) => (
                          <tr
                            key={u.id}
                            onClick={() => setProfileTarget({ id: u.id, name: u.name, telegramName: u.telegramName, phone: u.phone, avatarUrl: u.avatarUrl })}
                            className="cursor-pointer transition-colors hover:bg-[var(--card-hover)]"
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} className="h-8.5 w-8.5 shrink-0 rounded-full text-xs font-bold" />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">{u.name}</p>
                                  <p className={`truncate text-[11px] mt-0.5 ${u.telegramName ? "font-semibold text-indigo-500" : "text-[var(--text-muted)]"}`}>
                                    {u.telegramName ? `tg: ${u.telegramName}` : "—"}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium text-[var(--text-muted)]">{u.phone}</td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 px-2 text-[11px] font-bold text-[var(--text-primary)]">
                                {u.productsCount}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center text-xs text-[var(--text-muted)]">—</td>
                            <td className="px-4 py-3.5 text-center text-xs font-bold text-[var(--text-primary)]">
                              {u.totalPaid > 0 ? `${u.totalPaid.toLocaleString("uz-UZ")} so'm` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3.5">
                    <PaginationControls page={page} pageCount={pageCount} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1); }} />
                  </div>
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
          onRemoved={() => {
            setPage(1);
            setRefreshKey((value) => value + 1);
            toast.success("O'quvchi maktabdan chetlashtirildi");
          }}
        />
      )}

      {showAddStudent && (
        <AddStudentModal
          onClose={() => setShowAddStudent(false)}
          onSubmit={async (input) => {
            await apiCreateStudent(input);
            setShowAddStudent(false);
            setPage(1);
            setRefreshKey((value) => value + 1);
            toast.success("O'quvchi maktabga qo'shildi");
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
