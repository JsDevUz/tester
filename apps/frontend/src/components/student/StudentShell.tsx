import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  BookOpen,
  ClipboardList,
  MessageCircle,
  RefreshCw,
  School,
  Settings,
  UserRound,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { usePracticeMessengerStore } from "../../stores/practiceMessengerStore";
import { usePracticeMessengerNotifications } from "../../hooks/usePracticeMessengerNotifications";
import { useLiveClassNotifications } from "../../hooks/useLiveClassNotifications";
import { UserAvatar } from "../UserAvatar";
import { SettingsModal } from "../SettingsModal";
import { formatPhone } from "../../utils/phone";

const NAV_ITEMS = [
  {
    label: "Mening maktablarim",
    shortLabel: "Maktablar",
    path: "/schools",
    icon: School,
  },
  {
    label: "Amaliyotlar",
    shortLabel: "Amaliyotlar",
    path: "/history",
    icon: ClipboardList,
  },
  {
    label: "Jamm",
    shortLabel: "Jamm",
    path: "/jamm",
    icon: BookOpen,
  },
  {
    label: "Messenger",
    shortLabel: "Xabarlar",
    path: "/messenger",
    icon: MessageCircle,
  },
];

function isNavActive(pathname: string, path: string) {
  if (path === "/history")
    return pathname === "/history" || pathname.startsWith("/history/");
  if (path === "/schools")
    return pathname === "/schools" || pathname.startsWith("/schools/");
  if (path === "/jamm") {
    return pathname === "/jamm" || pathname.startsWith("/challanges");
  }
  return pathname === path;
}

export function StudentShell({ children }: { children: ReactNode }) {
  const admin = useAuthStore((s) => s.admin);
  const logout = useAuthStore((s) => s.logout);
  const hasUnreadMessages = usePracticeMessengerStore(
    (s) => s.unreadChatIds.size > 0,
  );
  usePracticeMessengerNotifications();
  useLiveClassNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const profileContact = admin?.phone ? formatPhone(admin.phone) : "Profil";
  const isInnerPage =
    location.pathname.startsWith("/history/") ||
    location.pathname.startsWith("/live/play/");
  const isMessenger = location.pathname === "/messenger";

  useEffect(() => {
    const threshold = 64;
    const onTouchStart = (event: TouchEvent) => {
      if (window.scrollY <= 0 && event.touches.length === 1) {
        pullStartYRef.current = event.touches[0].clientY;
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      const startY = pullStartYRef.current;
      if (startY === null || window.scrollY > 0 || event.touches.length !== 1)
        return;
      const delta = event.touches[0].clientY - startY;
      if (delta <= 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      event.preventDefault();
      const nextDistance = Math.min(delta * 0.45, 88);
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
    };
    const finishPull = () => {
      if (pullDistanceRef.current >= threshold && !refreshing) {
        setRefreshing(true);
        pullDistanceRef.current = threshold;
        setPullDistance(threshold);
        window.location.reload();
        return;
      }
      pullStartYRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", finishPull);
    window.addEventListener("touchcancel", finishPull);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", finishPull);
      window.removeEventListener("touchcancel", finishPull);
    };
  }, [refreshing]);

  const viewportBaselineRef = useRef(0);
  const [messengerViewport, setMessengerViewport] = useState<{
    height: number;
    offsetTop: number;
    keyboardOpen: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isMessenger) {
      setMessengerViewport(null);
      viewportBaselineRef.current = 0;
      return;
    }
    const viewport = window.visualViewport;
    const updateHeight = () => {
      const height = Math.round(viewport?.height ?? window.innerHeight);
      viewportBaselineRef.current = Math.max(
        viewportBaselineRef.current,
        Math.round(window.innerHeight),
        height,
      );
      setMessengerViewport({
        height,
        offsetTop: Math.round(viewport?.offsetTop ?? 0),
        keyboardOpen: viewportBaselineRef.current - height > 150,
      });
    };
    updateHeight();
    viewport?.addEventListener("resize", updateHeight);
    viewport?.addEventListener("scroll", updateHeight);
    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);
    return () => {
      viewport?.removeEventListener("resize", updateHeight);
      viewport?.removeEventListener("scroll", updateHeight);
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
    };
  }, [isMessenger]);

  const messengerViewportStyle: CSSProperties | undefined =
    isMessenger && messengerViewport
      ? {
        height: `${messengerViewport.height}px`,
        top: `${messengerViewport.offsetTop}px`,
      }
      : undefined;
  const messengerKeyboardOpen = !!messengerViewport?.keyboardOpen;

  function handleLogout() {
    setProfileOpen(false);
    logout();
    navigate("/login");
  }

  return (
    <div
      style={messengerViewportStyle}
      className={`student-shell-bg ${isMessenger ? `fixed inset-x-0 h-[100dvh] overflow-hidden lg:static lg:!h-[100dvh] lg:pb-4 ${messengerKeyboardOpen ? "pb-0" : "pb-[calc(60px+env(safe-area-inset-bottom))]"}` : "min-h-[100dvh]"} bg-[var(--bg-primary)] lg:p-4 ${isInnerPage || isMessenger ? "" : "pb-16"}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[max(10px,env(safe-area-inset-top))] z-[100] grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full glass-card text-[var(--text-primary)] shadow-lg transition-opacity"
        style={{
          opacity: pullDistance > 8 ? 1 : 0,
          transform: `translate(-50%, ${Math.max(-48, pullDistance - 48)}px)`,
        }}
      >
        <RefreshCw
          size={18}
          className={refreshing ? "animate-spin" : ""}
          style={{ transform: `rotate(${pullDistance * 4}deg)` }}
        />
      </div>
      <div
        className={`mx-auto grid w-full max-w-none grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-3 ${isMessenger ? "h-full min-h-0 items-stretch" : "lg:min-h-[calc(100vh-2rem)]"}`}
      >
        <aside
          className={`hidden w-full shrink-0 flex-col gap-2.5 ${isMessenger ? "lg:flex lg:self-stretch" : "lg:sticky lg:top-4 lg:flex lg:self-start"}`}
        >
          {/* Profile Card */}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="glass-card rounded-2xl p-3.5 text-left transition-all hover:bg-[var(--card-hover)] cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <UserAvatar
                name={admin?.name}
                avatarUrl={admin?.avatarUrl}
                className="h-10 w-10 rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-xs"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[var(--text-primary)]">
                  {admin?.name ?? "O'quvchi"}
                </p>
                <p className="truncate text-[11px] font-semibold text-[var(--text-muted)] mt-0.5">
                  {profileContact}
                </p>
              </div>
            </div>
          </button>

          {/* Navigation Card */}
          <nav className="glass-card flex gap-1 rounded-2xl p-2 lg:flex-col">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(location.pathname, item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`inline-flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold transition-all lg:w-full cursor-pointer ${active
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)]"
                    }`}
                >
                  <span className="relative">
                    <Icon
                      size={17}
                      className={active ? "text-white" : "text-[var(--text-muted)]"}
                    />
                    {item.path === "/messenger" && hasUnreadMessages && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Settings Button */}
          <div className="hidden lg:block">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="glass-card inline-flex w-full shrink-0 items-center gap-2.5 rounded-2xl p-3 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-all cursor-pointer"
            >
              <Settings size={17} className="text-[var(--text-muted)]" />
              <span>Sozlamalar</span>
            </button>
          </div>
        </aside>

        <main
          className={`student-main-content min-w-0 flex-1 lg:rounded-none ${isMessenger ? "min-h-0 overflow-hidden" : ""}`}
        >
          {children}
        </main>
      </div>

      {!isInnerPage && !(isMessenger && messengerKeyboardOpen) && (
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 glass-card border-t border-black/5 dark:border-white/10 px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 lg:hidden backdrop-blur-xl">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(location.pathname, item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate(item.path);
                }}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-bold transition-colors cursor-pointer ${active ? "text-indigo-600 dark:text-indigo-400" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
              >
                <span className="relative">
                  <Icon
                    size={19}
                    className={active ? "text-indigo-600 dark:text-indigo-400" : "text-[var(--text-muted)]"}
                  />
                  {item.path === "/messenger" && hasUnreadMessages && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </span>
                <span className="max-w-full truncate">{item.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-bold transition-colors cursor-pointer ${profileOpen ? "text-indigo-600 dark:text-indigo-400" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
          >
            <UserRound
              size={19}
              className={profileOpen ? "text-indigo-600 dark:text-indigo-400" : "text-[var(--text-muted)]"}
            />
            <span>Profil</span>
          </button>
        </nav>
      )}

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
