import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, ClipboardList, MessageCircle, Radio, Settings, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { usePracticeMessengerStore } from "../../stores/practiceMessengerStore";
import { usePracticeMessengerNotifications } from "../../hooks/usePracticeMessengerNotifications";
import { UserAvatar } from "../UserAvatar";
import { SettingsModal } from "../SettingsModal";
import { formatPhone } from "../../utils/phone";

const NAV_ITEMS = [
  { label: "Mening kurslarim", shortLabel: "Kurslar", path: "/my-courses", icon: BookOpen },
  { label: "Amaliyotlar tarixi", shortLabel: "Tarix", path: "/", icon: ClipboardList },
  { label: "Messenger", shortLabel: "Xabarlar", path: "/messenger", icon: MessageCircle },
  { label: "Jonli musobaqalar", shortLabel: "Jonli", path: "/live/join", icon: Radio },
];

function formatProfileContact(phone?: string | null, email?: string | null) {
  if (phone) return formatPhone(phone);
  const telegramPhone = email?.match(/^u(\d{7,})@telegram\.local$/i)?.[1];
  if (telegramPhone) return `+${telegramPhone}`;
  return email ?? "Profil";
}

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
  const profileContact = formatProfileContact(admin?.phone, admin?.email);
  const isInnerPage =
    location.pathname.startsWith("/history/") ||
    location.pathname.startsWith("/live/play/");
  const isMessenger = location.pathname === "/messenger";
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

        <main className={`min-w-0 flex-1 lg:rounded-none ${isMessenger ? "min-h-0 overflow-hidden" : ""}`}>{children}</main>
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
