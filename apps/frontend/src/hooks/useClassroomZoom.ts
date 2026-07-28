import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const MIN_ZOOM = 0.5;
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
  // Pinch juda tez-tez ketma-ket wheel/touch event chiqaradi. Agar har
  // chaqiruv "prevZoom"ni faqat React state'dan (u render paytidagina
  // yangilanadi) olsa, bir nechta event render bo'lishdan oldin bitta eski
  // qiymatdan hisoblab, natija bir zumda katta sakrashga (keyin "orqaga
  // tortilganday" tuyulishga — tebranish) olib kelardi. localZoom har
  // render'da shu yerga sinxron yoziladi, applyZoomAnchored esa navbatdagi
  // haqiqiy (hali render bo'lmagan) bazadan hisoblaydi.
  const localZoomRef = useRef(localZoom);
  localZoomRef.current = localZoom;

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
        // rAF orqali kechiktirilganda pinch tez-tez chiqaradigan ketma-ket
        // wheel eventlar orasida scroll pozitsiyasi hali tuzatilmagan
        // bo'lib qolardi — keyingi hisoblash eski (noto'g'ri) scrollTop'ga
        // asoslanib, "zoom bilan birga scroll bo'layotganday" ko'rinardi.
        // Darhol (sinxron) qo'llash bu poyga holatini yo'q qiladi.
        suppressScrollDetectRef.current = true;
        scrollEl.scrollLeft = newScrollLeft;
        scrollEl.scrollTop = newScrollTop;
        window.setTimeout(() => { suppressScrollDetectRef.current = false; }, 50);
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
  // uchun: eski va yangi zoom nisbatiga qarab scroll pozitsiyasini qayta
  // hisoblaymiz (anchor — konteyner ichidagi piksel nuqta). MUHIM: yangi
  // scrollLeft/Top qiymati shu yerda DARHOL o'rnatilmaydi — chunki bu payt
  // konteyner CSS kengligi (width: zoom*100%) hali ESKI zoom asosida
  // (DOM/layout hali yangilanmagan), scroll'ni shu asosda o'rnatish anchor
  // nuqtaning asta-sekin chetga "drift" qilib ketishiga olib kelardi.
  // Buning o'rniga anchor+eski scroll holati ref'ga yoziladi, haqiqiy
  // scrollLeft/Top esa pastdagi useLayoutEffect'da — zoom DOM'ga to'liq
  // qo'llanib, konteyner haqiqiy yangi kengligiga ega bo'lgandan KEYIN —
  // qo'llaniladi.
  const pendingAnchorRef = useRef<{ anchorClientX: number; anchorClientY: number } | null>(null);
  const applyZoomAnchored = useCallback((next: number, anchorClientX: number, anchorClientY: number) => {
    const clamped = clampZoom(next);
    const prevZoom = localZoomRef.current;
    if (clamped === prevZoom) return;
    localZoomRef.current = clamped;
    pendingAnchorRef.current = { anchorClientX, anchorClientY };
    setLocalZoom(clamped);
    if (isHost) onZoomChange?.(clamped);
  }, [isHost, onZoomChange]);

  // MUHIM: ratio endi zoom/prevZoom (state qiymatlari) orqali emas, balki
  // DOM'ning HOZIRGI (layout allaqachon qo'llangan) scrollWidth/clientWidth
  // nisbatidan orqaga hisoblanadi — bu safe-center flex-markazlash yoki
  // boshqa CSS ta'siridagi haqiqiy piksel kengligini aks ettiradi, prevZoom
  // asosidagi nazariy hisoblash esa (agar width flex/align-items:safe center
  // orqali markazlangan bo'lsa) chetlarga "borib qaytish" (silkinish)
  // ko'rinishiga olib kelardi — zoom darajasidan qat'i nazar bir xil kuchda,
  // chunki xato margin/markazlash effektidan emas, noto'g'ri anchor formula
  // taxminidan kelib chiqqan edi.
  const prevScrollWidthRef = useRef<number | null>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const pending = pendingAnchorRef.current;
    const scrollEl = scrollRef.current;
    pendingAnchorRef.current = null;
    const prevScrollWidth = prevScrollWidthRef.current;
    const prevScrollHeight = prevScrollHeightRef.current;
    prevScrollWidthRef.current = scrollEl?.scrollWidth ?? null;
    prevScrollHeightRef.current = scrollEl?.scrollHeight ?? null;
    if (!pending || !scrollEl || prevScrollWidth === null || prevScrollHeight === null) return;
    const { anchorClientX, anchorClientY } = pending;
    const rect = scrollEl.getBoundingClientRect();
    const localX = anchorClientX - rect.left;
    const localY = anchorClientY - rect.top;
    const ratioX = prevScrollWidth > 0 ? scrollEl.scrollWidth / prevScrollWidth : 1;
    const ratioY = prevScrollHeight > 0 ? scrollEl.scrollHeight / prevScrollHeight : 1;
    const newScrollLeft = (scrollEl.scrollLeft + localX) * ratioX - localX;
    const newScrollTop = (scrollEl.scrollTop + localY) * ratioY - localY;
    suppressScrollDetectRef.current = true;
    scrollEl.scrollLeft = newScrollLeft;
    scrollEl.scrollTop = newScrollTop;
    prevScrollWidthRef.current = scrollEl.scrollWidth;
    prevScrollHeightRef.current = scrollEl.scrollHeight;
    window.setTimeout(() => { suppressScrollDetectRef.current = false; }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

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

  // scrollRef — useRef bo'lgani uchun uning .current DOM elementi
  // almashganda (masalan split/single board rejimi orasida almashinganda)
  // pastdagi useEffect'lar QAYTA ISHGA TUSHMAYDI, chunki ref obyektining
  // o'zi hech qachon o'zgarmaydi — faqat .current ichidagi qiymati
  // o'zgaradi. Natijada wheel/touch listenerlar eski (endi DOM'dan
  // uzilgan) elementga ulangan holda qolib ketishi va trackpad-pinch
  // "hech narsa qilmayapti"day tuyulishi mumkin edi. `setZoomNode` — chaqiruvchi
  // tomon o'z callback-ref'i ichida `scrollRef.current = element` bilan
  // BIRGA chaqirishi kerak bo'lgan qo'shimcha funksiya; u haqiqiy DOM
  // node'ni React state'ga yozadi, shu bilan effektlar to'g'ri qayta ishga
  // tushadi.
  const [zoomNode, setZoomNode] = useState<HTMLDivElement | null>(null);

  // React'ning onWheel'i sintetik va ba'zi brauzerlarda passive bo'lib
  // qolishi mumkin — bu holda preventDefault() e'tiborsiz qoldiriladi va
  // trackpad pinch/Ctrl+wheel butun sahifani (body) zoom qilib yuboradi.
  // Shuning uchun native, passive:false listener bilan qo'shimcha
  // to'siq qo'yamiz — bu har doim ishonchli ishlaydi.
  useEffect(() => {
    const el = zoomNode;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        if (!freeToMoveRef.current) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (!freeToMoveRef.current) return;
      applyZoomAnchoredRef.current(localZoomRef.current - e.deltaY * 0.01, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", onNativeWheel);
  }, [zoomNode]);

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

  const pinchStartRef = useRef<{ distance: number; zoom: number; cx: number; cy: number } | null>(null);

  // React'ning sintetik touch handlerlari ba'zi brauzerlarda passive bo'lib
  // qolib preventDefault()ni e'tiborsiz qoldirishi mumkin — shu sabab
  // ikki barmoq bilan pinch qilinganda butun brauzer sahifasi (body) zoom
  // bo'lib ketardi. Native, passive:false listener bilan bu to'liq bloklanadi.
  useEffect(() => {
    const el = zoomNode;
    if (!el) return;

    const onNativeTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      if (!freeToMoveRef.current) { e.preventDefault(); return; }
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const cx = (a.clientX + b.clientX) / 2;
      const cy = (a.clientY + b.clientY) / 2;
      pinchStartRef.current = { distance, zoom: localZoomRef.current, cx, cy };
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

    // Mobile Safari ba'zan touch event'ni canvas/child elementda ushlab,
    // scroll container listeneriga yetkazmaydi. Capture document listeneri
    // gesture'ni barqaror ushlaydi, lekin faqat classroom viewport ichida.
    const scopedStart = (e: TouchEvent) => {
      if (e.target instanceof Node && el.contains(e.target)) onNativeTouchStart(e);
    };
    const scopedMove = (e: TouchEvent) => {
      if (e.target instanceof Node && el.contains(e.target)) onNativeTouchMove(e);
    };
    const scopedEnd = (e: TouchEvent) => {
      if (e.target instanceof Node && el.contains(e.target)) onNativeTouchEnd(e);
    };
    document.addEventListener("touchstart", scopedStart, { passive: false, capture: true });
    document.addEventListener("touchmove", scopedMove, { passive: false, capture: true });
    document.addEventListener("touchend", scopedEnd, { passive: false, capture: true });
    document.addEventListener("touchcancel", scopedEnd, { passive: false, capture: true });
    return () => {
      document.removeEventListener("touchstart", scopedStart, true);
      document.removeEventListener("touchmove", scopedMove, true);
      document.removeEventListener("touchend", scopedEnd, true);
      document.removeEventListener("touchcancel", scopedEnd, true);
    };
  }, [zoomNode]);

  return {
    zoom, freeToMove, applyZoom, resetZoomTo1, syncZoomToHost, setZoomNode,
  };
}
