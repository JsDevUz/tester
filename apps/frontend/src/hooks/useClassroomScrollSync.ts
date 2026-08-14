import { useCallback, useLayoutEffect, useRef } from "react";
import type { CsScrollPosition } from "../api/classroom";

interface Args {
  isHost: boolean;
  synced: boolean;
  currentPage: number;
  hostScroll: CsScrollPosition | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  pageElsRef: React.RefObject<Map<number, HTMLDivElement>>;
  onPageChange?: (page: number) => void;
  onScrollChange?: (page: number, yRatio: number, xRatio: number) => void;
}

// Ustoz va o'quvchi orasidagi scroll sinxronizatsiyasi — sahifa raqami +
// o'sha sahifa balandligi ichidagi nisbiy joy (yRatio) modeliga asoslangan.
// Umumiy scrollHeight foizi ISHLATILMAYDI: lazy-loading (IntersectionObserver)
// tufayli ustoz va o'quvchida bir vaqtning o'zida render qilingan sahifalar
// soni farq qilishi mumkin, bu esa umumiy balandlikni ham farqlashtirib,
// tez scroll qilinganda ikkala tomon pozitsiyasini asta-sekin siljitib
// qo'yardi ("drift"). Bitta sahifaning o'zi esa har doim fixed o'lchamda
// bo'lgani uchun page+yRatio modeli hech qachon siljimaydi.
export function useClassroomScrollSync({
  isHost, synced, currentPage, hostScroll, scrollRef, pageElsRef, onPageChange, onScrollChange,
}: Args) {
  const suppressScrollDetectRef = useRef(false);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  // Berilgan sahifaning o'zi ichidagi yRatio (0..1) pozitsiyasiga scroll
  // qiladi — sahifaning tepasi + sahifa balandligi × yRatio.
  const scrollToPagePosition = useCallback((page: number, yRatio: number, smooth: boolean) => {
    // requestAnimationFrame: sahifa lazy-render bo'lgan bo'lsa (visible
    // endigina true bo'lgan), DOM layout hali hisoblanmagan bo'lishi
    // mumkin — bir frame kutib, keyin haqiqiy o'lchamlarni o'qiymiz.
    requestAnimationFrame(() => {
      const el = pageElsRef.current?.get(page);
      const scrollEl = scrollRef.current;
      if (!el || !scrollEl) return;
      suppressScrollDetectRef.current = true;
      // offsetTop eng yaqin position:relative ota-elementga nisbatan
      // hisoblanadi, bu scroll konteynerning o'zi bo'lmasligi mumkin
      // (oralarida zoom-wide-div bor) — shuning uchun getBoundingClientRect
      // farqidan foydalanamiz, bu har doim to'g'ri natija beradi.
      const elRect = el.getBoundingClientRect();
      const scrollRect = scrollEl.getBoundingClientRect();
      const pageTop = scrollEl.scrollTop + (elRect.top - scrollRect.top);
      // Host yRatio'ni viewport MARKAZI bo'yicha yuboradi. Studentda ham
      // xuddi shu hujjat nuqtasi viewport markazida turishi kerak; uni
      // scroll oynasining tepasiga qo'yish yarim ekranlik doimiy offset
      // keltirib chiqarardi.
      const top = pageTop + elRect.height * yRatio - scrollEl.clientHeight / 2;
      scrollEl.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
      window.setTimeout(() => { suppressScrollDetectRef.current = false; }, smooth ? 500 : 50);
    });
  }, [scrollRef, pageElsRef]);

  // Faqat sahifaning tepasiga scroll qilish (yRatio=0) — masalan toggleSynced
  // yoqilganda hostScroll hali kelmagan bo'lsa fallback sifatida ishlatiladi.
  const scrollToPage = useCallback((page: number, smooth: boolean) => {
    scrollToPagePosition(page, 0, smooth);
  }, [scrollToPagePosition]);

  // Ustoz uchun currentPage/hostScroll manba emas, natija: u qo'lda scroll
  // qiladi, biz shuni kuzatib chiqarib beramiz (pastda handleScroll).
  // O'quvchi uchun esa bular ustozdan kelgan manba — faqat "synced" yoqiq
  // bo'lsa avtomatik shu pozitsiyaga scroll qilinadi. "instant" ishlatamiz
  // (smooth emas): ustoz tez-tez scroll qilsa, ketma-ket smooth-animatsiyalar
  // bir-birini kesib, oxirgi pozitsiya ustozning haqiqiy joyidan orqada
  // qolib "sinxron chalkashish"ga olib kelardi.
  useLayoutEffect(() => {
    if (isHost || !synced) return;
    if (hostScroll) scrollToPagePosition(hostScroll.page, hostScroll.yRatio, false);
    else scrollToPage(currentPage, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, hostScroll, isHost, synced, scrollToPage, scrollToPagePosition]);

  // Ustoz qo'lda scroll qilganda: ko'rinadigan oyna markaziga eng yaqin
  // sahifani "joriy sahifa" deb hisoblaymiz (toolbar uchun) va o'sha
  // sahifa ichidagi nisbiy joyni (yRatio) tashqariga chiqarib beramiz.
  const scrollDetectRaf = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (suppressScrollDetectRef.current) return;
    if (scrollDetectRaf.current) cancelAnimationFrame(scrollDetectRaf.current);
    scrollDetectRaf.current = requestAnimationFrame(() => {
      const scrollEl = scrollRef.current;
      const pageEls = pageElsRef.current;
      if (!scrollEl || !pageEls) return;
      const viewportMid = scrollEl.getBoundingClientRect().top + scrollEl.clientHeight / 2;
      let closestPage = currentPageRef.current;
      let closestDist = Infinity;
      let closestRect: DOMRect | null = null;
      for (const [page, el] of pageEls) {
        const rect = el.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const dist = Math.abs(mid - viewportMid);
        if (dist < closestDist) { closestDist = dist; closestPage = page; closestRect = rect; }
      }
      if (closestPage !== currentPageRef.current) {
        currentPageRef.current = closestPage;
        onPageChange?.(closestPage);
      }
      if (isHost && onScrollChange && closestRect) {
        const yRatio = closestRect.height > 0
          ? Math.min(1, Math.max(0, (viewportMid - closestRect.top) / closestRect.height))
          : 0;
        const xRatio = scrollEl.scrollWidth > scrollEl.clientWidth
          ? Math.min(1, Math.max(0, scrollEl.scrollLeft / (scrollEl.scrollWidth - scrollEl.clientWidth)))
          : 0;
        onScrollChange(closestPage, yRatio, xRatio);
      }
    });
  }, [isHost, onPageChange, onScrollChange, scrollRef, pageElsRef]);

  return { suppressScrollDetectRef, scrollToPage, scrollToPagePosition, handleScroll };
}
