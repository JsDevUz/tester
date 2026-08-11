// Telegram (va boshqa ijtimoiy tarmoq) ilovalari havolani o'zining ichki
// WebView'ida ochadi — bu WebView LiveKit (video/audio qo'ng'iroq), fayl
// yuklash kabi ba'zi brauzer imkoniyatlarini cheklaydi yoki umuman qo'llab-
// quvvatlamaydi. Bunday holatni aniqlash uchun bitta universal signal yo'q
// (in-app brauzerlar odatda o'z User-Agent'iga hech narsa qo'shmaydi —
// asosiy tizim WebView'iga tayanadi), shuning uchun bir nechta signal
// birlashtiriladi:
//  - Android: Telegram o'zining "TelegramWebviewProxy" JS interfeysini
//    window'ga in'ektsiya qiladi — bu eng ishonchli signal.
//  - iOS/Android: ba'zi Telegram versiyalari User-Agent'ga "Telegram"
//    so'zini qo'shadi (versiyaga qarab o'zgaruvchan, lekin mavjud bo'lsa
//    foydali).
export function isTelegramInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  if (/Telegram/i.test(ua)) return true;
  if ("TelegramWebviewProxy" in window) return true;
  return false;
}

// "https://jamm.uz" tizim darajasida RN ilovaga bog'langan bo'lishi mumkin
// (Android App Links, yoki Telegram'ning o'z domen-ochish xulq-atvori
// iOS'da) — oddiy <a target="_blank">/window.open orqali ochilsa ham,
// foydalanuvchi BRAUZERDA qolishni xohlagan holatda ilovaga yo'naltirilib
// yuborilishi mumkin. Buni chetlab o'tish uchun platformaga xos, faqat
// brauzerni ochishga majburlaydigan sxemalar ishlatiladi:
//  - Android: "intent://" — aniq brauzer package'ini (Chrome) belgilaydi,
//    tizimning App Links/Digital Asset Links tekshiruvini ishga tushirmaydi.
//  - iOS: "x-safari-https://" — Safari'ning o'z maxsus sxemasi, boshqa
//    hech qanday ilova (Universal Links orqali ham) buni ushlab qololmaydi,
//    URL to'g'ridan-to'g'ri Safari'da ochiladi.
export function openInSystemBrowser(): void {
  const url = window.location.href;
  const ua = window.navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  if (isAndroid) {
    const withoutScheme = url.replace(/^https?:\/\//, "");
    // S.browser_fallback_url: Chrome o'rnatilmagan bo'lsa (kamdan-kam
    // holat) yoki intent ishlamasa, brauzer tanlash chooser'iga tushadi.
    const intentUrl =
      `intent://${withoutScheme}#Intent;scheme=https;` +
      `package=com.android.chrome;` +
      `S.browser_fallback_url=${encodeURIComponent(url)};end`;
    window.location.href = intentUrl;
    return;
  }

  if (isIOS) {
    window.location.href = url.replace(/^https:\/\//, "x-safari-https://");
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
