import { useRef, useState } from "react";
import { Camera, Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { apiChangePassword, apiUpdateProfile } from "../api/auth";
import { apiUploadMedia } from "../api/questions";
import { useAuthStore } from "../stores/authStore";
import { UserAvatar } from "./UserAvatar";
import { formatPhone } from "../utils/phone";

export function EditProfileSection() {
  const admin = useAuthStore((s) => s.admin);
  const setAdmin = useAuthStore((s) => s.setAdmin);
  const [name, setName] = useState(admin?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nameChanged = name.trim() !== (admin?.name ?? "").trim();

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
    if (newPassword.length < 8) {
      toast.error("Yangi parol kamida 8 ta belgidan iborat bo'lishi kerak");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Yangi parollar mos kelmadi");
      return;
    }
    setSavingPassword(true);
    try {
      await apiChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Parol yangilandi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Parolni yangilab bo'lmadi");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <UserAvatar
            name={admin?.name}
            avatarUrl={admin?.avatarUrl}
            className="h-20 w-20 rounded-full bg-gray-900 text-2xl font-semibold text-white"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Rasmni o'zgartirish"
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-white shadow ring-2 ring-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
          >
            {uploadingAvatar ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Camera size={15} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-sm font-semibold text-gray-900">{admin?.name}</p>
          <p className="text-xs text-gray-400">{admin?.phone ? formatPhone(admin.phone) : ""}</p>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Ism
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Ismingiz"
            className="w-full rounded-xl border border-border bg-gray-50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-gray-400 focus:bg-white"
          />
          <button
            type="button"
            onClick={handleSaveName}
            disabled={!nameChanged || savingName}
            className="shrink-0 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingName ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <div className="mb-3 flex items-center gap-2">
          <LockKeyhole size={15} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">Parolni o'zgartirish</p>
        </div>
        <div className="flex flex-col gap-2.5">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Joriy parol"
            autoComplete="current-password"
            className="w-full rounded-xl border border-border bg-gray-50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-gray-400 focus:bg-white"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Yangi parol (kamida 8 ta belgi)"
            autoComplete="new-password"
            className="w-full rounded-xl border border-border bg-gray-50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-gray-400 focus:bg-white"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Yangi parolni tasdiqlang"
              autoComplete="new-password"
              className="w-full rounded-xl border border-border bg-gray-50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-gray-400 focus:bg-white"
            />
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="shrink-0 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingPassword ? "Saqlanmoqda..." : "Parolni saqlash"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
