import { useEffect, useRef, useState } from "react";

const AUTO_HIDE_MS = 3000;

// PDF ustidagi floating panellar (toolbar, zoom/move tugmalari) uchun:
// 3 soniya harakatsizlikdan keyin yashiriniladi (top-panellar tepaga,
// bottom-panellar pastga sirg'alib chiqib ketadi), ekranga tegilganda yoki
// sichqoncha harakatlanganda qayta ko'rinadi. Mobil ekranni ortiqcha
// band qilmaslik uchun ishlatiladi.
export function useAutoHideOverlay() {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<number | null>(null);

  const scheduleHide = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  };

  const reveal = () => {
    setVisible(true);
    scheduleHide();
  };

  useEffect(() => {
    scheduleHide();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handlePointerMove() { reveal(); }
    function handleTouchStart() { reveal(); }
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchstart", handleTouchStart);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { visible, reveal };
}
