import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CreditCard,
  ClipboardList,
  Users,
  School,
  Settings,
  ShieldCheck,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../stores/authStore";

interface NavSection {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
}

const SECTIONS: NavSection[] = [
  { key: "lessons", label: "Darslar", icon: BookOpen, path: "/lessons" },
  { key: "payments", label: "To'lovlar", icon: CreditCard, path: "/payments" },
  { key: "practice", label: "Amaliyotlar", icon: ClipboardList, path: "/" },
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

  const activeSection = SECTIONS.find((section) =>
    isRouteMatch(location.pathname, section.path),
  );
  const initial = admin?.name?.trim()?.[0]?.toUpperCase() ?? "?";

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div
      className="flex flex-col lg:flex-row gap-3 bg-[#f6f6f6] p-3 lg:relative"
      style={{
        height: "100dvh",
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="order-2 lg:order-1 shrink-0 bg-gray-900 rounded-2xl flex flex-row lg:flex-col items-center justify-between lg:justify-start px-2 lg:px-0 lg:py-4 lg:w-16 h-16 lg:h-auto lg:z-10">
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

        <nav className="flex flex-row lg:flex-col gap-1 flex-1 lg:w-full lg:px-2 justify-around lg:justify-start">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection?.key === section.key;
            return (
              <button
                key={section.key}
                aria-label={section.label}
                onClick={() => navigate(section.path)}
                className={`group relative w-11 h-11 lg:w-full lg:aspect-square lg:h-auto rounded-xl flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                  isActive
                    ? "bg-white text-indigo-600"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {isActive && (
                  <span className="hidden lg:block absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-indigo-400" />
                )}
                {isActive && (
                  <span className="lg:hidden absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400" />
                )}
                <Icon size={20} />
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-gray-900/15 transition-all duration-150 group-hover:translate-x-1 group-hover:opacity-100 lg:block">
                  {section.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="hidden lg:flex flex-col w-full px-2 gap-1 mb-2">
          {admin?.role === "super" && (
            <button
              onClick={() => navigate("/admins")}
              aria-label="Adminlar"
              className="group relative w-full aspect-square rounded-xl flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
            >
              <ShieldCheck size={20} />
              <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-gray-900/15 transition-all duration-150 group-hover:translate-x-1 group-hover:opacity-100 lg:block">
                Adminlar
              </span>
            </button>
          )}
          <button
            onClick={handleLogout}
            aria-label="Chiqish"
            className="group relative w-full aspect-square rounded-xl flex items-center justify-center text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          >
            <LogOut size={20} />
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-gray-900/15 transition-all duration-150 group-hover:translate-x-1 group-hover:opacity-100 lg:block">
              Chiqish
            </span>
          </button>
        </div>

        <button
          type="button"
          aria-disabled="true"
          aria-label="Sozlamalar"
          className="group relative hidden lg:flex w-full aspect-square rounded-xl items-center justify-center text-gray-600 cursor-not-allowed mb-2 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        >
          <Settings size={20} />
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-gray-900/15 transition-all duration-150 group-hover:translate-x-1 group-hover:opacity-100 lg:block">
            Sozlamalar
          </span>
        </button>

        <button
          onClick={() => setProfileOpen(true)}
          aria-label={admin?.name ?? "Profil"}
          className="group relative w-9 h-9 lg:w-9 lg:h-9 rounded-full bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center shrink-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        >
          {initial}
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-gray-900/15 transition-all duration-150 group-hover:translate-x-1 group-hover:opacity-100 lg:block">
            {admin?.name ?? "Profil"}
          </span>
        </button>
      </div>

      <div className="order-1 lg:order-3 flex-1 min-w-0 min-h-0 bg-gray-100 rounded-2xl overflow-y-auto">
        {children}
      </div>

      {profileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setProfileOpen(false)}
          />
          <div className="fixed z-50 bottom-3 left-3 right-3 rounded-2xl bg-white p-4 shadow-2xl shadow-gray-900/15 lg:bottom-16 lg:left-3 lg:right-auto lg:w-64">
            <div className="flex items-center gap-2.5 px-1 mb-3 pb-3 border-b border-border">
              <div className="w-9 h-9 rounded-full bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {admin?.name}
                </p>
                {admin?.phone && (
                  <p className="text-xs text-gray-400 truncate">
                    {admin.phone}
                  </p>
                )}
              </div>
            </div>
            <div className="lg:hidden flex flex-col gap-1">
              {admin?.role === "super" && (
                <button
                  onClick={() => {
                    navigate("/admins");
                    setProfileOpen(false);
                  }}
                  className="flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <ShieldCheck size={17} className="text-gray-400 shrink-0" />
                  Adminlar
                </button>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={17} className="shrink-0" />
                Chiqish
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
