import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const PANEL_GAP = 100;

// Style panel (Shape/TextStylePanel) odatda tanlangan obyekt USTIDA ochiladi.
// Buni obyektning SAHIFA-ICHIDAGI (page-relative) koordinatasidan oldindan
// hisoblab bo'lmaydi — sahifa scroll qilingan yoki juda uzun/qisqa bo'lganda
// bu koordinata haqiqiy VIEWPORT holatiga mos kelmaydi (masalan Notebook
// rejimida sahifa balandligi kichik bo'lsa, bu "tepada joy yo'q" degan
// noto'g'ri xulosaga olib kelib, panel doim pastga ochilib qolardi). Shu
// sabab panel avval (görünmas holda, top-based taxminiy joyda) DOM'ga
// chiqariladi, useLayoutEffect'da haqiqiy getBoundingClientRect() bilan
// viewport chegarasi tekshiriladi — faqat panelning TEPASI haqiqatan ham
// ekran tashqarisiga chiqqan bo'lsa, pastga ko'chiriladi.
export function AutoFlipPositioner({
  anchorLeft,
  anchorTopPx,
  anchorBottomPx,
  centered = true,
  children,
}: {
  /** left CSS qiymati (masalan "50%" yoki "120px") — anchor nuqtaning X pozitsiyasi. */
  anchorLeft: string;
  anchorTopPx: number;
  anchorBottomPx: number;
  /** true bo'lsa panel anchorLeft atrofida markazlashadi (translateX(-50%)). */
  centered?: boolean;
  children: (openBelow: boolean) => ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [openBelow, setOpenBelow] = useState(false);
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // MUHIM: panelning joriy DOM pozitsiyasi (rect.top) "openBelow"ning
    // hozirgi holatiga bog'liq (u tepada yoki pastda joylashgan bo'lishi
    // mumkin) — shuni to'g'ridan-to'g'ri "yetarli joy bormi" tekshiruviga
    // ishlatish tebranishga (oscillation) olib keladi: panel pastga flip
    // qilingach, DOM'da endi pastda; keyingi o'lchov "hozir tepada joy bor"
    // deb topib, uni yana tepaga qaytaradi — cheksiz tsikl yoki noto'g'ri
    // "qotib qolish". Shuning uchun openBelow HOLATIDAN MUSTAQIL hisoblash
    // kerak: panelning shunchaki BALANDLIGINI (getBoundingClientRect().height,
    // bu flip yo'nalishidan qat'i nazar bir xil) olib, "agar tepada
    // ochilsa, anchorTopPx dan yuqorida shuncha joy YETARLIMI" deb
    // to'g'ridan-to'g'ri hisoblaymiz.
    const panelHeight = el.getBoundingClientRect().height;
    const fitsAbove = anchorTopPx - panelHeight - PANEL_GAP >= 0;
    setOpenBelow(!fitsAbove);
    setMeasured(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorTopPx, anchorBottomPx]);

  const translateX = centered ? "-50%" : "0";

  return (
    <div
      ref={wrapRef}
      className="absolute z-40"
      style={{
        left: anchorLeft,
        top: openBelow ? `${anchorBottomPx + PANEL_GAP}px` : `${anchorTopPx - PANEL_GAP}px`,
        transform: openBelow
          ? `translate(${translateX}, 0)`
          : `translate(${translateX}, -100%)`,
        visibility: measured ? "visible" : "hidden",
      }}
    >
      {children(openBelow)}
    </div>
  );
}
