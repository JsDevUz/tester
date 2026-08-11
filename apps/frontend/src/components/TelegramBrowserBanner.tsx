import { useState } from "react";
import { ExternalLink, Smartphone, X } from "lucide-react";
import { isTelegramInAppBrowser, openInSystemBrowser } from "../utils/inAppBrowser";

// "Telegram ichida ochish" tugmasi ham tashqi brauzerga chiqaradi — App
// Links (AndroidManifest.xml) tizim brauzerida ochilgan https://jamm.uz'ni
// avtomatik ilovaga yo'naltiradi, agar u o'rnatilgan bo'lsa. Shu sabab
// alohida "ilovada och" havolasi shart emas: tashqi brauzerga chiqarishning
// o'zi (agar ilova bor bo'lsa) uni ochib beradi, yo'q bo'lsa oddiy sayt
// sifatida ishlayveradi.
export function TelegramBrowserBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [shouldShow] = useState(() => isTelegramInAppBrowser());

  if (!shouldShow || dismissed) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] flex items-center gap-3 bg-indigo-600 px-4 py-3 text-white shadow-lg">
      <Smartphone size={20} className="shrink-0" />
      <p className="flex-1 text-sm font-medium">
        Ba'zi funksiyalar (video qo'ng'iroq va h.k.) Telegram ichida ishlamasligi mumkin.
      </p>
      <button
        type="button"
        onClick={openInSystemBrowser}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-50"
      >
        <ExternalLink size={14} />
        Brauzerda ochish
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Yopish"
        className="shrink-0 rounded-full p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  );
}
