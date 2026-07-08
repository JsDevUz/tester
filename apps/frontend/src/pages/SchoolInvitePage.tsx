import { useEffect, useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { ConfirmDeleteModal } from '../components/course/ConfirmDeleteModal';
import { useSchoolStore } from '../stores/schoolStore';

export function SchoolInvitePage() {
  const { inviteToken, loaded, loadSchool, regenerateInviteToken } = useSchoolStore();
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  useEffect(() => {
    void loadSchool();
  }, [loadSchool]);

  const inviteLink = `${window.location.origin}/school-invite/${inviteToken}`;

  function handleCopy() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleConfirmRegenerate() {
    void regenerateInviteToken();
    setConfirmRegenerate(false);
  }

  if (!loaded) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-gray-400">Yuklanmoqda...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-3 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h1 className="mb-1 text-lg font-bold text-gray-800">Ro'yxatdan o'tish</h1>
          <p className="mb-4 text-sm text-gray-400">
            Ushbu havola orqali o'quvchilar maktabingizga ro'yxatdan o'tishlari mumkin
          </p>

          <div className="mb-4 rounded-2xl bg-white p-5">
            <p className="mb-1.5 text-sm text-gray-500">Taklif havolasi</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="w-full min-w-0 flex-1 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Nusxalandi!' : 'Nusxalash'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5">
            <h2 className="mb-4 text-lg font-bold text-gray-800">Amallar</h2>
            <button
              type="button"
              onClick={() => setConfirmRegenerate(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
            >
              <RotateCcw size={16} /> Havolani yangilash
            </button>
          </div>
        </div>

        <SchoolSidePanel />
      </div>

      {confirmRegenerate && (
        <ConfirmDeleteModal
          title="Havolani yangilash"
          description="Eski havola ishlamay qoladi. O'quvchilar faqat yangi havola orqali ro'yxatdan o'tishlari mumkin bo'ladi."
          confirmLabel="Yangilash"
          onConfirm={handleConfirmRegenerate}
          onClose={() => setConfirmRegenerate(false)}
        />
      )}
    </AppShell>
  );
}
