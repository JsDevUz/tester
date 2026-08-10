import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CreditCard,
  ClipboardList,
  Users,
  School,
  MessageCircle,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { usePracticeMessengerStore } from "../stores/practiceMessengerStore";
import { usePracticeMessengerNotifications } from "../hooks/usePracticeMessengerNotifications";
import { UserAvatar } from "./UserAvatar";
import { SettingsModal } from "./SettingsModal";

interface NavSection {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
}

const SECTIONS: NavSection[] = [
  { key: "boards", label: "Doskalar", icon: Presentation, path: "/boards" },
  { key: "lessons", label: "Darslar", icon: BookOpen, path: "/lessons" },
  { key: "payments", label: "To'lovlar", icon: CreditCard, path: "/payments" },
  { key: "practice", label: "Amaliyotlar", icon: ClipboardList, path: "/" },
  {
    key: "messenger",
    label: "Messenger",
    icon: MessageCircle,
    path: "/messenger",
  },
  { key: "students", label: "O'quvchilar", icon: Users, path: "/students" },
  { key: "school", label: "Mening Maktabim", icon: School, path: "/school" },
];

function isRouteMatch(pathname: string, path: string) {
  if (path === "/") {
    return (
      pathname === "/" ||
      pathname.startsWith("/folders/") ||
      pathname.startsWith("/tests/") ||
      pathname.startsWith("/submissions/") ||
      pathname.startsWith("/live")
    );
  }
  if (path === "/boards") {
    return pathname === "/boards" || pathname.startsWith("/boards/");
  }
  if (path === "/students") {
    return pathname === "/students" || pathname.startsWith("/students/");
  }
  if (path === "/school") {
    return pathname === "/school" || pathname.startsWith("/school/");
  }
  return pathname === path || pathname.startsWith(path + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, logout } = useAuthStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const hasUnreadMessages = usePracticeMessengerStore(
    (s) => s.unreadChatIds.size > 0,
  );
  usePracticeMessengerNotifications();

  const visibleSections =
    admin?.role === "curator"
      ? SECTIONS.filter(
        (section) =>
          section.key === "students" || section.key === "messenger",
      )
      : SECTIONS;

  const activeSection = visibleSections.find((section) =>
    isRouteMatch(location.pathname, section.path),
  );

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div
      className="flex flex-col gap-2 bg-[#f1f5f9] p-3 lg:relative lg:flex-row"
      style={{
        height: "100dvh",
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="order-2 lg:order-1 shrink-0 bg-gray-900 rounded-2xl flex flex-row lg:flex-col items-center justify-around lg:justify-start px-2 lg:px-0 lg:py-4 lg:w-16 h-16 lg:h-auto lg:z-10">
        <button
          onClick={() => navigate("/")}
          className="hidden lg:block mb-6 shrink-0"
        >
          <img
            src="/favicon.png"
            alt="Logo"
            className="w-9 h-9 rounded-xl object-cover"
          />
        </button>

        <nav className="contents lg:flex lg:flex-1 lg:w-full lg:flex-col lg:justify-start lg:gap-1 lg:px-2">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection?.key === section.key;
            return (
              <button
                key={section.key}
                aria-label={section.label}
                onClick={() => navigate(section.path)}
                className={`group relative w-11 h-11 lg:w-full lg:aspect-square lg:h-auto rounded-xl flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${isActive
                    ? "bg-white text-gray-900"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
              >
                {isActive && (
                  <span className="hidden lg:block absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-gray-900" />
                )}
                {isActive && (
                  <span className="lg:hidden absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gray-900" />
                )}
                <Icon size={20} />
                {section.key === "messenger" && hasUnreadMessages && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 lg:right-2.5 lg:top-2.5" />
                )}
                <span className="app-shell-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium opacity-0 shadow-lg shadow-gray-900/15 transition-all duration-150 group-hover:translate-x-1 group-hover:opacity-100 lg:block">
                  {section.label}
                </span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => setProfileOpen(true)}
          aria-label={admin?.name ?? "Profil"}
          className="group relative w-9 h-9 lg:w-9 lg:h-9 rounded-full bg-gray-900 text-white text-sm font-semibold flex items-center justify-center shrink-0 overflow-hidden focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        >
          <UserAvatar
            name={admin?.name}
            avatarUrl={admin?.avatarUrl}
            className="h-full w-full rounded-full"
          />
          <span className="app-shell-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium opacity-0 shadow-lg shadow-gray-900/15 transition-all duration-150 group-hover:translate-x-1 group-hover:opacity-100 lg:block">
            {admin?.name ?? "Profil"}
          </span>
        </button>
      </div>

      <div className="order-1 lg:order-3 flex-1 min-w-0 min-h-0 bg-[#f1f5f9] rounded-2xl overflow-y-auto">
        {children}
      </div>

      {profileOpen && (
        <SettingsModal
          admin={admin}
          onClose={() => setProfileOpen(false)}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
