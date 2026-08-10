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
      <div className="student-responsive-panel w-full overflow-hidden">
        <div className="student-responsive-panel-section bg-white dark:bg-[#30313a] px-4 py-5 lg:p-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-zinc-100">
              Mening maktablarim
            </h1>
            <button
              type="button"
              onClick={() => setInviteOpen((open) => !open)}
              aria-label={
                inviteOpen ? "Yopish" : "Taklif havolasi bilan qo'shilish"
              }
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white transition-colors hover:bg-indigo-700 bg-indigo-600"
            >
              {inviteOpen ? <X size={18} /> : <Search size={18} />}
            </button>
          </div>

          {inviteOpen && (
            <div className="mt-4 flex items-center gap-2">
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
                className="h-11 flex-1 rounded-xl bg-gray-100 dark:bg-zinc-800 px-4 text-sm text-gray-900 dark:text-zinc-100 outline-none placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={openInvite}
                disabled={!extractInviteToken(inviteInput)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white disabled:opacity-40"
              >
                <Search size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="student-responsive-panel-section px-4 pb-5 pt-4 lg:px-5">
          {!loaded && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

          {loaded && error && (
            <div className="rounded-2xl bg-red-50 p-4 text-center">
              <p className="mb-3 text-sm text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => void loadSchools()}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Qayta urinish
            </button>
          </div>
        )}

        {loaded && !error && schools.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali hech qanday maktabga qo'shilmagansiz</p>
          </div>
        )}

        {loaded && !error && schools.length > 0 && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
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
                  className="student-course-card flex min-h-[150px] cursor-pointer flex-col rounded-3xl p-4 text-left sm:min-h-[185px] sm:p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="student-course-card-icon grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl sm:h-16 sm:w-16">
                      {school.imageUrl ? (
                        <img
                          src={school.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <BookOpen size={23} className="text-gray-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-lg font-bold leading-tight text-gray-950 dark:text-zinc-100 sm:text-xl">
                        {school.name}
                      </p>
                      <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-zinc-300">
                        <UserRound size={16} className="text-gray-700 dark:text-zinc-400" />
                        {school.studentCount}
                      </span>
                    </div>
                  </div>
                  {school.description && (
                    <>
                      <p
                        className={`mt-3 whitespace-pre-line text-sm text-gray-500 dark:text-zinc-400 ${expanded ? "" : "line-clamp-3"}`}
                      >
                        {school.description}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(school.id);
                        }}
                        className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600"
                      >
                        {expanded ? (
                          <>
                            Kamroq <ChevronUp size={14} />
                          </>
                        ) : (
                          <>
                            Ko'proq <ChevronDown size={14} />
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
