import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { useSchoolStore } from '../stores/schoolStore';
import { apiUploadMedia } from '../api/questions';

const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export function SchoolSettingsPage() {
  const { name, description, imageUrl, loaded, loadSchool, renameSchool, setSchoolDescription, setSchoolImage } = useSchoolStore();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadSchool();
  }, [loadSchool]);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error("Faqat rasm fayllarini yuklash mumkin");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Rasm hajmi 5 MB dan oshmasligi kerak");
      return;
    }
    setUploadingLogo(true);
    try {
      const { url } = await apiUploadMedia(file, 'avatars');
      await setSchoolImage(url);
    } catch {
      toast.error("Rasmni yuklab bo'lmadi");
    } finally {
      setUploadingLogo(false);
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
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Maktab sozlamalari</h1>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Maktab nomi, logotipi va tavsifini boshqarish</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row items-start">
            <div className="min-w-0 flex-1 rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-[var(--card-bg)]">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-[var(--text-muted)] font-medium">Rasm yo'q</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    aria-label="Maktab rasmini o'zgartirish"
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white shadow ring-2 ring-[var(--surface-bg)] transition-colors hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
                  >
                    {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">Maktab rasmi</p>
                  <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">PNG, JPG yoki WebP (maks 5MB)</p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Maktab nomi</label>
                <input
                  value={name}
                  onChange={(e) => void renameSchool(e.target.value.slice(0, NAME_MAX))}
                  className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
                <p className="mt-1 text-right text-[10px] font-semibold text-[var(--text-muted)]">{name.length} / {NAME_MAX}</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Tavsif</label>
                <textarea
                  value={description}
                  onChange={(e) => void setSchoolDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                  placeholder="Maktabingiz haqida qisqacha ma'lumot"
                  rows={8}
                  className="w-full min-h-[170px] resize-y rounded-xl bg-[var(--card-bg)] py-3 px-3.5 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
                <p className="mt-1 text-right text-[10px] font-semibold text-[var(--text-muted)]">{description.length} / {DESCRIPTION_MAX}</p>
              </div>
            </div>

            <SchoolSidePanel />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
