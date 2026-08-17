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
          <p className="text-xs font-semibold text-[var(--text-muted)]">Yuklanmoqda...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
        <div className="flex min-h-full flex-col gap-3">
          {/* Top Header */}
          <div className="px-1 py-1">
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Ro'yxatdan o'tish</h1>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Ushbu havola orqali o'quvchilar maktabingizga ro'yxatdan o'tishlari mumkin
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row items-start">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs space-y-3">
                <p className="text-xs font-bold text-[var(--text-primary)]">Taklif havolasi</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="w-full min-w-0 flex-1 rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 cursor-pointer"
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? 'Nusxalandi!' : 'Nusxalash'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
                <h2 className="mb-3 text-xs font-bold text-[var(--text-primary)]">Amallar</h2>
                <button
                  type="button"
                  onClick={() => setConfirmRegenerate(true)}
                  disabled={inviteRegenerationsRemaining <= 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <RotateCcw size={15} /> Havolani yangilash
                </button>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className={inviteRegenerationsRemaining > 0 ? 'text-[var(--text-muted)] font-medium' : 'font-semibold text-red-500'}>
                    24 soat ichida yana {inviteRegenerationsRemaining} marta yangilash mumkin
                  </span>
                  {inviteRegenerationResetAt && inviteRegenerationsRemaining <= 0 && (
                    <span className="text-[var(--text-muted)] font-medium">
                      Qayta ochiladi: {new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(inviteRegenerationResetAt))}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <SchoolSidePanel />
          </div>
        </div>
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
