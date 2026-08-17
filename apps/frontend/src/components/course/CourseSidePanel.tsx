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
    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-68">
      <div className="flex flex-col gap-1 rounded-2xl bg-[var(--surface-bg)] p-2 shadow-xs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab.key);
          const clickable = isTabClickable(tab.key);
          return (
            <button
              key={tab.key}
              type="button"
              disabled={!clickable}
              onClick={() => handleTabClick(tab.key)}
              className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs transition-colors ${
                active
                  ? "bg-indigo-600 text-white font-bold shadow-xs"
                  : clickable
                    ? "cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] font-semibold"
                    : "cursor-not-allowed opacity-40 text-[var(--text-muted)]"
              }`}
            >
              <Icon
                size={16}
                className={`shrink-0 ${active ? "text-white" : "text-[var(--text-muted)]"}`}
              />
              <div className="min-w-0">
                <p className={`truncate text-xs font-bold ${active ? "text-white" : "text-[var(--text-primary)]"}`}>
                  {tab.label}
                </p>
                <p className={`truncate text-[11px] font-medium mt-0.5 ${active ? "text-white/80" : "text-[var(--text-muted)]"}`}>
                  {tab.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onBackToList}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--surface-bg)] hover:bg-[var(--card-hover)] py-2.5 text-xs font-bold text-[var(--text-primary)] shadow-xs transition-colors cursor-pointer"
      >
        <ArrowLeft size={15} /> Kurslarga qaytish
      </button>
    </div>
  );
}
