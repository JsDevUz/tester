import {
  LayoutGrid,
  SlidersHorizontal,
  Send,
  Users,
  Brain,
  ArrowLeft,
  Radio,
  BookOpen,
} from "lucide-react";

interface CourseSidePanelProps {
  onBackToList: () => void;
  variant?: "full" | "lesson";
  practiceEnabled?: boolean;
  activeTab?: "content" | "settings" | "practice";
  onSelectPractice?: () => void;
  onSelectContent?: () => void;
  activeFullTab?: "content" | "settings" | "launch" | "groups" | "classes" | "challenges";
  onSelectSettings?: () => void;
  onSelectLaunch?: () => void;
  onSelectGroups?: () => void;
  onSelectClasses?: () => void;
  onSelectChallenges?: () => void;
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
    label: "Tariflar",
    description: "Narxlar sozlamalari",
    icon: Send,
  },
  {
    key: "groups",
    label: "Guruhlar",
    description: "O'quvchilarni ajratish",
    icon: Users,
  },
  {
    key: "classes",
    label: "Jonli darslar",
    description: "Tarix va davomat",
    icon: Radio,
  },
  {
    key: "challenges",
    label: "Challenges",
    description: "Kitobxonlik musobaqalari",
    icon: BookOpen,
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
  onSelectClasses,
  onSelectChallenges,
}: CourseSidePanelProps) {
  const tabs = variant === "lesson" ? LESSON_TABS : FULL_TABS;

  function isTabActive(key: string): boolean {
    if (variant !== "lesson") return key === activeFullTab;
    return key === activeTab;
  }

  function isTabClickable(key: string): boolean {
    if (variant !== "lesson") {
      return (
        key === "content" ||
        key === "settings" ||
        key === "launch" ||
        key === "groups" ||
        key === "classes" ||
        key === "challenges"
      );
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
    if (key === "classes") onSelectClasses?.();
    if (key === "challenges") onSelectChallenges?.();
  }

  return (
    <div className="sticky top-6 self-start flex w-full shrink-0 flex-col gap-2 sm:w-72">
      <div className="flex flex-col gap-1.5 rounded-2xl bg-white p-2">
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
              className={`flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm ${active
                  ? "bg-gray-100 text-gray-900"
                  : clickable
                    ? "cursor-pointer text-gray-500 hover:bg-gray-50"
                    : "cursor-not-allowed text-gray-300"
                }`}
            >
              <Icon
                size={18}
                className={`shrink-0 ${active ? "text-gray-900" : clickable ? "text-gray-400" : "text-gray-300"}`}
              />
              <div className="min-w-0">
                <p
                  className={`truncate font-semibold ${active ? "text-gray-900" : clickable ? "text-gray-700" : "text-gray-400"}`}
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
        className="flex items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-gray-800"
      >
        <ArrowLeft size={16} /> Kurslarga qaytish
      </button>
    </div>
  );
}
