import { useEffect, useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { ConfirmDeleteModal } from '../components/course/ConfirmDeleteModal';
import { useSchoolStore } from '../stores/schoolStore';

export function SchoolInvitePage() {
  const {
    inviteToken,
    inviteRegenerationsRemaining,
    inviteRegenerationResetAt,
    loaded,
    loadSchool,
    regenerateInviteToken,
  } = useSchoolStore();
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    void loadSchool();
  }, [loadSchool]);

  const inviteLink = `${window.location.origin}/school-invite/${inviteToken}`;

  function handleCopy() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleConfirmRegenerate() {
    if (regenerating || inviteRegenerationsRemaining <= 0) return;
    setRegenerating(true);
    try {
      await regenerateInviteToken();
      setConfirmRegenerate(false);
      toast.success("Taklif havolasi yangilandi");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Havolani yangilab bo'lmadi");
    } finally {
      setRegenerating(false);
    }
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
              disabled={inviteRegenerationsRemaining <= 0}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              <RotateCcw size={16} /> Havolani yangilash
            </button>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className={inviteRegenerationsRemaining > 0 ? 'text-gray-400' : 'font-medium text-red-500'}>
                24 soat ichida yana {inviteRegenerationsRemaining} marta yangilash mumkin
              </span>
              {inviteRegenerationResetAt && inviteRegenerationsRemaining <= 0 && (
                <span className="text-gray-400">
                  Qayta ochiladi: {new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(inviteRegenerationResetAt))}
                </span>
              )}
            </div>
          </div>
        </div>

        <SchoolSidePanel />
      </div>

      {confirmRegenerate && (
        <ConfirmDeleteModal
          title="Havolani yangilash"
          description="Eski havola ishlamay qoladi. O'quvchilar faqat yangi havola orqali ro'yxatdan o'tishlari mumkin bo'ladi."
          confirmLabel={regenerating ? "Yangilanmoqda..." : `Yangilash (${inviteRegenerationsRemaining} ta qoldi)`}
          onConfirm={() => void handleConfirmRegenerate()}
          onClose={() => { if (!regenerating) setConfirmRegenerate(false); }}
        />
      )}
    </AppShell>
  );
}
