import { useEffect, useState } from "react";
import { Compass, X } from "lucide-react";
import { isTelegramInAppBrowser, openInSystemBrowser } from "../utils/inAppBrowser";

// Telegram ichida aniqlanganda darhol (foydalanuvchi hech narsa bosmasdan)
// tizim brauzeriga o'tkaziladi — odatiy holatda modal umuman ko'rinmaydi,
// chunki sahifa shu zahoti tark etiladi. Modal faqat FALLBACK sifatida
// qoladi: agar auto-redirect biror sabab bilan ishlamasa (masalan WebView
// user-gesture'siz maxsus sxemalarni bloklasa), foydalanuvchida qo'lda
// urinish uchun tugma qoladi.
export function TelegramBrowserModal() {
  const [dismissed, setDismissed] = useState(false);
  const [shouldShow] = useState(() => isTelegramInAppBrowser());

  useEffect(() => {
    if (shouldShow) openInSystemBrowser();
  }, [shouldShow]);

  useEffect(() => {
    if (!shouldShow) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDismissed(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shouldShow]);

  if (!shouldShow || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setDismissed(true); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-browser-modal-title"
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-dark-surface"
      >
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Yopish"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:text-dark-ink/60 dark:hover:bg-dark-surface-2"
        >
          <X size={18} />
        </button>

        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10">
          <Compass size={28} className="text-indigo-500" />
        </div>

        <h2
          id="telegram-browser-modal-title"
          className="mb-1.5 text-base font-semibold text-gray-900 dark:text-dark-ink"
        >
          Brauzerda davom eting
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-gray-500 dark:text-dark-ink/70">
          Video qo'ng'iroq va boshqa ba'zi funksiyalar Telegram ichida ishlamaydi. Sahifani tizim brauzerida oching.
        </p>

        <button
          type="button"
          onClick={openInSystemBrowser}
          className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
        >
          Brauzerda ochish
        </button>
      </div>
    </div>
  );
}
