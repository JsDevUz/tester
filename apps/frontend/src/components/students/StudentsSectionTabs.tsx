import { useLocation, useNavigate } from "react-router-dom";

const TABS = [
  { label: "Barchasi", path: "/students" },
  { label: "O'quvchilar", path: "/students/list" },
];

function isActive(pathname: string, path: string) {
  if (path === "/students") return pathname === "/students";
  return pathname === path || pathname.startsWith(path + "/");
}

interface StudentsSectionTabsProps {
  counts?: Partial<Record<string, number>>;
}

export function StudentsSectionTabs({ counts }: StudentsSectionTabsProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="w-fit max-w-full overflow-x-auto rounded-2xl bg-[var(--card-bg)] p-1">
      <div className="flex w-max gap-1">
        {TABS.map((tab) => {
          const active = isActive(location.pathname, tab.path);
          const count = counts?.[tab.path];
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs transition-all cursor-pointer ${
                active
                  ? "bg-[var(--surface-bg)] text-[var(--text-primary)] font-bold shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] font-semibold"
              }`}
            >
              <span>{tab.label}</span>
              {count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active
                    ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                    : "bg-black/5 dark:bg-white/10 text-[var(--text-muted)]"
                }`}>
                  {count.toLocaleString("uz-UZ")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
