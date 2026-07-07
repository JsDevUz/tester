import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CreditCard,
  ClipboardList,
  Users,
  School,
  Settings,
  FileText,
  Radio,
  UsersRound,
  Clock3,
  ShieldCheck,
  LogOut,
  X,
  SlidersHorizontal,
  Link2,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../stores/authStore";

interface SubItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

interface NavSection {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  subItems?: SubItem[];
}

const SECTIONS: NavSection[] = [
  { key: "lessons", label: "Darslar", icon: BookOpen, path: "/lessons" },
  { key: "payments", label: "To'lovlar", icon: CreditCard, path: "/payments" },
  {
    key: "practice",
    label: "Amaliyotlar",
    icon: ClipboardList,
    path: "/",
    subItems: [
      { label: "Testlar", path: "/", icon: FileText },
      { label: "Jonli musobaqa", path: "/live", icon: Radio },
    ],
  },
  {
    key: "students",
    label: "O'quvchilar",
    icon: Users,
    path: "/students",
    subItems: [
      { label: "Barchasi", path: "/students", icon: UsersRound },
      { label: "O'quvchilar", path: "/students/list", icon: Users },
      {
        label: "Ruxsat kutayotganlar",
        path: "/students/pending",
        icon: Clock3,
      },
    ],
  },
  {
    key: "school",
    label: "Mening Maktabim",
    icon: School,
    path: "/school/settings",
    subItems: [
      { label: "Maktab sozlamalari", path: "/school/settings", icon: SlidersHorizontal },
      { label: "Mening xodimlarim", path: "/school/staff", icon: UsersRound },
      { label: "Ro'yxatdan o'tish", path: "/school/invite", icon: Link2 },
    ],
  },
];

function isRouteMatch(pathname: string, path: string) {
  if (path === "/") {
    return (
      pathname === "/" ||
      pathname.startsWith("/folders/") ||
      pathname.startsWith("/tests/") ||
      pathname.startsWith("/submissions/")
    );
  }
  if (path === "/students") {
    return pathname === "/students";
  }
  return pathname === path || pathname.startsWith(path + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, logout } = useAuthStore();

  const activeSection = SECTIONS.find((s) =>
    s.subItems
      ? s.subItems.some((si) => isRouteMatch(location.pathname, si.path))
      : isRouteMatch(location.pathname, s.path),
  );
  const activeSubItemPath = activeSection?.subItems
    ?.filter((item) => isRouteMatch(location.pathname, item.path))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileShownSection = openKey
    ? SECTIONS.find((s) => s.key === openKey)
    : undefined;
  const desktopFlyoutKey = hoveredKey ?? openKey;

  const initial = admin?.name?.trim()?.[0]?.toUpperCase() ?? "?";

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function clearHoverCloseTimer() {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }

  function handleNavMouseEnter(key: string) {
    clearHoverCloseTimer();
    setHoveredKey(key);
  }

  function handleNavMouseLeave(key: string) {
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = setTimeout(() => {
      setHoveredKey((current) => (current === key ? null : current));
      hoverCloseTimerRef.current = null;
    }, 120);
  }

  useEffect(() => clearHoverCloseTimer, []);

  return (
    <div
      className="flex flex-col lg:flex-row gap-3 bg-[#f6f6f6] p-3 lg:relative"
      style={{
        height: "100dvh",
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      {/* ── Birinchi qatlam: desktopda chap ikon panel, mobilda pastki tab bar ── */}
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
            const isOpen = openKey === section.key;
            const showFlyout =
              !!section.subItems && desktopFlyoutKey === section.key;
            return (
              <div
                key={section.key}
                className="relative lg:w-full"
                onMouseEnter={() => handleNavMouseEnter(section.key)}
                onMouseLeave={() => handleNavMouseLeave(section.key)}
              >
                <button
                  aria-label={section.label}
                  aria-expanded={section.subItems ? showFlyout : undefined}
                  onClick={() => {
                    if (section.subItems) {
                      setOpenKey(isOpen ? null : section.key);
                    } else {
                      navigate(section.path);
                      setOpenKey(null);
                    }
                  }}
                  className={`group relative w-11 h-11 lg:w-full lg:aspect-square lg:h-auto rounded-xl flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                    isActive || isOpen
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
                  {!section.subItems && (
                    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-gray-900/15 transition-all duration-150 group-hover:translate-x-1 group-hover:opacity-100 lg:block">
                      {section.label}
                    </span>
                  )}
                </button>

                {section.subItems && (
                  <div
                    className={`absolute left-full top-0 z-50 hidden pl-3 lg:block ${
                      showFlyout
                        ? "pointer-events-auto"
                        : "pointer-events-none"
                    }`}
                  >
                    <div
                      className={`w-72 rounded-2xl bg-white p-2 shadow-2xl shadow-gray-900/10 transition-all duration-150 ${
                        showFlyout
                          ? "translate-x-0 opacity-100"
                          : "-translate-x-1 opacity-0"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-3 px-3 py-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800">
                            {section.label}
                          </p>
                          <p className="truncate text-xs text-gray-400">
                            {section.subItems.length} ta bo'lim
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {section.subItems.map((item) => {
                          const ItemIcon = item.icon;
                          const itemActive =
                            section.key === activeSection?.key &&
                            activeSubItemPath === item.path;
                          return (
                            <button
                              key={item.path}
                              type="button"
                              onClick={() => {
                                navigate(item.path);
                                setOpenKey(null);
                                setHoveredKey(null);
                              }}
                              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                                itemActive
                                  ? "bg-indigo-50 text-indigo-600 font-semibold"
                                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                              }`}
                            >
                              <ItemIcon
                                size={18}
                                className={itemActive ? "text-indigo-500" : "text-gray-400"}
                              />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Adminlar (faqat super admin) va Chiqish — icon ko'rinishida, Settings ustida */}
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

        {/* Settings — disabled, desktop only */}
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

        {/* Profil */}
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

      {/* ── Ikkinchi qatlam (mobil): faqat qo'lda ochilganda ko'rinadigan bottom sheet ── */}
      {mobileShownSection?.subItems && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setOpenKey(null)}
          />
          <div className="fixed bottom-3 left-3 right-3 z-50 flex flex-col rounded-2xl bg-white px-3 py-5 shadow-2xl shadow-gray-900/15">
            <div className="flex items-center justify-between px-3 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {mobileShownSection.label}
              </p>
              <button
                onClick={() => setOpenKey(null)}
                className="text-gray-300 hover:text-gray-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {mobileShownSection.subItems.map((item) => {
                const ItemIcon = item.icon;
                const isActive =
                  mobileShownSection.key === activeSection?.key &&
                  activeSubItemPath === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setOpenKey(null);
                    }}
                    className={`group flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-600 font-semibold"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <ItemIcon
                      size={17}
                      className={`shrink-0 transition-colors ${
                        isActive
                          ? "text-indigo-500"
                          : "text-gray-400 group-hover:text-gray-600"
                      }`}
                    />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Asosiy kontent ── */}
      <div className="order-1 lg:order-3 flex-1 min-w-0 min-h-0 bg-gray-100 rounded-2xl overflow-y-auto">
        {children}
      </div>

      {/* ── Profil menyusi ── */}
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
