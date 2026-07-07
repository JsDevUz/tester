import {
  LayoutGrid,
  SlidersHorizontal,
  Send,
  Users,
  UserRound,
  HelpCircle,
  ListChecks,
  Brain,
  ArrowLeft,
} from "lucide-react";

interface CourseSidePanelProps {
  onBackToList: () => void;
  variant?: "full" | "lesson";
  practiceEnabled?: boolean;
  activeTab?: "content" | "practice";
  onSelectPractice?: () => void;
  onSelectContent?: () => void;
  activeFullTab?: "content" | "settings" | "launch" | "groups";
  onSelectSettings?: () => void;
  onSelectLaunch?: () => void;
  onSelectGroups?: () => void;
}

interface SideTab {
  key: string;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
}

const FULL_TABS: SideTab[] = [
  {
    key: "content",
    label: "Kontent",
    description: "Modullar, darslar va amaliyot",
    icon: LayoutGrid,
  },
  {
    key: "settings",
    label: "Sozlamalar",
    description: "Ma'lumot va moslashtirish",
    icon: SlidersHorizontal,
  },
  {
    key: "launch",
    label: "Ishga tushirish va tariflar",
    description: "Savdo va narxlar sozlamalari",
    icon: Send,
  },
  {
    key: "groups",
    label: "Guruhlar",
    description: "O'quvchilarni ajratish",
    icon: Users,
  },
  {
    key: "students",
    label: "O'quvchilar",
    description: "Statistika va taraqqiyot",
    icon: UserRound,
  },
  {
    key: "faq",
    label: "FAQ",
    description: "Shubhalarga javoblar",
    icon: HelpCircle,
  },
  {
    key: "homework",
    label: "Vazifalarni tekshirish",
    description: "Talabalardan amaliyot",
    icon: ListChecks,
  },
];

const LESSON_TABS: SideTab[] = [
  {
    key: "content",
    label: "Kontent",
    description: "Darsning kontenti",
    icon: LayoutGrid,
  },
  {
    key: "settings",
    label: "Sozlamalar",
    description: "Dizayn va parametrlar",
    icon: SlidersHorizontal,
  },
  {
    key: "practice",
    label: "Amaliyot",
    description: "Uy vazifasi",
    icon: Brain,
  },
];

export function CourseSidePanel({
  onBackToList,
  variant = "full",
  practiceEnabled = false,
  activeTab = "content",
  onSelectPractice,
  onSelectContent,
  activeFullTab = "content",
  onSelectSettings,
  onSelectLaunch,
  onSelectGroups,
}: CourseSidePanelProps) {
  const tabs = variant === "lesson" ? LESSON_TABS : FULL_TABS;

  function isTabActive(key: string): boolean {
    if (variant !== "lesson") return key === activeFullTab;
    return key === activeTab;
  }

  function isTabClickable(key: string): boolean {
    if (variant !== "lesson") {
      return key === "content" || key === "settings" || key === "launch" || key === "groups";
    }
    if (key === "content") return true;
    if (key === "practice") return practiceEnabled;
    return false;
  }

  function handleTabClick(key: string) {
    if (!isTabClickable(key)) return;
    if (key === "content") onSelectContent?.();
    if (key === "practice") onSelectPractice?.();
    if (key === "settings") onSelectSettings?.();
    if (key === "launch") onSelectLaunch?.();
    if (key === "groups") onSelectGroups?.();
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-3 sm:w-72">
      <div className="rounded-2xl bg-white p-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab.key);
          const clickable = isTabClickable(tab.key);
          return (
            <div
              key={tab.key}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => handleTabClick(tab.key)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${
                active
                  ? "bg-indigo-50 text-indigo-600"
                  : clickable
                    ? "cursor-pointer text-gray-500 hover:bg-gray-50"
                    : "cursor-not-allowed text-gray-300"
              }`}
            >
              <Icon
                size={18}
                className={`shrink-0 ${active ? "text-indigo-500" : clickable ? "text-gray-400" : "text-gray-300"}`}
              />
              <div className="min-w-0">
                <p
                  className={`truncate font-semibold ${active ? "text-indigo-600" : clickable ? "text-gray-700" : "text-gray-400"}`}
                >
                  {tab.label}
                </p>
                <p className="truncate text-xs text-gray-300">
                  {tab.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onBackToList}
        className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
      >
        <ArrowLeft size={16} /> Kurslarga qaytish
      </button>
    </div>
  );
}
