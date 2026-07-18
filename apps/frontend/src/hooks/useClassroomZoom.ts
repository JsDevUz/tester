import { useCallback, useEffect, useRef, useState } from "react";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 0.25;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

interface Args {
  isHost: boolean;
  synced: boolean;
  hostZoom: number;
  onZoomChange?: (zoom: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  suppressScrollDetectRef: React.RefObject<boolean>;
}

// Zoom holati + desktop trackpad-pinch (Ctrl/Cmd+wheel) va mobil ikki-barmoq
// pinch-zoom boshqaruvi. Ikkalasi ham cursor/pinch-markazini ekranda fixed
// nuqta sifatida saqlab qoladi ("anchor"), va brauzerning NATIVE
// document-zoom'iga aylanib ketishining oldini oladi (native listener +
// preventDefault(), touch-action'da "pinch-zoom" so'zi ataylab yo'q).
export function useClassroomZoom({ isHost, synced, hostZoom, onZoomChange, scrollRef, suppressScrollDetectRef }: Args) {
  // Ustoz uchun: local zoom, o'zgarganda serverga yuboriladi (onZoomChange).
  // O'quvchi uchun: sinxron rejimda hostZoom'ga ko'r-ko'rona ergashadi,
  // erkin rejimda esa o'zining local zoom'i ishlaydi.
  const [localZoom, setLocalZoom] = useState(hostZoom);
  const zoom = isHost ? localZoom : (synced ? hostZoom : localZoom);

  // Ustoz zoom'i o'zgarganda: sinxron o'quvchida darhol qo'llanadi.
  // Ustozning o'zida esa bu prop faqat boshlang'ich qiymat (keyin local).
  // Scroll konteynerining markazini anchor sifatida olamiz — chunki
  // o'quvchining sichqonchasi ustozning zoom nuqtasida emas.
  useEffect(() => {
    if (isHost) return;
    const scrollEl = scrollRef.current;
    setLocalZoom((prevZoom) => {
      if (scrollEl && hostZoom !== prevZoom) {
        const rect = scrollEl.getBoundingClientRect();
        const localX = rect.width / 2;
        const localY = rect.height / 2;
        const contentX = scrollEl.scrollLeft + localX;
        const contentY = scrollEl.scrollTop + localY;
        const ratio = hostZoom / prevZoom;
        const newScrollLeft = contentX * ratio - localX;
        const newScrollTop = contentY * ratio - localY;
        requestAnimationFrame(() => {
          suppressScrollDetectRef.current = true;
          scrollEl.scrollLeft = newScrollLeft;
          scrollEl.scrollTop = newScrollTop;
          window.setTimeout(() => { suppressScrollDetectRef.current = false; }, 50);
        });
      }
      return hostZoom;
    });
  }, [isHost, hostZoom, scrollRef, suppressScrollDetectRef]);

  // Sinxron rejimga qaytilganda zoom ham ustoznikiga tenglashadi.
  useEffect(() => {
    if (!isHost && synced) setLocalZoom(hostZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced]);

  const resetZoomTo1 = useCallback(() => setLocalZoom(1), []);
  const syncZoomToHost = useCallback(() => setLocalZoom(hostZoom), [hostZoom]);

  // Zoom o'zgarganda sichqoncha/pinch markazi ekranda bir joyda qolishi
  // uchun: eski va yangi zoom nisbatiga qarab scroll pozitsiyasini
  // qayta hisoblaymiz (anchor — konteyner ichidagi piksel nuqta).
  const applyZoomAnchored = useCallback((next: number, anchorClientX: number, anchorClientY: number) => {
    const clamped = clampZoom(next);
    const scrollEl = scrollRef.current;
    setLocalZoom((prevZoom) => {
      if (scrollEl && clamped !== prevZoom) {
        const rect = scrollEl.getBoundingClientRect();
        const localX = anchorClientX - rect.left;
        const localY = anchorClientY - rect.top;
        const contentX = scrollEl.scrollLeft + localX;
        const contentY = scrollEl.scrollTop + localY;
        const ratio = clamped / prevZoom;
        const newScrollLeft = contentX * ratio - localX;
        const newScrollTop = contentY * ratio - localY;
        requestAnimationFrame(() => {
          suppressScrollDetectRef.current = true;
          scrollEl.scrollLeft = newScrollLeft;
          scrollEl.scrollTop = newScrollTop;
          window.setTimeout(() => { suppressScrollDetectRef.current = false; }, 50);
        });
      }
      return clamped;
    });
    if (isHost) onZoomChange?.(clamped);
  }, [isHost, onZoomChange, scrollRef, suppressScrollDetectRef]);

  // Tugmalar (+/-/reset) uchun: aniq anchor nuqta yo'q, shuning uchun
  // ko'rinadigan oyna markazini anchor sifatida olamiz.
  const applyZoom = useCallback((next: number) => {
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      applyZoomAnchored(next, rect.left + rect.width / 2, rect.top + rect.height / 2);
      return;
    }
    const clamped = clampZoom(next);
    setLocalZoom(clamped);
    if (isHost) onZoomChange?.(clamped);
  }, [isHost, onZoomChange, applyZoomAnchored, scrollRef]);

  const freeToMove = isHost || !synced;
  const freeToMoveRef = useRef(freeToMove);
  freeToMoveRef.current = freeToMove;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const applyZoomAnchoredRef = useRef(applyZoomAnchored);
  applyZoomAnchoredRef.current = applyZoomAnchored;

  // React'ning onWheel'i sintetik va ba'zi brauzerlarda passive bo'lib
  // qolishi mumkin — bu holda preventDefault() e'tiborsiz qoldiriladi va
  // trackpad pinch/Ctrl+wheel butun sahifani (body) zoom qilib yuboradi.
  // Shuning uchun native, passive:false listener bilan qo'shimcha
  // to'siq qo'yamiz — bu har doim ishonchli ishlaydi.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        if (!freeToMoveRef.current) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (!freeToMoveRef.current) return;
      applyZoomAnchoredRef.current(zoomRef.current - e.deltaY * 0.01, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", onNativeWheel);
  }, [scrollRef]);

  // Qo'shimcha himoya: agar trackpad-pinch sichqoncha PDF konteynerdan
  // chetga (masalan toolbar yoki bo'sh joy ustida) chiqib ketsa ham,
  // butun sahifa (body) darajasida Ctrl/Cmd+wheel zoom bloklanadi — aks
  // holda desktop trackpad pinch butun brauzer sahifasini kattalashtirib yuborardi.
  useEffect(() => {
    const onDocumentWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    document.addEventListener("wheel", onDocumentWheel, { passive: false });
    return () => document.removeEventListener("wheel", onDocumentWheel);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Asosiy ish native listenerda bajariladi — bu yerda faqat React'ga
    // event allaqachon boshqarilganini bildiramiz.
    e.preventDefault();
  }, []);

  const pinchStartRef = useRef<{ distance: number; zoom: number; cx: number; cy: number } | null>(null);

  // React'ning sintetik touch handlerlari ba'zi brauzerlarda passive bo'lib
  // qolib preventDefault()ni e'tiborsiz qoldirishi mumkin — shu sabab
  // ikki barmoq bilan pinch qilinganda butun brauzer sahifasi (body) zoom
  // bo'lib ketardi. Native, passive:false listener bilan bu to'liq bloklanadi.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onNativeTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      if (!freeToMoveRef.current) { e.preventDefault(); return; }
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const cx = (a.clientX + b.clientX) / 2;
      const cy = (a.clientY + b.clientY) / 2;
      pinchStartRef.current = { distance, zoom: zoomRef.current, cx, cy };
    };
    const onNativeTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      if (!freeToMoveRef.current) { e.preventDefault(); return; }
      if (!pinchStartRef.current) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const { distance: startDistance, zoom: startZoom, cx, cy } = pinchStartRef.current;
      applyZoomAnchoredRef.current(startZoom * (distance / startDistance), cx, cy);
    };
    const onNativeTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStartRef.current = null;
    };

    el.addEventListener("touchstart", onNativeTouchStart, { passive: false });
    el.addEventListener("touchmove", onNativeTouchMove, { passive: false });
    el.addEventListener("touchend", onNativeTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onNativeTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onNativeTouchStart);
      el.removeEventListener("touchmove", onNativeTouchMove);
      el.removeEventListener("touchend", onNativeTouchEnd);
      el.removeEventListener("touchcancel", onNativeTouchEnd);
    };
  }, [scrollRef]);

  return {
    zoom, freeToMove, applyZoom, resetZoomTo1, syncZoomToHost, handleWheel,
  };
}
