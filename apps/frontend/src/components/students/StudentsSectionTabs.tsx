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
    <div className="w-fit max-w-full overflow-x-auto rounded-2xl bg-gray-50 p-1">
      <div className="flex w-max gap-1.5">
        {TABS.map((tab) => {
          const active = isActive(location.pathname, tab.path);
          const count = counts?.[tab.path];
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? "students-tab-active"
                  : "text-gray-900 hover:bg-white/60"
              }`}
            >
              <span>
                {tab.label}
                {count !== undefined && ` (${count.toLocaleString("uz-UZ")})`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
