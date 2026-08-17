import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LogOut,
  Moon,
  Palette,
  Phone,
  ShieldCheck,
  Smartphone,
  Sun,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Admin } from "../api/auth";
import { apiChangePassword, apiUpdateProfile } from "../api/auth";
import { apiUploadMedia } from "../api/questions";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { UserAvatar } from "./UserAvatar";
import { AdminsSection } from "./AdminsSection";
import { ConfirmDeleteModal } from "./course/ConfirmDeleteModal";
import { formatPhone } from "../utils/phone";

interface SettingsModalProps {
  admin: Admin | null;
  onClose: () => void;
  onLogout: () => void;
}

const ROLE_LABELS: Record<Admin["role"], string> = {
  student: "O'quvchi",
  teacher: "O'qituvchi",
  curator: "Kurator",
  super: "Super admin",
};

type SettingsTab = "account" | "appearance" | "security" | "admins";

export function SettingsModal({ admin, onClose, onLogout }: SettingsModalProps) {
  const setAdmin = useAuthStore((s) => s.setAdmin);
  const { themeMode, setTheme } = useThemeStore();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [mobileView, setMobileView] = useState<"menu" | "detail">("menu");

  // Profile Edit State
  const [name, setName] = useState(admin?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const nameChanged = name.trim() !== (admin?.name ?? "").trim();

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

  async function handleSaveName() {
    if (!nameChanged || savingName) return;
    setSavingName(true);
    try {
      const updated = await apiUpdateProfile({ name: name.trim() });
      setAdmin(updated);
      toast.success("Ism yangilandi");
    } catch {
      toast.error("Ismni yangilab bo'lmadi");
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Faqat rasm fayllari qabul qilinadi");
      return;
    }
    setUploadingAvatar(true);
    try {
      const { url } = await apiUploadMedia(file, "avatars");
      const updated = await apiUpdateProfile({ avatarUrl: url });
      setAdmin(updated);
      toast.success("Profil rasmi yangilandi");
    } catch {
      toast.error("Rasmni yuklab bo'lmadi");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleChangePassword(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (savingPassword) return;
    if (!currentPassword) {
      toast.error("Joriy parolni kiriting");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
      return;
    }
    setSavingPassword(true);
    try {
      await apiChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Parol muvaffaqiyatli yangilandi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Parolni yangilab bo'lmadi");
    } finally {
      setSavingPassword(false);
    }
  }

  function handleSelectTab(tab: SettingsTab) {
    setActiveTab(tab);
    setMobileView("detail");
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 dark:bg-black/30 p-2 sm:p-6 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Sozlamalar"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {confirmLogout && (
        <ConfirmDeleteModal
          title="Tizimdan chiqmoqchimisiz?"
          description="Hisobingizdan chiqasiz va qayta kirish uchun telefon raqamingizni tasdiqlashingiz kerak bo'ladi."
          confirmLabel="Chiqish"
          onConfirm={() => {
            setConfirmLogout(false);
            onLogout();
          }}
          onClose={() => setConfirmLogout(false)}
        />
      )}

      <div className="glass-card relative flex h-[580px] max-h-[92dvh] w-full max-w-3xl overflow-hidden rounded-3xl text-[var(--text-primary)] shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Sidebar / Step 1 Menu on Mobile */}
        <aside
          className={`${
            mobileView === "menu" ? "flex w-full" : "hidden"
          } sm:flex sm:w-52 md:w-56 shrink-0 bg-black/5 dark:bg-white/5 flex-col justify-between p-3.5 sm:p-4`}
        >
          <div className="flex flex-col gap-1">
            {/* Header for Mobile Menu */}
            <div className="flex items-center justify-between px-2.5 py-1 mb-2 sm:mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Sozlamalar
              </p>
              <button
                type="button"
                onClick={onClose}
                className="sm:hidden p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleSelectTab("account")}
              className={`flex items-center justify-between w-full px-3 py-2.5 sm:py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === "account"
                  ? "bg-indigo-600 text-white font-bold shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <User size={16} />
                <span>Hisob</span>
              </div>
              <ChevronRight size={15} className="sm:hidden opacity-60" />
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab("appearance")}
              className={`flex items-center justify-between w-full px-3 py-2.5 sm:py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === "appearance"
                  ? "bg-indigo-600 text-white font-bold shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Palette size={16} />
                <span>Mavzu</span>
              </div>
              <ChevronRight size={15} className="sm:hidden opacity-60" />
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab("security")}
              className={`flex items-center justify-between w-full px-3 py-2.5 sm:py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === "security"
                  ? "bg-indigo-600 text-white font-bold shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={16} />
                <span>Xavfsizlik</span>
              </div>
              <ChevronRight size={15} className="sm:hidden opacity-60" />
            </button>

            {admin?.role === "super" && (
              <>
                <div className="px-2.5 pt-4 pb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Boshqaruv
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectTab("admins")}
                  className={`flex items-center justify-between w-full px-3 py-2.5 sm:py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === "admins"
                      ? "bg-indigo-600 text-white font-bold shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users size={16} />
                    <span>Adminlar</span>
                  </div>
                  <ChevronRight size={15} className="sm:hidden opacity-60" />
                </button>
              </>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut size={16} />
              <span>Chiqish</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area / Step 2 on Mobile */}
        <main
          className={`${
            mobileView === "detail" ? "flex" : "hidden"
          } sm:flex flex-1 flex-col min-w-0 bg-transparent relative`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileView("menu")}
                className="sm:hidden flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mr-1 cursor-pointer"
              >
                <ChevronLeft size={18} />
                <span>Orqaga</span>
              </button>

              <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
                {activeTab === "account" && "Mening hisobim"}
                {activeTab === "appearance" && "Tashqi ko'rinish"}
                {activeTab === "security" && "Xavfsizlik"}
                {activeTab === "admins" && "Adminlar va foydalanuvchilar"}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="group flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
              title="Yopish (ESC)"
            >
              <kbd className="hidden sm:inline-block rounded px-1 py-0.5 text-[9px] font-bold text-[var(--text-muted)] bg-black/5 dark:bg-white/5">
                ESC
              </kbd>
              <X size={16} />
            </button>
          </div>

          {/* Tab Content Container */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            {/* TAB: Mening hisobim */}
            {activeTab === "account" && (
              <div className="space-y-4 max-w-xl">
                {/* Profile Overview Card */}
                <div className="rounded-2xl bg-black/5 dark:bg-white/5 p-5">
                  <div className="flex items-center gap-4">
                    <div className="relative group shrink-0">
                      <UserAvatar
                        name={admin?.name}
                        avatarUrl={admin?.avatarUrl}
                        className="h-16 w-16 rounded-2xl"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:opacity-50"
                        title="Rasmni almashtirish"
                      >
                        <Camera size={18} />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {admin?.name || "Ism kiritilmagan"}
                        </p>
                        <span className="rounded-md bg-black/5 dark:bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                          {admin?.role ? ROLE_LABELS[admin.role] : "O'quvchi"}
                        </span>
                      </div>
                      {admin?.phone && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1.5">
                          <Phone size={12} />
                          {formatPhone(admin.phone)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Edit Display Name */}
                <div className="rounded-2xl bg-black/5 dark:bg-white/5 p-5 space-y-3">
                  <label className="block text-xs font-bold text-[var(--text-secondary)]">
                    Ism
                  </label>
                  <div className="flex flex-col sm:flex-row items-center gap-2.5">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ismingizni kiriting"
                      className="w-full flex-1 rounded-xl bg-white dark:bg-black/30 border border-black/10 dark:border-white/10 px-3.5 py-2.5 text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs transition-all placeholder:text-[var(--text-muted)]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveName}
                      disabled={!nameChanged || savingName}
                      className="w-full sm:w-auto rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-xs font-bold shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                    >
                      {savingName ? "Saqlanmoqda..." : "Saqlash"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Tashqi ko'rinish */}
            {activeTab === "appearance" && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)] mb-1">
                    Mavzu
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Ilovaning ko'rinish rejimini tanlang
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {/* Light Theme */}
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`flex items-center justify-between p-3.5 rounded-2xl transition-all text-left cursor-pointer ${
                      themeMode === "light"
                        ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold ring-2 ring-indigo-500/30"
                        : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Sun size={16} />
                      <span className="text-xs">Yorug'</span>
                    </div>
                    {themeMode === "light" && (
                      <Check size={14} className="text-indigo-600 dark:text-indigo-400" />
                    )}
                  </button>

                  {/* Dark Theme */}
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`flex items-center justify-between p-3.5 rounded-2xl transition-all text-left cursor-pointer ${
                      themeMode === "dark"
                        ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold ring-2 ring-indigo-500/30"
                        : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Moon size={16} />
                      <span className="text-xs">Qorong'u</span>
                    </div>
                    {themeMode === "dark" && (
                      <Check size={14} className="text-indigo-600 dark:text-indigo-400" />
                    )}
                  </button>

                  {/* System Theme */}
                  <button
                    type="button"
                    onClick={() => setTheme("system")}
                    className={`flex items-center justify-between p-3.5 rounded-2xl transition-all text-left cursor-pointer ${
                      themeMode === "system"
                        ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold ring-2 ring-indigo-500/30"
                        : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Smartphone size={16} />
                      <span className="text-xs">Tizim</span>
                    </div>
                    {themeMode === "system" && (
                      <Check size={14} className="text-indigo-600 dark:text-indigo-400" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: Xavfsizlik */}
            {activeTab === "security" && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)] mb-1">
                    Parolni yangilash
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Xavfsizlik uchun parolingizni yangilab turing
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-3.5 rounded-2xl bg-black/5 dark:bg-white/5 p-5">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
                      Joriy parol
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="h-10 w-full rounded-xl bg-white dark:bg-black/30 border border-black/10 dark:border-white/10 px-3.5 text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs transition-all placeholder:text-[var(--text-muted)]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
                      Yangi parol
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Kamida 6 ta belgi"
                      className="h-10 w-full rounded-xl bg-white dark:bg-black/30 border border-black/10 dark:border-white/10 px-3.5 text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs transition-all placeholder:text-[var(--text-muted)]"
                    />
                  </div>

                  <div className="pt-1.5">
                    <button
                      type="submit"
                      disabled={savingPassword || !currentPassword || !newPassword}
                      className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-xs font-bold shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <KeyRound size={14} />
                      <span>{savingPassword ? "Yangilanmoqda..." : "Parolni saqlash"}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB: Adminlar */}
            {activeTab === "admins" && admin?.role === "super" && (
              <div className="space-y-4">
                <AdminsSection currentAdminId={admin.id} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
