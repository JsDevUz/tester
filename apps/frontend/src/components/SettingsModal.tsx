import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut, Moon, Phone, Settings, ShieldCheck, User, X } from "lucide-react";
import type { Admin } from "../api/auth";
import { useThemeStore } from "../stores/themeStore";
import { UserAvatar } from "./UserAvatar";
import { AdminsSection } from "./AdminsSection";
import { EditProfileSection } from "./EditProfileSection";
import { formatPhone } from "../utils/phone";

interface SettingsModalProps {
  admin: Admin | null;
  onClose: () => void;
  onLogout: () => void;
}

type SectionKey = "general" | "profile" | "admins";

const ROLE_LABELS: Record<Admin["role"], string> = {
  student: "O'quvchi",
  teacher: "O'qituvchi",
  curator: "Kurator",
  super: "Super admin",
};

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors ${
        checked ? "bg-indigo-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5.5 w-5.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function SettingsModal({ admin, onClose, onLogout }: SettingsModalProps) {
  const { theme, toggleTheme } = useThemeStore();
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>("general");
  const isSuperAdmin = admin?.role === "super";

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function openSection(section: SectionKey) {
    setActiveSection(section);
    setShowDetailOnMobile(true);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Sozlamalar"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="settings-modal-surface relative flex h-[min(640px,94dvh)] w-full max-w-3xl overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl ring-1 ring-black/5">
        {/* ── Sidebar: profile + section list ── */}
        <div
          className={`settings-modal-sidebar flex w-full shrink-0 flex-col border-r border-border bg-gray-50 sm:w-72 ${
            showDetailOnMobile ? "hidden sm:flex" : "flex"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-4">
            <h2 className="text-base font-semibold">Sozlamalar</h2>
            <button
              type="button"
              aria-label="Yopish"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 sm:hidden"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center gap-3 border-b border-border px-4 pb-4">
            <UserAvatar
              name={admin?.name}
              avatarUrl={admin?.avatarUrl}
              className="h-12 w-12 shrink-0 rounded-full bg-gray-900 text-base font-semibold text-white"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{admin?.name ?? "Foydalanuvchi"}</p>
              <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-gray-400">
                {admin?.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={11} /> {formatPhone(admin.phone)}
                  </span>
                )}
                {admin?.role && <span>{ROLE_LABELS[admin.role]}</span>}
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => openSection("profile")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                activeSection === "profile"
                  ? "bg-indigo-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  activeSection === "profile" ? "bg-white/15" : "bg-gray-200"
                }`}
              >
                <User size={15} />
              </span>
              Profile
              <ChevronRight size={15} className="ml-auto text-gray-300 sm:hidden" />
            </button>

            <button
              type="button"
              onClick={() => openSection("general")}
              className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                activeSection === "general"
                  ? "bg-indigo-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  activeSection === "general" ? "bg-white/15" : "bg-gray-200"
                }`}
              >
                <Settings size={15} />
              </span>
              General
              <ChevronRight size={15} className="ml-auto text-gray-300 sm:hidden" />
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => openSection("admins")}
                className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  activeSection === "admins"
                    ? "bg-indigo-500 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    activeSection === "admins" ? "bg-white/15" : "bg-gray-200"
                  }`}
                >
                  <ShieldCheck size={15} />
                </span>
                Adminlar
                <ChevronRight size={15} className="ml-auto text-gray-300 sm:hidden" />
              </button>
            )}
          </nav>

          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <LogOut size={16} /> Chiqish
            </button>
          </div>
        </div>

        {/* ── Detail ── */}
        <div className={`flex min-w-0 flex-1 flex-col ${showDetailOnMobile ? "flex" : "hidden sm:flex"}`}>
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-4 sm:px-6">
            <button
              type="button"
              aria-label="Orqaga"
              onClick={() => setShowDetailOnMobile(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 sm:hidden"
            >
              <ChevronLeft size={17} />
            </button>
            <h3 className="text-base font-semibold">
              {activeSection === "profile"
                ? "Profile"
                : activeSection === "general"
                  ? "General Settings"
                  : "Adminlar"}
            </h3>
            <button
              type="button"
              aria-label="Yopish"
              onClick={onClose}
              className="ml-auto hidden h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 sm:flex"
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {activeSection === "profile" ? (
              <EditProfileSection />
            ) : activeSection === "general" ? (
              <>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Appearance
                </p>
                <div className="overflow-hidden rounded-xl bg-gray-50">
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <Moon size={16} className="shrink-0 text-gray-400" />
                    <span className="flex-1 text-sm text-gray-700">Dark Mode</span>
                    <Switch checked={theme === "dark"} onChange={toggleTheme} label="Dark mode almashtirish" />
                  </div>
                </div>
              </>
            ) : (
              <AdminsSection currentAdminId={admin?.id ?? null} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
