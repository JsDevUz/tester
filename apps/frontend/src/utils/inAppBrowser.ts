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

// uz.jamm.app Android'da "https://jamm.uz" uchun App Links bilan sozlangan
// (AndroidManifest.xml) — shu sababli tizim brauzerida ochilgan aynan shu
// URL, agar ilova o'rnatilgan bo'lsa, avtomatik ilovada ochiladi. In-app
// (Telegram) WebView'lar bu App Links mexanizmini chetlab o'tadi, shuning
// uchun foydalanuvchini avval tizim brauzeriga chiqarish kerak.
export function openInSystemBrowser(): void {
  const url = window.location.href;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
