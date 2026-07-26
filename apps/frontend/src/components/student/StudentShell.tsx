import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, ClipboardList, MessageCircle, Radio, RefreshCw, Settings, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { usePracticeMessengerStore } from "../../stores/practiceMessengerStore";
import { usePracticeMessengerNotifications } from "../../hooks/usePracticeMessengerNotifications";
import { UserAvatar } from "../UserAvatar";
import { SettingsModal } from "../SettingsModal";
import { formatPhone } from "../../utils/phone";
import { apiActiveClassSessions, type ActiveClassSession } from "../../api/classroom";
import { apiActiveTestPins, type ActiveTestPin } from "../../api/submissions";

const NAV_ITEMS = [
  { label: "Mening kurslarim", shortLabel: "Kurslar", path: "/my-courses", icon: BookOpen },
  { label: "Amaliyotlar tarixi", shortLabel: "Tarix", path: "/", icon: ClipboardList },
  { label: "Messenger", shortLabel: "Xabarlar", path: "/messenger", icon: MessageCircle },
  { label: "Jonli musobaqalar", shortLabel: "Jonli", path: "/live/join", icon: Radio },
];

function isNavActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/" || pathname.startsWith("/history/");
  if (path === "/live/join") return pathname.startsWith("/live/");
  return pathname === path;
}

export function StudentShell({ children }: { children: ReactNode }) {
  const admin = useAuthStore((s) => s.admin);
  const logout = useAuthStore((s) => s.logout);
  const hasUnreadMessages = usePracticeMessengerStore((s) => s.unreadChatIds.size > 0);
  usePracticeMessengerNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const [liveClassSessions, setLiveClassSessions] = useState<ActiveClassSession[]>([]);
  const [activeTestPins, setActiveTestPins] = useState<ActiveTestPin[]>([]);
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
      if (startY === null || window.scrollY > 0 || event.touches.length !== 1) return;
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

  // Aktiv jonli dars bor-yo'qligini davriy tekshiramiz (banner uchun)
  useEffect(() => {
    const load = () => {
      apiActiveClassSessions()
        .then(setLiveClassSessions)
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isMessenger) {
      setActiveTestPins([]);
      return;
    }

    let mounted = true;
    let loading = false;
    let generation = 0;
    const load = async () => {
      if (loading) return;
      loading = true;
      const requestGeneration = ++generation;
      try {
        const pins = await apiActiveTestPins();
        if (mounted && requestGeneration === generation) {
          setActiveTestPins(pins);
        }
      } catch {
        if (mounted && requestGeneration === generation) {
          setActiveTestPins([]);
        }
      } finally {
        if (requestGeneration === generation) {
          loading = false;
        }
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      mounted = false;
      generation += 1;
      window.clearInterval(timer);
    };
  }, [isMessenger]);

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
      className={`student-shell-bg ${isMessenger ? `fixed inset-x-0 h-[100dvh] overflow-hidden lg:static lg:!h-[100dvh] lg:pb-4 ${messengerKeyboardOpen ? "pb-0" : "pb-[calc(60px+env(safe-area-inset-bottom))]"}` : "min-h-[100dvh]"} bg-white lg:bg-gray-50 lg:p-4 ${isInnerPage || isMessenger ? "" : "pb-16"}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[max(10px,env(safe-area-inset-top))] z-[100] grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full bg-white text-gray-700 shadow-lg transition-opacity"
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
      <div className={`mx-auto grid w-full max-w-none grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-3 ${isMessenger ? "h-full min-h-0 items-stretch" : "lg:min-h-[calc(100vh-2rem)]"}`}>
        <aside className={`hidden w-full shrink-0 flex-col gap-3 ${isMessenger ? "lg:flex lg:self-stretch" : "lg:sticky lg:top-4 lg:flex lg:self-start"}`}>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="rounded-2xl bg-white p-4 text-left transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <UserAvatar name={admin?.name} avatarUrl={admin?.avatarUrl} className="h-12 w-12 rounded-full bg-yellow-300 text-base font-bold text-white" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-gray-900">
                  {admin?.name ?? "O'quvchi"}
                </p>
                <p className="truncate text-xs font-medium text-gray-400">
                  {profileContact}
                </p>
              </div>
            </div>
          </button>

          <nav className="flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-3 lg:flex-col lg:overflow-visible">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(location.pathname, item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`inline-flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors lg:w-full ${
                    active
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="relative">
                    <Icon
                      size={20}
                      className={active ? "text-gray-900" : "text-gray-400"}
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

          <nav className="hidden rounded-2xl bg-white p-3 lg:block">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="inline-flex w-full shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Settings size={20} className="text-gray-400" />
              <span>Sozlamalar</span>
            </button>
          </nav>
        </aside>

        <main className={`min-w-0 flex-1 lg:rounded-none ${isMessenger ? "min-h-0 overflow-hidden" : ""}`}>
          {!isMessenger && liveClassSessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => navigate(`/classroom/${s.id}`)}
              className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-left transition-colors hover:bg-red-100 lg:mx-0 lg:mt-0 lg:mb-3 lg:w-full"
            >
              <Radio size={20} className="shrink-0 text-red-500 motion-safe:animate-pulse" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">Jonli dars ketmoqda — {s.courseName}</span>
                <span className="block text-xs text-gray-500">Darsga kirish uchun bosing</span>
              </span>
              <span className="shrink-0 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold text-white">Kirish</span>
            </button>
          ))}
          {!isMessenger && activeTestPins.map((pin) => (
            <button
              key={pin.testId}
              type="button"
              onClick={() => navigate(`/t/${pin.slug}`)}
              className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-left transition-colors hover:bg-red-100 lg:mx-0 lg:mt-0 lg:mb-3 lg:w-full"
            >
              <Radio size={20} className="shrink-0 text-red-500 motion-safe:animate-pulse" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">Imtihon boshlandi — {pin.testName}</span>
                <span className="block text-xs text-gray-500">Kirish uchun bosing</span>
              </span>
              <span className="shrink-0 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold text-white">Kirish</span>
            </button>
          ))}
          {children}
        </main>
      </div>

      {!isInnerPage && !(isMessenger && messengerKeyboardOpen) && (
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-gray-100 bg-white px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 lg:hidden">
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
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                  active
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500"
                }`}
              >
                <span className="relative">
                  <Icon
                    size={19}
                    className={active ? "text-gray-900" : "text-gray-400"}
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
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${
              profileOpen ? "bg-gray-100 text-gray-900" : "text-gray-500"
            }`}
          >
            <UserRound
              size={19}
              className={profileOpen ? "text-gray-900" : "text-gray-400"}
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
