import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { StudentActiveBanners } from "../components/student/StudentActiveBanners";
import { useStudentSchoolStore } from "../stores/studentSchoolStore";

export function SchoolsListPage() {
  const navigate = useNavigate();
  const { schools, loaded, error, loadSchools, selectSchool } =
    useStudentSchoolStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState("");

  function toggleExpanded(schoolId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(schoolId)) next.delete(schoolId);
      else next.add(schoolId);
      return next;
    });
  }

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  // Accepts either a full /school-invite/<token> link (what a school shares)
  // or the bare token pasted on its own.
  function extractInviteToken(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/\/school-invite\/([^/?#\s]+)/);
    if (match) return match[1];
    if (/^[A-Za-z0-9-]+$/.test(trimmed)) return trimmed;
    return null;
  }

  function openInvite() {
    const inviteToken = extractInviteToken(inviteInput);
    if (!inviteToken) return;
    setInviteInput("");
    setInviteOpen(false);
    navigate(`/school-invite/${inviteToken}`);
  }

  function openSchool(schoolId: string) {
    selectSchool(schoolId);
    navigate(`/schools/${schoolId}/courses`);
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel w-full overflow-hidden rounded-3xl">
        <div className="student-responsive-panel-section px-4 py-5 lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              Mening maktablarim
            </h1>
            <button
              type="button"
              onClick={() => setInviteOpen((open) => !open)}
              aria-label={
                inviteOpen ? "Yopish" : "Taklif havolasi bilan qo'shilish"
              }
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white transition-colors hover:bg-indigo-700 bg-indigo-600 shadow-xs cursor-pointer"
            >
              {inviteOpen ? <X size={18} /> : <Search size={18} />}
            </button>
          </div>

          {inviteOpen && (
            <div className="mt-4 flex items-center gap-2.5">
              <input
                autoFocus
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openInvite();
                }}
                placeholder="Taklif havolasi yoki kodi"
                autoCapitalize="none"
                autoCorrect="off"
                className="h-11 flex-1 rounded-xl bg-white dark:bg-black/30 border border-black/10 dark:border-white/10 px-4 text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs placeholder:text-[var(--text-muted)] transition-all"
              />
              <button
                type="button"
                onClick={openInvite}
                disabled={!extractInviteToken(inviteInput)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Search size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pt-2 lg:px-6">
          <StudentActiveBanners />
        </div>

        <div className="student-responsive-panel-section px-4 pb-6 pt-4 lg:px-6">
          {!loaded && (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-black/10 dark:border-white/15 border-t-indigo-600" />
            </div>
          )}

          {loaded && error && (
            <div className="rounded-2xl bg-red-500/10 p-5 text-center">
              <p className="mb-3 text-xs font-semibold text-red-500">{error}</p>
              <button
                type="button"
                onClick={() => void loadSchools()}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 cursor-pointer shadow-xs"
              >
                Qayta urinish
              </button>
            </div>
          )}

          {loaded && !error && schools.length === 0 && (
            <div className="py-16 text-center text-[var(--text-muted)]">
              <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-xs font-semibold">Hali hech qanday maktabga qo'shilmagansiz</p>
            </div>
          )}

          {loaded && !error && schools.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {schools.map((school) => {
                const expanded = expandedIds.has(school.id);
                return (
                  <div
                    key={school.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSchool(school.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        openSchool(school.id);
                    }}
                    className="student-course-card glass-card flex min-h-[140px] cursor-pointer flex-col rounded-3xl p-5 text-left hover:bg-[var(--card-hover)] transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3.5">
                      <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-black/5 dark:bg-white/5">
                        {school.imageUrl ? (
                          <img
                            src={school.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <BookOpen size={20} className="text-[var(--text-muted)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-bold leading-tight text-[var(--text-primary)]">
                          {school.name}
                        </p>
                        <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                          <UserRound size={13} className="text-[var(--text-muted)]" />
                          {school.studentCount} o'quvchi
                        </span>
                      </div>
                    </div>
                    {school.description && (
                      <>
                        <p
                          className={`mt-3 whitespace-pre-line text-xs font-normal text-[var(--text-secondary)] ${expanded ? "" : "line-clamp-3"}`}
                        >
                          {school.description}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(school.id);
                          }}
                          className="mt-1.5 inline-flex w-fit items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          {expanded ? (
                            <>
                              Kamroq <ChevronUp size={13} />
                            </>
                          ) : (
                            <>
                              Ko'proq <ChevronDown size={13} />
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </StudentShell>
  );
}
