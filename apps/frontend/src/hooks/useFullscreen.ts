import { useCallback, useEffect, useState } from "react";

// Safari (ayniqsa iOS) hali ham eski vendor-prefiksli Fullscreen API'ni
// ishlatadi — standart va webkit variantlarini birga qo'llab-quvvatlaymiz.
// iOS Safari'da <video> bo'lmagan elementlar uchun fullscreen umuman
// qo'llab-quvvatlanmasligi mumkin (Apple platform cheklovi) — shu holatda
// `supported=false` qaytariladi va tugma ko'rsatilmaydi.
interface FullscreenDoc extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}
interface FullscreenEl extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

// MUHIM: fullscreen har doim document.documentElement (butun <html>) uchun
// so'raladi, biror ichki div uchun emas. Agar faqat sahifaning bitta ichki
// konteyneri fullscreen qilinsa, React Portal orqali document.body'ga
// chiqarilgan modal/panel (masalan o'quvchilar ro'yxati) fullscreen
// elementning DOM subtree'sidan TASHQARIDA qolib ketadi — brauzer fullscreen
// paytida faqat shu subtree'ni "top layer"da chizadi, shuning uchun portal
// orqali ochilgan modal ko'rinmay/ochilmay qolardi.
export function useFullscreen(_ref?: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const doc = document as FullscreenDoc;
  const supported = Boolean(
    document.fullscreenEnabled ||
    (doc as any).webkitFullscreenEnabled,
  );

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [doc]);

  const toggle = useCallback(async () => {
    const el = document.documentElement as FullscreenEl;
    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } else {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      }
    } catch (e) {
      console.error("Fullscreen rejimini almashtirib bo'lmadi:", e);
    }
  }, [doc]);

  return { isFullscreen, supported, toggle };
}
