import { useEffect, useRef, useState } from "react";
import {
  LogOut,
  Moon,
  Phone,
  Smartphone,
  Sun,
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

export function SettingsModal({ admin, onClose, onLogout }: SettingsModalProps) {
  const setAdmin = useAuthStore((s) => s.setAdmin);
  const { themeMode, setTheme } = useThemeStore();
  const [confirmLogout, setConfirmLogout] = useState(false);

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
      toast.success("Rasm yangilandi");
    } catch {
      toast.error("Rasmni yuklab bo'lmadi");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleChangePassword() {
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
      toast.success("Parol yangilandi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Parolni yangilab bo'lmadi");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
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

      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[32px] bg-white text-gray-900 shadow-2xl dark:bg-zinc-900 dark:text-zinc-100 sm:rounded-[32px]">
        {/* Top pull indicator for mobile */}
        <div className="pt-3 pb-1 sm:hidden">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-200 dark:bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 sm:pt-5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Sozlamalar
          </h2>
          <button
            type="button"
            aria-label="Yopish"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2">
          {/* Avatar Section */}
          <div className="flex flex-col items-center justify-center mb-3">
            <div className="relative">
              <UserAvatar
                name={admin?.name}
                avatarUrl={admin?.avatarUrl}
                className="h-20 w-20 rounded-full border-2 border-white shadow-sm dark:border-zinc-800"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 disabled:opacity-50"
            >
              {uploadingAvatar ? "Rasm yuklanmoqda..." : "Rasmni almashtirish"}
            </button>
          </div>

          {/* Contact Details */}
          <div className="mb-4 flex flex-col gap-0.5 text-xs text-gray-400 dark:text-zinc-500">
            {admin?.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={12} className="text-gray-400" /> {formatPhone(admin.phone)}
              </span>
            )}
            <span>{admin?.role ? ROLE_LABELS[admin.role] : "O'quvchi"}</span>
          </div>

          {/* Name Section */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-zinc-300">
              Ism
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              placeholder="Ismingiz"
              className="h-12 w-full rounded-2xl border border-gray-200/80 bg-gray-50 px-4 text-sm font-semibold text-gray-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700/80 dark:bg-zinc-800 dark:text-white dark:focus:border-indigo-500 dark:focus:bg-zinc-800 dark:focus:ring-indigo-500/20"
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={!nameChanged || savingName}
              className={`mt-2 h-11 w-full rounded-2xl text-sm font-bold transition-colors ${
                nameChanged
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {savingName ? "Saqlanmoqda..." : "Ismni saqlash"}
            </button>
          </div>

          {/* Theme Section */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-zinc-300">
              Mavzu
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 text-xs font-bold transition-all ${
                  themeMode === "light"
                    ? "border-2 border-indigo-500 bg-indigo-50/60 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400"
                    : "border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                <Sun size={18} />
                <span>Yorug'</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 text-xs font-bold transition-all ${
                  themeMode === "dark"
                    ? "border-2 border-indigo-500 bg-indigo-50/60 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400"
                    : "border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                <Moon size={18} />
                <span>Qorong'u</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("system")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 text-xs font-bold transition-all ${
                  themeMode === "system"
                    ? "border-2 border-indigo-500 bg-indigo-50/60 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400"
                    : "border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                <Smartphone size={18} />
                <span>Tizim</span>
              </button>
            </div>
          </div>

          {/* Password Change Section */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-zinc-300">
              Joriy parol
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-12 w-full rounded-2xl border border-gray-200/80 bg-gray-50 px-4 text-sm font-semibold text-gray-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700/80 dark:bg-zinc-800 dark:text-white dark:focus:border-indigo-500 dark:focus:bg-zinc-800 dark:focus:ring-indigo-500/20"
            />
            <label className="mt-3 mb-1.5 block text-xs font-bold text-gray-600 dark:text-zinc-300">
              Yangi parol
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
              className="h-12 w-full rounded-2xl border border-gray-200/80 bg-gray-50 px-4 text-sm font-semibold text-gray-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700/80 dark:bg-zinc-800 dark:text-white dark:focus:border-indigo-500 dark:focus:bg-zinc-800 dark:focus:ring-indigo-500/20"
            />
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={savingPassword || !currentPassword || !newPassword}
              className={`mt-3 h-12 w-full rounded-2xl text-sm font-bold transition-colors ${
                currentPassword && newPassword
                  ? "bg-[#0f172a] text-white hover:bg-black dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-500"
                  : "bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {savingPassword ? "Yangilanmoqda..." : "Parolni yangilash"}
            </button>
          </div>

          {admin?.role === "super" && (
            <div className="mb-4 border-t border-gray-100 pt-4 dark:border-zinc-800">
              <AdminsSection currentAdminId={admin.id} />
            </div>
          )}

          {/* Logout Button */}
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-50 text-sm font-bold text-red-500 transition-colors hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40"
          >
            <LogOut size={18} />
            <span>Chiqish</span>
          </button>
        </div>
      </div>
    </div>
  );
}
