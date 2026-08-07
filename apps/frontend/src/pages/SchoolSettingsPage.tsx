import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { useSchoolStore } from '../stores/schoolStore';
import { apiUploadMedia } from '../api/questions';

const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;

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
    if (!file.type.startsWith('image/')) return;
    setUploadingLogo(true);
    try {
      const { url } = await apiUploadMedia(file, 'avatars');
      await setSchoolImage(url);
    } finally {
      setUploadingLogo(false);
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
          <h1 className="mb-4 text-lg font-bold text-gray-800">Maktab sozlamalari</h1>

          <div className="rounded-2xl bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-gray-800">Maktab nomi va tavsifi</h2>
            <p className="mb-4 text-sm text-gray-400">Bu yerda maktab nomi va tavsifini tahrirlashingiz mumkin</p>

            <div className="mb-4 flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gray-100">
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-gray-400">Rasm yo'q</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  aria-label="Maktab rasmini o'zgartirish"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white shadow ring-2 ring-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
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
              <p className="text-sm text-gray-500">Maktab rasmi</p>
            </div>

            <p className="mb-1.5 text-sm text-gray-500">Maktab nomi</p>
            <input
              value={name}
              onChange={(e) => void renameSchool(e.target.value.slice(0, NAME_MAX))}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mb-4 mt-1 text-right text-xs text-gray-300">{name.length} / {NAME_MAX}</p>

            <p className="mb-1.5 text-sm text-gray-500">Tavsif</p>
            <textarea
              value={description}
              onChange={(e) => void setSchoolDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              placeholder="Maktabingiz haqida qisqacha ma'lumot"
              rows={3}
              className="w-full resize-none rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mt-1 text-right text-xs text-gray-300">{description.length} / {DESCRIPTION_MAX}</p>
          </div>
        </div>

        <SchoolSidePanel />
      </div>
    </AppShell>
  );
}
