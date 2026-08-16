import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Columns2,
  Minus,
  Move,
  Plus,
  Repeat2,
  RotateCcw as ResetZoom,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CsBoardLayout,
  CsBoardMode,
  CsNotebookOrientation,
  CsNotebookStyle,
  CsPointer,
  CsScrollPosition,
  CsStroke,
} from "../../api/classroom";
import { useAutoHideOverlay } from "../../hooks/useAutoHideOverlay";
import { useClassroomScrollSync } from "../../hooks/useClassroomScrollSync";
import {
  useClassroomZoom,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
} from "../../hooks/useClassroomZoom";
import type { ShapeStyle } from "./classroomCanvasText";
import {
  ClassroomPdfPage,
  type DrawTool,
  type ClassroomNotebookClipboard,
  type ClassroomPageClipboard,
  CLASSROOM_PAGE_CLIPBOARD_KEY,
} from "./ClassroomPdfPage";

export type { DrawTool };

interface Props {
  // Ustoz hozirgacha ochgan barcha sahifalar (1-indexed ko'rinishda tartiblangan)
  pageUrls: string[];
  // 1-indexed — ustozning joriy sahifasi. Sinxron rejimda shu yerga scroll qilinadi.
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  rightStrokesByPage?: Record<number, CsStroke[]>;
  strokesByMode?: Record<CsBoardMode, Record<number, CsStroke[]>>;
  pointer: CsPointer | null;
  editable: boolean;
  // Ustoz uchun erkin/sinxron toggle ko'rsatilmaydi — u har doim o'zi boshqaradi.
  isHost: boolean;
  // Ustozning serverga saqlangan zoom darajasi — o'quvchi sinxron rejimda
  // shunga moslashadi. Ustoz uchun bu boshlang'ich qiymat, keyin local
  // boshqariladi (onZoomChange orqali serverga yuboriladi).
  hostZoom: number;
  rightHostZoom?: number;
  // Split panel chap qismining umumiy kenglikka nisbati (0.2-0.8). Ustoz
  // uchun boshlang'ich qiymat, keyin local boshqariladi (onSetSplitRatio
  // orqali serverga yuboriladi). Berilmasa 0.5 (teng) ishlatiladi.
  hostSplitRatio?: number;
  onSetSplitRatio?: (ratio: number) => void;
  onZoomChange?: (zoom: number) => void;
  onPaneZoomChange?: (pane: "left" | "right", zoom: number) => void;
  // Ustozning aniq scroll pozitsiyasi — sahifa raqami + o'sha sahifa
  // balandligi ichidagi nisbiy joy. Device/ekran o'lchamidan qat'i nazar
  // bir xil joyni bildiradi (umumiy scrollHeight'ga bog'liq emas).
  hostScroll: CsScrollPosition | null;
  rightHostScroll?: CsScrollPosition | null;
  onScrollChange?: (page: number, yRatio: number, xRatio: number) => void;
  onPaneScrollChange?: (
    pane: "left" | "right",
    page: number,
    yRatio: number,
    xRatio: number,
  ) => void;
  tool: DrawTool;
  // Matn yozib bo'lib saqlagach avtomatik "select" asboziga o'tish uchun —
  // Excalidraw/Miro kabi, matn yozib bo'lgach darhol qayta tanlash/tahrirlash
  // mumkin bo'lishi kerak, "text" asbobi bilan yana bosib yangi matn
  // boshlanib qolmasin.
  onToolChange?: (tool: DrawTool) => void;
  color: string;
  colorNonce?: number;
  onColorChange?: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange?: (width: number) => void;
  // To'rtburchak/doira asboblari uchun joriy uslub — yangi shape shu
  // qiymatlar bilan yaratiladi. onShapeStyleChange — hali hech narsa
  // chizilmagan, faqat asbob tanlangan holatda ham (Excalidraw kabi)
  // sozlamalar panelini ko'rsatish uchun.
  shapeStyle?: ShapeStyle;
  onShapeStyleChange?: (style: ShapeStyle) => void;
  onUpdateShapeStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onPaneUpdateShapeStroke?: (
    pane: "left" | "right",
    mode: CsBoardMode,
    page: number,
    stroke: CsStroke,
    groupId?: string,
  ) => void;
  onReorderStroke?: (
    page: number,
    strokeIds: string[],
    op: "front" | "back" | "forward" | "backward",
  ) => void;
  onPaneReorderStroke?: (
    pane: "left" | "right",
    mode: CsBoardMode,
    page: number,
    strokeIds: string[],
    op: "front" | "back" | "forward" | "backward",
  ) => void;
  onStrokeComplete?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onMoveStroke?: (page: number, strokeId: string, x: number, y: number, groupId?: string) => void;
  onPaneMoveStroke?: (
    pane: "left" | "right",
    mode: CsBoardMode,
    page: number,
    strokeId: string,
    x: number,
    y: number,
    groupId?: string,
  ) => void;
  onUpdateTextStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onPaneUpdateTextStroke?: (
    pane: "left" | "right",
    mode: CsBoardMode,
    page: number,
    stroke: CsStroke,
    groupId?: string,
  ) => void;
  onPaneStrokeComplete?: (
    pane: "left" | "right",
    mode: CsBoardMode,
    page: number,
    stroke: CsStroke,
    groupId?: string,
  ) => void;
  onPointerMove?: (
    page: number,
    x: number,
    y: number,
    active: boolean,
    pane: "left" | "right",
  ) => void;
  onEraseStroke?: (page: number, strokeId: string, groupId?: string) => void;
  onPaneEraseStroke?: (
    pane: "left" | "right",
    mode: CsBoardMode,
    page: number,
    strokeId: string,
    groupId?: string,
  ) => void;
  // Pixel-eraser: bitta chizmani (strokeId) bir nechta yangi kesim-chizmalar
  // bilan almashtiradi (segment-darajasida o'chirish natijasi).
  onSplitStroke?: (
    page: number,
    strokeId: string,
    replacements: CsStroke[],
    groupId?: string,
  ) => void;
  onPaneSplitStroke?: (
    pane: "left" | "right",
    mode: CsBoardMode,
    page: number,
    strokeId: string,
    replacements: CsStroke[],
    groupId?: string,
  ) => void;
  // Ustoz qo'lda scroll qilib sahifa almashtirganda chaqiriladi (faqat isHost=true'da) —
  // shu orqali toolbar'dagi sahifa raqami va serverga yuboriladigan currentPage yangilanadi.
  onPageChange?: (page: number) => void;
  // PDF konteyner ustiga (absolute) chizish asboblari panelini joylashtirish
  // uchun — shu konteyner ichida bo'lishi kerak, aks holda uning DOM
  // balandligi PDF konteyner balandligini o'zgartirib scroll-ratio
  // hisoblarini (xRatio/yRatio) buzadi.
  toolbar?: ReactNode;
  // Toolbar qatorining o'ng tomoni — mikrofon, o'quvchilar, darsni
  // yakunlash kabi tugmalar uchun (faqat isHost holatida beriladi).
  toolbarActions?: ReactNode;
  // Split rejimda foydalanuvchi oxirgi marta qaysi panelda (chizma/matn
  // ustiga bosib) faol bo'lganini ota komponentga xabar beradi — toolbar
  // (Undo/Clear) ota tomonda tuzilgani uchun, u qaysi panelni nishonlashni
  // bilishi kerak. Har doim "left"/"right" qiymati bilan chaqiriladi,
  // hatto single (split bo'lmagan) rejimda ham har doim "left".
  onActivePaneChange?: (pane: "left" | "right") => void;
  boardMode: CsBoardMode;
  onBoardModeChange?: (mode: CsBoardMode) => void;
  boardLayout?: CsBoardLayout;
  leftBoardMode?: CsBoardMode;
  rightBoardMode?: CsBoardMode;
  onBoardViewChange?: (
    layout: CsBoardLayout,
    left: CsBoardMode,
    right: CsBoardMode,
  ) => void;
  // Har bir daftar sahifasining o'z naqshi (sahifa raqami -> naqsh).
  notebookPageStyles?: Record<number, CsNotebookStyle>;
  notebookPageOrientations?: Record<number, CsNotebookOrientation>;
  // Statik replay/snapshot ko'rinishi uchun — hech qanday jonli host yo'q,
  // shuning uchun "ustoz bilan sinxronlash" tugmasi ma'nosiz (sinxronlanadigan
  // harakat umuman saqlanmagan). Bunday holatda foydalanuvchi har doim
  // erkin scroll/zoom qila oladi, tugma esa butunlay yashiriladi.
  noSync?: boolean;
  hideMoveButton?: boolean;
  // Daftar sahifalari soni (server-boshqaruvli, o'zgaruvchan) — endi
  // Sahifalar soni session.notebookPageCount'dan keladi.
  notebookPageCount?: number;
  onRemovePage?: (
    mode: CsBoardMode,
    pageIndex: number,
    pane: "left" | "right",
  ) => void;
  // Faqat ustoz uchun: "+" bosilganda PDF rejimida chaqiriladi (kutubxona
  // tanlash oqimini ochish uchun) — afterPageIndex shu sahifadan keyin
  // qo'yish nuqtasi (0-indexed).
  onInsertPdfPage?: (afterPageIndex: number, pane: "left" | "right") => void;
  onInsertNotebookPage?: (
    afterPageIndex: number,
    style: CsNotebookStyle,
    orientation: CsNotebookOrientation,
    pane: "left" | "right",
  ) => void;
  onSetNotebookPageStyle?: (
    page: number,
    style: CsNotebookStyle,
    pane: "left" | "right",
  ) => void;
  onPastePage?: (
    mode: CsBoardMode,
    afterPageIndex: number,
    pageUrl: string | undefined,
    style: CsNotebookStyle,
    orientation: CsNotebookOrientation,
    strokes: CsStroke[],
    pane: "left" | "right",
  ) => void;
  onClearPage?: (page: number, pane?: "left" | "right", mode?: CsBoardMode) => void;
  allowPageCopy?: boolean;
  activeSelectionKey?: string | null;
  onClaimSelection?: (key: string) => void;
  focusedStrokeId?: string | null;
}

export function ClassroomPdfViewer({
  pageUrls,
  currentPage,
  strokesByPage,
  rightStrokesByPage = {},
  strokesByMode,
  pointer,
  editable,
  isHost,
  hostZoom,
  onZoomChange,
  hostScroll,
  rightHostScroll = null,
  onScrollChange,
  onPaneScrollChange,
  rightHostZoom = hostZoom,
  onPaneZoomChange,
  tool,
  onToolChange,
  color,
  colorNonce,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  shapeStyle,
  onShapeStyleChange,
  onUpdateShapeStroke,
  onPaneUpdateShapeStroke,
  onReorderStroke,
  onPaneReorderStroke,
  onStrokeComplete,
  onMoveStroke,
  onPaneMoveStroke,
  onPaneStrokeComplete,
  onPointerMove,
  hostSplitRatio = 0.5,
  onSetSplitRatio,
  onEraseStroke,
  onPaneEraseStroke,
  onSplitStroke,
  onPaneSplitStroke,
  onPageChange,
  toolbar,
  toolbarActions,
  boardMode,
  onBoardModeChange,
  onUpdateTextStroke,
  onPaneUpdateTextStroke,
  onActivePaneChange,
  boardLayout = "single",
  leftBoardMode = boardMode,
  rightBoardMode = boardMode,
  onBoardViewChange,
  notebookPageStyles = {},
  notebookPageOrientations = {},
  noSync = false,
  hideMoveButton = false,
  notebookPageCount = 1,
  onRemovePage,
  onInsertPdfPage,
  onInsertNotebookPage,
  onSetNotebookPageStyle,
  onPastePage,
  onClearPage,
  allowPageCopy,
}: Props) {
  // Auto-hide faqat o'quvchi uchun (ekranni band qilmaslik uchun) — ustoz
  // toolbar/o'quvchilar/yakunlash barlariga doim tezkor kirishi kerak,
  // shuning uchun ular hech qachon yashirilmaydi.
  const { visible: autoHideVisible } = useAutoHideOverlay();
  const overlayVisible = isHost || autoHideVisible;
  const [activeSelectionKey, setActiveSelectionKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const paneScrollRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  // O'ng panel (split rejimdagi ikkinchi taxta) uchun ham chap paneldagi
  // kabi ANIQ page+yRatio modeli ishlatiladi — avval faqat umumiy
  // scrollHeight foizi (viewport balandligiga bog'liq) ishlatilardi, bu
  // ustoz va talaba turli ekran o'lchamida (masalan mobil fullscreen) bo'lsa
  // pozitsiyani mos kelmasligiga olib kelardi. `rightScrollRef` — paneScrollRefs
  // Map'idagi element uchun useClassroomScrollSync talab qiladigan
  // RefObject ko'rinishidagi proksi.
  const rightPageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const rightScrollRef = useRef<{ current: HTMLDivElement | null }>({
    get current() {
      return paneScrollRefs.current.get(1) ?? null;
    },
  }).current;
  // O'quvchi uchun: yoqilgan = sinxron (ustoz bilan birga, hech narsa
  // qimirlatib bo'lmaydi); o'chirilgan = erkin scroll/zoom. Ustoz doim
  // o'zi navigatsiya qiladi, shu toggle unga tegishli emas.
  const [synced, setSynced] = useState(!noSync);
  useEffect(() => {
    setSynced(!noSync);
  }, [noSync]);
  // Split panel kengligi: ustoz uchun hostSplitRatio to'g'ridan-to'g'ri
  // serverdan boshqariladi (onSetSplitRatio orqali). O'quvchi sinxron
  // (synced) bo'lsa ham hostSplitRatio'ga qarab ko'radi. O'quvchi erkin
  // harakatlanish (move) rejimida bo'lsa, localSplitRatio'ni mustaqil
  // sudraydi — bu qiymat serverga hech qachon yuborilmaydi.
  const [localSplitRatio, setLocalSplitRatio] = useState(hostSplitRatio);
  const effectiveSplitRatio =
    isHost || synced ? hostSplitRatio : localSplitRatio;
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const canDragSplit = !noSync && (isHost || !synced);

  const handleSplitPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!canDragSplit) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setIsDraggingSplit(true);
  };

  const handleSplitPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isDraggingSplit || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const raw = (event.clientX - rect.left) / rect.width;
    const clamped = Math.min(0.8, Math.max(0.2, raw));
    setLocalSplitRatio(clamped);
    if (isHost) onSetSplitRatio?.(clamped);
  };

  const handleSplitPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit) return;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    setIsDraggingSplit(false);
  };
  const [displayMode, setDisplayMode] = useState<CsBoardMode>(boardMode);
  const [displayLayout, setDisplayLayout] =
    useState<CsBoardLayout>(boardLayout);
  const [leftMode, setLeftMode] = useState<CsBoardMode>(leftBoardMode);
  const [rightMode, setRightMode] = useState<CsBoardMode>(rightBoardMode);
  // Har bir PDF/daftar sahifasi o'z style paneliga ega, lekin fixed panel
  // faqat oxirgi bosilgan surface uchun ko'rsatiladi. Aks holda splitdagi
  // ikki pane yoki yonma-yon visible sahifalar bir xil panelni ustma-ust
  // render qiladi.
  const [activeStyleSurface, setActiveStyleSurface] = useState({
    paneIndex: 0,
    page: currentPage,
  });
  // Barcha sahifa komponentlari uchun umumiy clipboard: source sahifa
  // unmount bo'lsa ham nusxa saqlanadi va fokuslangan boshqa sahifaga
  // Ctrl/Cmd+V orqali qo'yilishi mumkin.
  const lassoClipboardRef = useRef<CsStroke[]>([]);
  const lastSplitActionTimeRef = useRef<number>(0);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  useEffect(() => {
    setActiveStyleSurface((current) => ({
      paneIndex: displayLayout === "split" ? current.paneIndex : 0,
      page: currentPage,
    }));
  }, [currentPage, displayLayout]);

  useEffect(() => {
    onActivePaneChange?.(activeStyleSurface.paneIndex === 1 ? "right" : "left");
  }, [activeStyleSurface.paneIndex, onActivePaneChange]);

  const copyAllNotebookPages = useCallback((sourceStrokes: Record<number, CsStroke[]>) => {
    const pages: ClassroomNotebookClipboard["pages"] = Array.from(
      { length: notebookPageCount },
      (_, index) => {
        const page = index + 1;
        return {
          notebookStyle: notebookPageStyles[page] ?? "grid",
          notebookOrientation: notebookPageOrientations[page] ?? "portrait",
          strokes: (sourceStrokes[page] ?? []).map((stroke) => ({
            ...stroke,
            points: [...stroke.points],
          })),
        };
      },
    );
    const clipboard: ClassroomNotebookClipboard = {
      version: 1,
      type: "classroom-notebook-pages",
      mode: "notebook",
      pages,
    };
    const serialized = JSON.stringify(clipboard);
    localStorage.setItem(CLASSROOM_PAGE_CLIPBOARD_KEY, serialized);
    lassoClipboardRef.current = [];
    void navigator.clipboard?.writeText(serialized).catch(() => { });
    toast.success("Daftar nusxalandi");
  }, [notebookPageCount, notebookPageOrientations, notebookPageStyles]);

  useEffect(() => {
    if (!isHost || !onPastePage) return;
    const handlePagePaste = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.defaultPrevented ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "v" ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;
      try {
        const raw = localStorage.getItem(CLASSROOM_PAGE_CLIPBOARD_KEY);
        if (!raw) return;
        const copied = JSON.parse(raw) as
          | ClassroomPageClipboard
          | ClassroomNotebookClipboard;
        const pane = activeStyleSurface.paneIndex === 1 ? "right" : "left";
        const targetMode = pane === "right" ? rightMode : leftMode;
        if (
          copied?.type === "classroom-notebook-pages" &&
          copied.version === 1 &&
          copied.mode === "notebook" &&
          targetMode === "notebook" &&
          Array.isArray(copied.pages)
        ) {
          event.preventDefault();
          copied.pages.forEach((page, index) => {
            onPastePage(
              "notebook",
              activeStyleSurface.page + index,
              undefined,
              page.notebookStyle ?? "grid",
              page.notebookOrientation ?? "portrait",
              page.strokes ?? [],
              pane,
            );
          });
          return;
        }
        if (
          copied?.type !== "classroom-page" ||
          copied.version !== 1 ||
          !Array.isArray(copied.strokes)
        )
          return;
        if (copied.mode !== targetMode) return;
        event.preventDefault();
        onPastePage(
          copied.mode,
          activeStyleSurface.page,
          copied.pageUrl,
          copied.notebookStyle ?? "grid",
          copied.notebookOrientation ?? "portrait",
          copied.strokes,
          pane,
        );
      } catch {
        // Buzilgan yoki eski clipboard oddiy Ctrl+V ishiga xalaqit bermaydi.
      }
    };
    window.addEventListener("keydown", handlePagePaste);
    return () => window.removeEventListener("keydown", handlePagePaste);
  }, [
    activeStyleSurface,
    isHost,
    leftMode,
    onPastePage,
    rightMode,
  ]);

  useEffect(() => {
    if (!isHost && synced) {
      setDisplayMode(boardMode);
      setDisplayLayout(boardLayout);
      setLeftMode(leftBoardMode);
      setRightMode(rightBoardMode);
    }
  }, [boardMode, boardLayout, leftBoardMode, rightBoardMode, isHost, synced]);

  useEffect(() => {
    if (isHost || synced) setLocalSplitRatio(hostSplitRatio);
  }, [isHost, synced, hostSplitRatio]);

  useEffect(() => {
    if (isHost || displayLayout !== "split" || !synced || !rightHostScroll)
      return;
    const rightPane = paneScrollRefs.current.get(1);
    if (!rightPane) return;
    rightPane.scrollLeft =
      (rightHostScroll.xRatio ?? 0) *
      Math.max(0, rightPane.scrollWidth - rightPane.clientWidth);
  }, [displayLayout, synced, rightHostScroll, isHost]);

  useEffect(() => {
    if (isHost || !synced || !hostScroll || !scrollRef.current) return;
    const leftPane = scrollRef.current;
    leftPane.scrollLeft =
      (hostScroll.xRatio ?? 0) *
      Math.max(0, leftPane.scrollWidth - leftPane.clientWidth);
  }, [isHost, synced, hostScroll]);

  const {
    suppressScrollDetectRef,
    scrollToPage,
    scrollToPagePosition,
    handleScroll,
  } = useClassroomScrollSync({
    isHost,
    synced,
    currentPage,
    hostScroll,
    scrollRef,
    pageElsRef,
    onPageChange,
    onScrollChange,
  });

  // O'ng panel uchun ham xuddi shu aniq page+yRatio modeli — avvalgi
  // umumiy scrollHeight foizi o'rniga. onPageChange berilmaydi (o'ng
  // panelning "joriy sahifasi" alohida kuzatilmaydi, faqat currentPage
  // ishlatiladi — chap panel bilan bir xil sahifa nomerlanishi taxmin qilinadi).
  const {
    suppressScrollDetectRef: rightSuppressScrollDetectRef,
    scrollToPagePosition: scrollToRightPagePosition,
    handleScroll: handleRightScroll,
  } = useClassroomScrollSync({
    isHost,
    synced,
    currentPage,
    hostScroll: rightHostScroll,
    scrollRef: rightScrollRef,
    pageElsRef: rightPageElsRef,
    onScrollChange: onPaneScrollChange
      ? (page, yRatio, xRatio) =>
        onPaneScrollChange("right", page, yRatio, xRatio)
      : undefined,
  });

  const {
    zoom,
    freeToMove,
    applyZoom,
    resetZoomTo1,
    syncZoomToHost,
    setZoomNode,
  } = useClassroomZoom({
    isHost,
    synced,
    hostZoom,
    onZoomChange,
    scrollRef,
    suppressScrollDetectRef,
  });

  // Split rejimdagi O'NG panel avval o'zining pinch/wheel-zoom listenerlariga
  // ega emas edi — rightZoom faqat +/- tugmalari orqali (anchor'siz)
  // o'zgarardi, shu sabab shu panelda trackpad-pinch umuman ishlamas edi.
  // Chap panel bilan bir xil useClassroomZoom instansiyasi (o'z scroll
  // ref'i, o'z DOM node state'i bilan) shu yerga ham ulanadi.
  const {
    zoom: rightZoom,
    applyZoom: applyRightZoom,
    setZoomNode: setRightZoomNode,
  } = useClassroomZoom({
    isHost,
    synced,
    hostZoom: rightHostZoom,
    onZoomChange: onPaneZoomChange
      ? (z) => onPaneZoomChange("right", z)
      : undefined,
    scrollRef: rightScrollRef,
    suppressScrollDetectRef: rightSuppressScrollDetectRef,
  });

  const registerEl = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageElsRef.current.set(page, el);
    else pageElsRef.current.delete(page);
  }, []);

  const registerRightEl = useCallback(
    (page: number, el: HTMLDivElement | null) => {
      if (el) rightPageElsRef.current.set(page, el);
      else rightPageElsRef.current.delete(page);
    },
    [],
  );

  const toggleSynced = useCallback(() => {
    setSynced((prev) => {
      const next = !prev;
      if (next) {
        setDisplayMode(boardMode);
        setDisplayLayout(boardLayout);
        setLeftMode(leftBoardMode);
        setRightMode(rightBoardMode);
        // Sinxron rejimga qaytilganda ustoz zoomiga va pozitsiyasiga tenglashadi
        syncZoomToHost();
        if (hostScroll)
          scrollToPagePosition(hostScroll.page, hostScroll.yRatio, true);
        else scrollToPage(currentPageRef.current, true);
        if (rightHostScroll)
          scrollToRightPagePosition(
            rightHostScroll.page,
            rightHostScroll.yRatio,
            true,
          );
      } else {
        // Erkin rejimga o'tilganda 100% dan boshlanadi
        resetZoomTo1();
      }
      return next;
    });
  }, [
    boardMode,
    boardLayout,
    leftBoardMode,
    rightBoardMode,
    scrollToPage,
    scrollToPagePosition,
    hostScroll,
    rightHostScroll,
    scrollToRightPagePosition,
    syncZoomToHost,
    resetZoomTo1,
  ]);

  const changeDisplayMode = (mode: CsBoardMode) => {
    const now = Date.now();
    if (now - lastSplitActionTimeRef.current < 350) return;
    lastSplitActionTimeRef.current = now;
    setDisplayMode(mode);
    setLeftMode(mode);
    setRightMode(mode);
    if (isHost) onBoardModeChange?.(mode);
  };

  const toggleSplit = () => {
    const now = Date.now();
    if (now - lastSplitActionTimeRef.current < 350) return;
    lastSplitActionTimeRef.current = now;
    const next = displayLayout === "split" ? "single" : ("split" as const);
    setDisplayLayout(next);
    if (next === "split") {
      setLeftMode("pdf");
      setRightMode("notebook");
    }
    if (isHost) {
      if (next === "split") onBoardViewChange?.("split", "pdf", "notebook");
      else onBoardViewChange?.("single", leftMode, rightMode);
    }
  };

  const swapSplitPanes = () => {
    const now = Date.now();
    if (displayLayout !== "split" || now - lastSplitActionTimeRef.current < 350) return;
    lastSplitActionTimeRef.current = now;
    const currentLeft = leftMode;
    const currentRight = rightMode === currentLeft ? (currentLeft === "pdf" ? "notebook" : "pdf") : rightMode;
    const newLeft = currentRight;
    const newRight = currentLeft;
    setLeftMode(newLeft);
    setRightMode(newRight);
    if (isHost) onBoardViewChange?.("split", newLeft, newRight);
  };

  const visiblePageCount = (mode: CsBoardMode) =>
    mode === "notebook" ? notebookPageCount : pageUrls.length;

  const toolbarRow = (toolbar || toolbarActions) && (
    <div className="absolute top-[5px] left-[5px] right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
      <div
        className="min-w-0 flex-1 transition-transform duration-300 ease-in-out pointer-events-auto"
        style={{
          transform: overlayVisible ? "translateY(0)" : "translateY(-150%)",
        }}
      >
        {toolbar}
      </div>
      <div className="flex shrink-0 items-center gap-2 pointer-events-auto">
        {toolbarActions}
      </div>
    </div>
  );

  const modeMenuFor = (selectedMode: CsBoardMode, pane?: "left" | "right") => {
    // Read-only board havolasida PDF hali bo'lmasa ham Daftar rejimiga
    // o'tish tugmasi ko'rinishi kerak. Avvalgi pageUrls.length sharti aynan
    // bo'sh PDF holatida switchni yashirib, mavjud daftar chizmalariga kirishni
    // imkonsiz qilardi.
    if (!isHost && !(noSync || !synced)) return null;
    const disabled = !isHost && synced;
    const isNotebook = selectedMode === "notebook";
    return (
      <div
        className={`inline-flex items-center gap-0.5 rounded-full bg-white/90 p-0.5 shadow-md backdrop-blur-sm ${disabled ? "opacity-60" : ""}`}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!pane) changeDisplayMode("pdf");
          }}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${!isNotebook
            ? "bg-indigo-600 text-white"
            : "text-gray-500 hover:bg-gray-100"
            }`}
        >
          PDF
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!pane) changeDisplayMode("notebook");
          }}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${isNotebook
            ? "bg-indigo-600 text-white"
            : "text-gray-500 hover:bg-gray-100"
            }`}
        >
          Daftar
        </button>
      </div>
    );
  };
  const rightZoomPanel = (
    <div className="flex items-center gap-0.5 rounded-full bg-white/90 px-1 py-0.5 shadow-md backdrop-blur-sm">
      <button
        type="button"
        className="rounded-full p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
        disabled={rightZoom <= MIN_ZOOM || (!isHost && synced)}
        onClick={() => applyRightZoom(rightZoom - ZOOM_STEP)}
        title="Kichraytirish"
      >
        <Minus size={13} />
      </button>
      <button
        type="button"
        className="min-w-9 px-1 text-center text-[11px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-30 tabular-nums"
        disabled={!freeToMove}
        onClick={() => applyRightZoom(1)}
        title="Asl o'lchamga qaytarish"
      >
        {Math.round(rightZoom * 100)}%
      </button>
      <button
        type="button"
        className="rounded-full p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
        disabled={rightZoom >= MAX_ZOOM || (!isHost && synced)}
        onClick={() => applyRightZoom(rightZoom + ZOOM_STEP)}
        title="Kattalashtirish"
      >
        <Plus size={13} />
      </button>
    </div>
  );
  const splitButton =
    (isHost || !synced) && pageUrls.length > 0 ? (
      <button
        type="button"
        onClick={toggleSplit}
        disabled={!isHost && synced}
        title={displayLayout === "split" ? "Bitta ekranga qaytish" : "Ekranni ikkiga bo‘lish"}
        className="rounded-full bg-white/90 p-1.5 text-gray-500 shadow-md backdrop-blur-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {displayLayout === "split" ? <Square size={15} /> : <Columns2 size={15} />}
      </button>
    ) : null;
  const swapButton =
    displayLayout === "split" ? (
      <button
        type="button"
        onClick={swapSplitPanes}
        disabled={!isHost && synced}
        title="PDF va daftar joyini almashtirish"
        className="rounded-full bg-white/90 p-1.5 text-gray-500 shadow-md backdrop-blur-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Repeat2 size={15} />
      </button>
    ) : null;

  if (displayMode === "pdf" && pageUrls.length === 0) {
    return (
      <div className="relative flex-1 flex items-center justify-center bg-gray-100 rounded-2xl min-h-75">
        {toolbarRow}
        <p className="text-gray-400 text-sm">PDF hali yuklanmagan</p>
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
          {modeMenuFor(displayMode)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-gray-100 rounded-2xl overflow-hidden">
      {toolbarRow}
      <div
        ref={(element) => {
          splitContainerRef.current = element;
          // Splitdan monolitga qaytganda scrollRef eski chap pane'da
          // qolmasin: sync hook monolitdagi asosiy viewportni kuzatishi kerak.
          if (displayLayout !== "split") {
            scrollRef.current = element;
            // setZoomNode — wheel/touch-pinch listenerlarni HAQIQIY DOM
            // node'ga ulash uchun kerak (scrollRef.current shunchaki
            // o'zgarishi useClassroomZoom ichidagi effektlarni qayta
            // ishga tushirmaydi, chunki ref obyekti hech qachon
            // almashmaydi).
            setZoomNode(element);
          }
        }}
        className={`w-full h-full overscroll-contain ${displayLayout === "split" ? "overflow-hidden" : "overflow-auto"}`}
        style={{
          // MUHIM: "pinch-zoom" QO'SHILMAYDI. Bu qiymat aynan brauzerga
          // ikki-barmoq gesture'ni NATIVE document-zoom sifatida bajarishga
          // ruxsat beradi — shu sabab avval mobil'da pinch qilinganda butun
          // sahifa (html/body) kattalashib ketardi. "pan-x pan-y" (pinch-zoom
          // so'zisiz) qoldirilsa, brauzer ikki-barmoqni "zoom" deb umuman
          // belgilamaydi va bizning onNativeTouchStart/Move handler (pastda)
          // preventDefault() orqali to'liq nazorat qiladi — natijada faqat
          // PDF ichida custom zoom ishlaydi, browser darajasida hech narsa
          // kattalashmaydi.
          touchAction: freeToMove ? "pan-x pan-y" : "none",
          overflow:
            displayLayout === "split"
              ? "hidden"
              : freeToMove
                ? "auto"
                : "hidden",
        }}
        onScroll={handleScroll}
      >
        <div
          className={`flex h-full min-h-0 ${displayLayout === "split" ? "flex-row items-start gap-0" : "flex-col gap-1 sm:gap-2 py-[50px]"}`}
          style={{
            width: "100%",
            minWidth: "100%",
            // "items-center" bola (PDF/daftar paneli) zoom bilan konteynerdan
            // kengroq bo'lib qolganda klassik flexbox xatosiga olib kelardi:
            // align-items: center bola chap chetini scroll konteyner
            // tashqarisiga chiqarib yuboradi, lekin scrollLeft manfiy
            // bo'lolmagani uchun brauzer o'sha chetga scroll qilishga
            // ruxsat bermaydi ("to'liq chekkagacha scroll qilinmaydi").
            // "safe center" xuddi shu holatda avtomatik "start"ga
            // qaytadi — kontent kichkina bo'lsa markazlashtiradi, katta
            // bo'lsa esa to'liq scroll qilib bo'ladigan qilib qoladi.
            alignItems: displayLayout === "split" ? undefined : "safe center",
          }}
        >
          {(displayLayout === "split"
            ? [leftMode, rightMode]
            : [displayMode]
          ).map((paneMode, paneIndex) => (
            <Fragment key={`${paneMode}-${paneIndex}`}>
              <div
                ref={(element) => {
                  if (displayLayout === "split" && element) {
                    paneScrollRefs.current.set(paneIndex, element);
                    if (paneIndex === 0) {
                      scrollRef.current = element;
                      setZoomNode(element);
                    } else {
                      // O'ng panel — o'zining pinch/wheel-zoom listenerlari
                      // shu DOM node'ga ulanishi uchun kerak (yuqoridagi
                      // izohga qarang: scrollRef kabi useRef o'zgarishi
                      // effektlarni qayta ishga tushirmaydi).
                      setRightZoomNode(element);
                    }
                  } else if (displayLayout === "split")
                    paneScrollRefs.current.delete(paneIndex);
                }}
                onScroll={
                  displayLayout === "split"
                    ? paneIndex === 0
                      ? handleScroll
                      : handleRightScroll
                    : undefined
                }
                className={
                  displayLayout === "split"
                    ? `flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col gap-1 sm:gap-2 ${freeToMove ? "overflow-x-auto overflow-y-auto overscroll-contain" : "overflow-hidden"}`
                    : "flex w-full flex-col gap-1 sm:gap-2"
                }
                style={
                  displayLayout === "split"
                    ? {
                      // Split panellar hostSplitRatio (yoki move rejimida
                      // localSplitRatio)ga mos ravishda kenglashadi/torayadi —
                      // grow/shrink 0 qilib, faqat flex-basis orqali aniq
                      // nisbatni belgilaymiz.
                      flex: `0 0 ${(paneIndex === 0 ? effectiveSplitRatio : 1 - effectiveSplitRatio) * 100}%`,
                      touchAction: freeToMove ? "pan-x pan-y" : "none",
                      // items-center bola (PDF/daftar paneli) zoomda
                      // konteynerdan kengroq bo'lib qolganda flexbox
                      // scrollLeft'ni manfiy qila olmaydi va chap chekkaga
                      // scroll qilib bo'lmay qolardi — "safe center" kontent
                      // kichkina bo'lsa markazlaydi, katta bo'lsa "start"ga
                      // qaytib to'liq scroll imkonini beradi.
                      alignItems: "safe center",
                    }
                    : {
                      // Daftar ham PDF kabi konteyner kengligiga NISBATAN (%)
                      // o'lchanadi — REF_WIDTH'ga bog'langan mutlaq piksel
                      // (masalan 1000px) tor mobil ekranda 100% zoom'da ham
                      // viewport'dan katta bo'lib, gorizontal scroll chiqarib
                      // yuborardi. Grid/stroke o'lchami baribir REF_WIDTH
                      // asosida hisoblanadi (canvas render'da), shuning uchun
                      // teacher/student o'rtasida nisbiy ko'rinish bir xil qoladi.
                      width: `${zoom * 100}%`,
                      alignItems: "safe center",
                    }
                }
              >
                <div
                  className="flex shrink-0 flex-col items-center gap-1 sm:gap-2"
                  style={{
                    // Split rejimida daftar ham PDF kabi panel kengligiga
                    // NISBATAN (%) o'lchanadi — REF_WIDTH'ga bog'langan mutlaq
                    // piksel (masalan 1000px) yarim ekranga sig'may, 100%
                    // zoom'da ham gorizontal scroll chiqarib yuborardi.
                    paddingTop: displayLayout === "split" ? 50 : undefined,
                    width:
                      displayLayout === "split"
                        ? `${(paneIndex === 1 ? rightZoom : zoom) * 100}%`
                        : "100%",
                    minWidth:
                      displayLayout === "split"
                        ? `${(paneIndex === 1 ? rightZoom : zoom) * 100}%`
                        : "100%",
                  }}
                >
                  {Array.from(
                    { length: visiblePageCount(paneMode) },
                    (_, idx) => {
                      const pageNumber = idx + 1;
                      const totalPages = visiblePageCount(paneMode);

                      // Virtualization: ko'p sahifali (masalan 191 ta) PDF yoki daftarlarda
                      // barcha sahifalarni bir vaqtda DOM'ga yuklash brauzerni 5-10 soniya
                      // muzlatib ("Yuklanmoqda...") qo'yardi. Faqat joriy ko'rinayotgan
                      // va unga yaqin sahifalar (±5) to'liq render qilinadi; qolganlari
                      // proporsiyasini saqlaydigan yengil placeholder div bilan almashtiriladi.
                      const rawCenterPage = paneIndex === 1 ? (rightHostScroll?.page ?? currentPage) : currentPage;
                      const centerPage = Math.min(totalPages, Math.max(1, rawCenterPage));
                      const isNearCurrentPage =
                        totalPages <= 12 ||
                        Math.abs(pageNumber - centerPage) <= 8 ||
                        pageNumber === 1 ||
                        pageNumber === centerPage;

                      if (!isNearCurrentPage) {
                        const isNotebook = paneMode === "notebook";
                        const isLandscape = notebookPageOrientations[pageNumber] === "landscape";
                        const aspectClass = isNotebook
                          ? (isLandscape ? "aspect-[297/210]" : "aspect-[210/297]")
                          : "aspect-[210/297]";
                        const registerFn = displayLayout === "split" && paneIndex === 1 ? registerRightEl : registerEl;

                        return (
                          <div
                            key={`${paneIndex}-${pageNumber}`}
                            ref={(el) => registerFn(pageNumber, el)}
                            data-page={pageNumber}
                            className={`relative shrink-0 w-full flex items-center justify-center ${aspectClass} max-w-3xl bg-gray-100/60 dark:bg-zinc-800/30 rounded-xl my-1 select-none pointer-events-none`}
                          >
                            <span className="text-xs font-semibold text-gray-400/80 dark:text-zinc-500/80">
                              Sahifa {pageNumber}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <ClassroomPdfPage
                          key={`${paneIndex}-${pageNumber}`}
                          pageNumber={pageNumber}
                          activeSelectionKey={activeSelectionKey}
                          onClaimSelection={setActiveSelectionKey}
                          zoomVersion={paneIndex === 1 ? rightZoom : zoom}
                          isHost={isHost}
                          canRemove={visiblePageCount(paneMode) > 1}
                          onRemovePage={(pageNumber) =>
                            onRemovePage?.(
                              paneMode,
                              pageNumber,
                              paneIndex === 1 ? "right" : "left",
                            )
                          }
                          onInsertPage={(pageNumber, style, orientation) => {
                            const pane = paneIndex === 1 ? "right" : "left";
                            if (style)
                              onInsertNotebookPage?.(
                                pageNumber,
                                style,
                                orientation ?? "portrait",
                                pane,
                              );
                            else onInsertPdfPage?.(pageNumber, pane);
                          }}
                          onSetNotebookStyle={(pageNumber, style) =>
                            onSetNotebookPageStyle?.(
                              pageNumber,
                              style,
                              paneIndex === 1 ? "right" : "left",
                            )
                          }
                          onClearPage={(pageNumber) =>
                            onClearPage?.(
                              pageNumber,
                              paneIndex === 1 ? "right" : "left",
                              paneMode,
                            )
                          }
                          url={paneMode === "pdf" ? pageUrls[idx] : undefined}
                          notebook={paneMode === "notebook"}
                          notebookStyle={
                            notebookPageStyles[pageNumber] ?? "grid"
                          }
                          notebookOrientation={
                            notebookPageOrientations[pageNumber] ?? "portrait"
                          }
                          strokes={
                            strokesByMode
                              ? (strokesByMode[paneMode]?.[pageNumber] ?? [])
                              : displayLayout === "split" && paneIndex === 1
                                ? (rightStrokesByPage[pageNumber] ?? [])
                                : (strokesByPage[pageNumber] ?? [])
                          }
                          pointer={pointer}
                          showPointer={
                            pointer?.page === pageNumber &&
                            (pointer?.pane ?? "left") ===
                            (paneIndex === 1 ? "right" : "left")
                          }
                          editable={editable}
                          tool={tool}
                          showStylePanel={
                            activeStyleSurface.paneIndex === paneIndex &&
                            activeStyleSurface.page === pageNumber
                          }
                          onActivate={() =>
                            setActiveStyleSurface({
                              paneIndex,
                              page: pageNumber,
                            })
                          }
                          isActiveSurface={
                            activeStyleSurface.paneIndex === paneIndex &&
                            activeStyleSurface.page === pageNumber
                          }
                          lassoClipboard={lassoClipboardRef}
                          onCopyAllNotebookPages={() =>
                            copyAllNotebookPages(
                              strokesByMode
                                ? (strokesByMode[paneMode] ?? {})
                                : displayLayout === "split" && paneIndex === 1
                                  ? rightStrokesByPage
                                  : strokesByPage,
                            )
                          }
                          allowPageCopy={allowPageCopy ?? noSync}
                          onToolChange={onToolChange}
                          color={color}
                          colorNonce={colorNonce}
                          onColorChange={onColorChange}
                          strokeWidth={strokeWidth}
                          onStrokeWidthChange={onStrokeWidthChange}
                          shapeStyle={shapeStyle}
                          onShapeStyleChange={onShapeStyleChange}
                          onUpdateShapeStroke={(page, stroke, groupId) => {
                            if (displayLayout === "split")
                              onPaneUpdateShapeStroke?.(
                                paneIndex === 1 ? "right" : "left",
                                paneMode,
                                page,
                                stroke,
                                groupId,
                              );
                            else onUpdateShapeStroke?.(page, stroke, groupId);
                          }}
                          onReorderStroke={(page, strokeIds, op) => {
                            if (displayLayout === "split")
                              onPaneReorderStroke?.(
                                paneIndex === 1 ? "right" : "left",
                                paneMode,
                                page,
                                strokeIds,
                                op,
                              );
                            else onReorderStroke?.(page, strokeIds, op);
                          }}
                          onStrokeComplete={(page, stroke, groupId) => {
                            if (displayLayout === "split" && paneIndex === 1) {
                              onPaneStrokeComplete?.(
                                "right",
                                paneMode,
                                page,
                                stroke,
                                groupId,
                              );
                            } else {
                              if (displayLayout === "split")
                                onPaneStrokeComplete?.(
                                  "left",
                                  paneMode,
                                  page,
                                  stroke,
                                  groupId,
                                );
                              else if (onPaneStrokeComplete)
                                onPaneStrokeComplete(
                                  "left",
                                  displayMode,
                                  page,
                                  stroke,
                                  groupId,
                                );
                              else onStrokeComplete?.(page, stroke, groupId);
                            }
                          }}
                          onMoveStroke={(page, strokeId, x, y, groupId) => {
                            if (displayLayout === "split")
                              onPaneMoveStroke?.(
                                paneIndex === 1 ? "right" : "left",
                                paneMode,
                                page,
                                strokeId,
                                x,
                                y,
                                groupId,
                              );
                            else onMoveStroke?.(page, strokeId, x, y, groupId);
                          }}
                          onUpdateTextStroke={(page, stroke, groupId) => {
                            if (boardLayout === "split") {
                              onPaneUpdateTextStroke?.(
                                paneIndex === 1 ? "right" : "left",
                                paneMode,
                                page,
                                stroke,
                                groupId,
                              );
                            } else {
                              onUpdateTextStroke?.(page, stroke, groupId);
                            }
                          }}
                          onPointerMove={(page, x, y, active) =>
                            onPointerMove?.(
                              page,
                              x,
                              y,
                              active,
                              paneIndex === 1 ? "right" : "left",
                            )
                          }
                          onEraseStroke={(page, strokeId, groupId) => {
                            if (displayLayout === "split")
                              onPaneEraseStroke?.(
                                paneIndex === 1 ? "right" : "left",
                                paneMode,
                                page,
                                strokeId,
                                groupId,
                              );
                            else onEraseStroke?.(page, strokeId, groupId);
                          }}
                          onSplitStroke={(page, strokeId, replacements) => {
                            if (displayLayout === "split")
                              onPaneSplitStroke?.(
                                paneIndex === 1 ? "right" : "left",
                                paneMode,
                                page,
                                strokeId,
                                replacements,
                              );
                            else onSplitStroke?.(page, strokeId, replacements);
                          }}
                          registerEl={
                            displayLayout === "split" && paneIndex === 1
                              ? registerRightEl
                              : registerEl
                          }
                        />
                      );
                    },
                  )}
                  <div className="shrink-0 h-[50px]" aria-hidden />
                </div>
              </div>
              {displayLayout === "split" && paneIndex === 0 && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Split panellarni o'lchamini o'zgartirish"
                  onPointerDown={handleSplitPointerDown}
                  onPointerMove={handleSplitPointerMove}
                  onPointerUp={handleSplitPointerUp}
                  onPointerCancel={handleSplitPointerUp}
                  className={`relative h-full shrink-0 w-4 -mx-1.5 z-[1] flex items-center justify-center select-none touch-none ${canDragSplit ? "cursor-col-resize hover:bg-blue-500/10" : "cursor-default"
                    }`}
                >
                  <div className="h-full w-[1px] bg-gray-400/30 hover:bg-blue-500 transition-colors" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>

      {(() => {
        const zoomPanel = (
          <div className="flex items-center gap-0.5 rounded-full bg-white/90 backdrop-blur-sm shadow-md px-1 py-0.5">
            <button
              type="button"
              onClick={() => applyZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM || !freeToMove}
              className="p-1 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Kichraytirish"
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              onClick={() => applyZoom(1)}
              disabled={!freeToMove}
              className="px-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 min-w-9 text-center disabled:opacity-30 tabular-nums"
              title="Asl o'lchamga qaytarish"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => applyZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM || !freeToMove}
              className="p-1 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Kattalashtirish"
            >
              <Plus size={13} />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={() => applyZoom(1)}
                disabled={!freeToMove}
                className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                title="Reset"
              >
                <ResetZoom size={12} />
              </button>
            )}
          </div>
        );

        const pageInfoPanel = (
          <div className="rounded-full bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 shadow-md backdrop-blur-sm tabular-nums">
            {currentPage} /{" "}
            {visiblePageCount(
              displayLayout === "split" ? leftMode : displayMode,
            )}
          </div>
        );

        const moveButton = !isHost && !hideMoveButton && (
          <button
            type="button"
            onClick={toggleSynced}
            title={
              synced
                ? "Erkin harakatlanish (ustozdan mustaqil)"
                : "Ustoz bilan sinxronlash"
            }
            className={`rounded-xl p-1.5 shadow-md transition-colors ${synced
              ? "bg-white text-gray-400 hover:bg-gray-50"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
          >
            <Move size={14} />
          </button>
        );

        // Ustoz uchun: page-info+zoom/daftar switch bottom-left/right'da.
        // O'quvchi uchun: page-info+zoom top-left'ga (toolbar qatoridan
        // pastroq), move esa bottom-left'da alohida qoladi.
        if (isHost) {
          return (
            <>
              {displayLayout === "split" ? (
                <>
                  <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5">
                    {moveButton}
                    {pageInfoPanel}
                    {zoomPanel}
                    {splitButton}
                    {swapButton}
                  </div>
                  <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5">
                    {rightZoomPanel}
                  </div>
                </>
              ) : (
                <>
                  <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5">
                    {moveButton}
                    {pageInfoPanel}
                    {zoomPanel}
                    {splitButton}
                  </div>
                  <div className="absolute bottom-3 right-3 z-20">
                    {modeMenuFor(displayMode)}
                  </div>
                </>
              )}
            </>
          );
        }

        return (
          <>
            <div
              className="absolute top-3 left-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
              style={{
                transform: overlayVisible
                  ? "translateY(0)"
                  : "translateY(-150%)",
              }}
            >
              {moveButton}
              {pageInfoPanel}
              {displayLayout !== "split" && (
                <span className="sm:hidden">{zoomPanel}</span>
              )}
            </div>
            {displayLayout === "split" ? (
              <>
                <div
                  className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
                  style={{
                    transform: overlayVisible
                      ? "translateY(0)"
                      : "translateY(150%)",
                  }}
                >
                  {zoomPanel}
                  {splitButton}
                  {swapButton}
                </div>
                <div
                  className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
                  style={{
                    transform: overlayVisible
                      ? "translateY(0)"
                      : "translateY(150%)",
                  }}
                >
                  {rightZoomPanel}
                </div>
              </>
            ) : (
              <>
                <div
                  className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
                  style={{
                    transform: overlayVisible
                      ? "translateY(0)"
                      : "translateY(150%)",
                  }}
                >
                  <span className="hidden sm:flex sm:items-center sm:gap-1.5">
                    {zoomPanel}
                  </span>
                  {splitButton}
                </div>
                <div
                  className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
                  style={{
                    transform: overlayVisible
                      ? "translateY(0)"
                      : "translateY(150%)",
                  }}
                >
                  {modeMenuFor(displayMode)}
                </div>
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}
