import { useEffect, useRef, useState, type ReactNode } from "react";

const AUTO_HIDE_MS = 3000;
const REVEAL_ZONE_PX = 12; // desktopda sichqoncha shu masofada bo'lsa ochiladi

// Header 3 soniyadan keyin yuqoriga sirg'alib yashiriniladi (kontent shu
// bo'shagan joyni egallab tepaga suriladi — position:absolute emas, DOM
// balandligi 0 bo'ladi). Mobil: ekranga bosilsa qayta ochiladi. Desktop:
// sichqoncha ekran tepasiga borsa ochiladi.
export function AutoHideHeader({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  // Tinch holatda (yoyilgan, animatsiya tugagan) overflow ochiq bo'lishi
  // kerak — aks holda ichkaridagi popover (masalan O'quvchilar paneli)
  // header chegarasidan tashqariga chiqolmay kesilib qoladi. Faqat
  // yashirinish/ochilish animatsiyasi paytida vaqtincha kesamiz.
  const [clipDuringAnim, setClipDuringAnim] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const clipTimerRef = useRef<number | null>(null);

  const scheduleHide = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  };

  // visible o'zgarganda 300ms (animatsiya davomiyligi) davomida kesamiz,
  // shundan keyin ochiq holatda tiniq ko'rinishi uchun overflow'ni ochamiz.
  useEffect(() => {
    setClipDuringAnim(true);
    if (clipTimerRef.current) window.clearTimeout(clipTimerRef.current);
    clipTimerRef.current = window.setTimeout(() => setClipDuringAnim(false), 300);
    return () => {
      if (clipTimerRef.current) window.clearTimeout(clipTimerRef.current);
    };
  }, [visible]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMeasuredHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reveal = () => {
    setVisible(true);
    scheduleHide();
  };

  useEffect(() => {
    // Desktop: sichqoncha ekran tepasiga yaqinlashsa ochiladi
    function handleMouseMove(e: MouseEvent) {
      if (e.clientY <= REVEAL_ZONE_PX) reveal();
    }
    // Mobil: faqat ekranning tepa chetiga (reveal zone) tegilsa ochiladi —
    // PDF ustidagi zoom/move/o'quvchilar kabi tugmalarga tegish header'ni
    // ochib yubormasligi kerak, aks holda ular bosilganda ekran "sakraydi".
    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch || touch.clientY > REVEAL_ZONE_PX) return;
      setVisible((v) => {
        if (!v) { scheduleHide(); return true; }
        return v;
      });
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchstart", handleTouchStart);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`shrink-0 transition-[height] duration-300 ease-in-out ${clipDuringAnim ? "overflow-hidden" : "overflow-visible"}`}
      style={{ height: visible ? (measuredHeight ?? "auto") : 0 }}
      onMouseEnter={reveal}
      onPointerDown={reveal}
    >
      <div
        ref={contentRef}
        className="transition-transform duration-300 ease-in-out"
        style={{ transform: visible ? "translateY(0)" : "translateY(-100%)" }}
      >
        {children}
      </div>
    </div>
  );
}
