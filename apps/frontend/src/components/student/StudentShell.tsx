import { useState, type ReactNode } from "react";
import { BookOpen, ClipboardList, LogOut, Moon, Radio, Sun, UserRound, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";

const NAV_ITEMS = [
  { label: "Mening kurslarim", shortLabel: "Kurslar", path: "/my-courses", icon: BookOpen },
  { label: "Amaliyotlar tarixi", shortLabel: "Tarix", path: "/", icon: ClipboardList },
  { label: "Jonli musobaqalar", shortLabel: "Jonli", path: "/live/join", icon: Radio },
];

function initials(name?: string | null) {
  const parts = (name ?? "O'quvchi").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "O";
}

function formatProfileContact(phone?: string | null, email?: string | null) {
  if (phone) return phone;
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
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileContact = formatProfileContact(admin?.phone, admin?.email);
  const isInnerPage =
    location.pathname.startsWith("/history/") ||
    location.pathname.startsWith("/live/play/");

  function handleLogout() {
    setProfileOpen(false);
    logout();
    navigate("/login");
  }

  return (
    <div className={`min-h-[100dvh] bg-white lg:bg-gray-50 lg:p-4 ${isInnerPage ? "" : "pb-16"}`}>
      <div className="mx-auto flex w-full max-w-none flex-col lg:min-h-[calc(100vh-2rem)] lg:max-w-6xl lg:flex-row lg:gap-3">
        <aside className="hidden w-full shrink-0 flex-col gap-3 lg:sticky lg:top-4 lg:flex lg:w-72 lg:self-start">
          <div className="rounded-2xl bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-yellow-300 text-base font-bold text-white">
                {initials(admin?.name)}
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-gray-900">
                  {admin?.name ?? "O'quvchi"}
                </p>
                <p className="truncate text-xs font-medium text-gray-400">
                  {profileContact}
                </p>
              </div>
            </div>
          </div>

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
                  <Icon
                    size={20}
                    className={active ? "text-gray-900" : "text-gray-400"}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="rounded-2xl bg-white p-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex w-full shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              {theme === "dark" ? (
                <Sun size={20} className="text-gray-400" />
              ) : (
                <Moon size={20} className="text-gray-400" />
              )}
              <span>{theme === "dark" ? "Yorug' rejim" : "Tungi rejim"}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-1 inline-flex w-full shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <LogOut size={20} className="text-gray-400" />
              <span>Chiqish</span>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 lg:rounded-none">{children}</main>
      </div>

      {!isInnerPage && (
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-gray-100 bg-white px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 lg:hidden">
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
                <Icon
                  size={19}
                  className={active ? "text-gray-900" : "text-gray-400"}
                />
                <span className="max-w-full truncate">{item.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
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

      {profileOpen && !isInnerPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5 lg:hidden">
          <button
            type="button"
            aria-label="Profil oynasini yopish"
            className="fixed inset-0 -z-10 bg-black/35"
            onClick={() => setProfileOpen(false)}
          />
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-gray-900">Profil</p>
              <button
                type="button"
                aria-label="Yopish"
                onClick={() => setProfileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-yellow-300 text-sm font-bold text-white">
                {initials(admin?.name)}
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-900">
                  {admin?.name ?? "O'quvchi"}
                </p>
                <p className="truncate text-xs font-medium text-gray-400">
                  {profileContact}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700"
            >
              {theme === "dark" ? (
                <Sun size={18} className="text-gray-400" />
              ) : (
                <Moon size={18} className="text-gray-400" />
              )}
              <span>{theme === "dark" ? "Yorug' rejim" : "Tungi rejim"}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700"
            >
              <LogOut size={18} className="text-gray-400" />
              <span>Chiqish</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
