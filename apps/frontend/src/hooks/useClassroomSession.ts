import { useCallback, useEffect, useRef, useState } from "react";
import { getClassroomSocket, closeClassroomSocket } from "../api/classroomSocket";
import { useThemeStore } from "../stores/themeStore";
import type { CsBoardLayout, CsBoardMode, CsNotebookStyle, CsParticipant, CsPointer, CsScrollPosition, CsSnapshot, CsStroke } from "../api/classroom";
import {
  applyBoardSet, applyPageClear, applyPageRemove, applyPageSet, applyPdfSet, applyStrokeAdd, applyStrokeReorder,
  applyStrokeShapeUpdate, applyStrokeSplit, applyStrokeTextUpdate, applyStrokeUndo, applyStrokeUpdate,
  moveStrokePoints,
} from "./classroomReducers";

export interface ClassroomState {
  joined: boolean;
  error: string | null;
  ended: boolean;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  rightStrokesByPage: Record<number, CsStroke[]>;
  participants: CsParticipant[];
  hostOnline: boolean;
  pointer: CsPointer | null;
  // Ustozning zoom darajasi — o'quvchi sinxron rejimda bo'lsa shunga qarab kattalashtiradi.
  zoom: number;
  rightZoom: number;
  splitRatio: number;
  notebookPageCount: number;
  // Ustozning aniq scroll pozitsiyasi — sahifa raqami + o'sha sahifa
  // balandligi ichidagi nisbiy joy. O'quvchi sinxron rejimda shu sahifaning
  // aynan shu foiziga scroll qiladi (device/ekrandan mustaqil, piksel-aniq).
  scroll: CsScrollPosition | null;
  rightScroll: CsScrollPosition | null;
  // Erkin (guruhsiz) dars — kursga bog'liq emas, davomat/attendance
  // yozilmaydi, anonim mehmonlar kirishi mumkin.
  isFree: boolean;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  classroomTheme: "light" | "dark";
  notebookStyle: CsNotebookStyle;
}

const INITIAL: ClassroomState = {
  joined: false, error: null, ended: false,
  pdfName: null, pages: [], currentPage: 1,
  strokesByPage: {}, rightStrokesByPage: {}, participants: [], hostOnline: false, pointer: null, zoom: 1, scroll: null,
  isFree: false, boardMode: "pdf", boardLayout: "single", leftBoardMode: "pdf", rightBoardMode: "pdf", rightScroll: null, rightZoom: 1, splitRatio: 0.5, notebookPageCount: 4, classroomTheme: "light",
  notebookStyle: "grid",
};

// Ustoz kursorining tarmoqqa yuborilish chastotasi — brauzer pointermove'ni
// sekundiga 60-120 marta otishi mumkin, lekin ko'z 30ms'dan tezroq farqni
// sezmaydi. Throttle bo'lmasa server/tarmoq yuki keraksiz ravishda ortadi.
const POINTER_THROTTLE_MS = 30;

// Login qilmagan mehmon uchun barqaror ID — shu tab/sessiyada qayta
// ulanishlarda bir xil qolishi uchun sessionStorage'da saqlanadi (login
// qilingandan farqli, bu foydalanuvchi identifikatsiyasi emas — faqat
// bitta jonli dars davomida boshqalardan farqlash uchun).
function getGuestId(): string {
  const key = "classroom_guest_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function useClassroomSession(
  sessionId: string | undefined, role: "host" | "student", guestName?: string,
) {
  // Ustoz classroom route'iga kirgan birinchi freymda global theme'ni ko'rsin;
  // server snapshot kelguncha light default sababli ko'zga tashlanadigan flash
  // bo'lmasin. Student esa classroom server theme'ini kutadi.
  const globalTheme = useThemeStore((s) => s.theme);
  const [state, setState] = useState<ClassroomState>(() => ({
    ...INITIAL,
    classroomTheme: globalTheme,
  }));
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const lastPointerSentRef = useRef(0);
  const pointerThrottleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const socket = getClassroomSocket();
    const token = localStorage.getItem("token");

    const join = () => {
      const joinPayload: Record<string, unknown> = { sessionId, token };
      // Login qilmagan mehmon uchun: token bo'sh, o'rniga guestId+guestName
      // yuboriladi — erkin darsda server buni qabul qiladi.
      if (!token && guestName) {
        joinPayload.guestId = getGuestId();
        joinPayload.guestName = guestName;
      }
      socket.emit(
        role === "host" ? "host:join" : "student:join",
        joinPayload,
        (res: { ok: boolean; code?: string; state?: CsSnapshot }) => {
          if (!res.ok || !res.state) {
            setState((s) => ({ ...s, error: res.code ?? "ERROR" }));
            return;
          }
          const snap = res.state;
          setState({
            joined: true, error: null, ended: false,
            pdfName: snap.pdfName, pages: snap.pages, currentPage: snap.currentPage,
            strokesByPage: snap.strokesByPage ?? {},
            rightStrokesByPage: snap.rightStrokesByPage ?? {},
            participants: snap.participants, hostOnline: snap.hostOnline, pointer: null,
            zoom: snap.zoom ?? 1, scroll: snap.scroll ?? null, isFree: snap.isFree,
            rightScroll: snap.rightScroll ?? null, rightZoom: snap.rightZoom ?? snap.zoom ?? 1,
            splitRatio: snap.splitRatio ?? 0.5,
            notebookPageCount: snap.notebookPageCount ?? 4,
            boardMode: snap.boardMode ?? "pdf",
            boardLayout: snap.boardLayout ?? "single", leftBoardMode: snap.leftBoardMode ?? snap.boardMode ?? "pdf", rightBoardMode: snap.rightBoardMode ?? snap.boardMode ?? "pdf",
            classroomTheme: snap.classroomTheme ?? globalTheme,
            notebookStyle: snap.notebookStyle ?? "grid",
          });
          // Yangi classroom'ni ustozning asosiy theme'i bilan boshlaymiz.
          // Bu faqat farq bo'lsa yuboriladi; keyingi studentlar snapshot'dan
          // shu qiymatni oladi.
          if (role === "host" && snap.classroomTheme !== globalTheme) {
            socket.emit("host:setTheme", { sessionId, token, theme: globalTheme });
          }
        },
      );
    };

    if (socket.connected) join();
    socket.on("connect", join);

    socket.on("pdf:set", (p: { pdfName: string; pages: string[]; currentPage: number }) => {
      setState((s) => applyPdfSet(s, p));
    });
    socket.on("board:set", (p: { mode: CsBoardMode; layout?: "single" | "split"; leftMode?: CsBoardMode; rightMode?: CsBoardMode; currentPage: number; strokesByPage?: Record<number, CsStroke[]>; rightStrokesByPage?: Record<number, CsStroke[]> }) => {
      setState((s) => applyBoardSet(s, p));
    });
    socket.on("page:set", (p: { page: number }) => {
      setState((s) => applyPageSet(s, p));
    });
    socket.on("stroke:add", (p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      setState((s) => applyStrokeAdd(s, p));
    });
    socket.on("stroke:update", (p: { page: number; strokeId: string; x: number; y: number; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      setState((s) => applyStrokeUpdate(s, p));
    });
    socket.on("stroke:textUpdate", (p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      setState((s) => applyStrokeTextUpdate(s, p));
    });
    socket.on("stroke:shapeUpdate", (p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      setState((s) => applyStrokeShapeUpdate(s, p));
    });
    socket.on("stroke:reorder", (p: { page: number; strokeIds: string[]; op: "front" | "back" | "forward" | "backward"; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      setState((s) => applyStrokeReorder(s, p));
    });
    socket.on("stroke:undo", (p: { page: number; strokeId: string; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      setState((s) => applyStrokeUndo(s, p));
    });
    socket.on("stroke:split", (p: { page: number; strokeId: string; replacements: CsStroke[]; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      setState((s) => applyStrokeSplit(s, p));
    });
    socket.on("page:clear", (p: { page: number; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      setState((s) => applyPageClear(s, p));
    });
    socket.on("pointer:move", (p: CsPointer) => {
      setState((s) => ({ ...s, pointer: p.active ? p : null }));
    });
    socket.on("presence:update", (p: { participants: CsParticipant[]; hostOnline: boolean }) => {
      setState((s) => ({ ...s, participants: p.participants, hostOnline: p.hostOnline }));
    });
    socket.on("zoom:set", (p: { zoom: number; pane?: "left" | "right" }) => setState((s) => p.pane === "right" ? ({ ...s, rightZoom: p.zoom }) : ({ ...s, zoom: p.zoom })));
    socket.on("splitRatio:set", (p: { ratio: number }) => setState((s) => ({ ...s, splitRatio: p.ratio })));
    socket.on("page:remove", (p: { mode: CsBoardMode; pageIndex: number; pane?: "left" | "right" }) => setState((s) => applyPageRemove(s, p)));
    socket.on("scroll:set", (p: CsScrollPosition & { pane?: "left" | "right" }) => setState((s) => p.pane === "right" ? ({ ...s, rightScroll: p }) : ({ ...s, scroll: p })));
    socket.on("theme:set", (p: { theme: "light" | "dark" }) => setState((s) => ({ ...s, classroomTheme: p.theme })));
    socket.on("notebookStyle:set", (p: { style: CsNotebookStyle }) => setState((s) => ({ ...s, notebookStyle: p.style })));
    socket.on("host:online", () => setState((s) => ({ ...s, hostOnline: true })));
    socket.on("host:offline", () => setState((s) => ({ ...s, hostOnline: false })));
    socket.on("session:ended", () => setState((s) => ({ ...s, ended: true })));

    return () => {
      socket.off("connect", join);
      socket.off("pdf:set");
      socket.off("board:set");
      socket.off("page:set");
      socket.off("stroke:add");
      socket.off("stroke:update");
      socket.off("stroke:textUpdate");
      socket.off("stroke:shapeUpdate");
      socket.off("stroke:reorder");
      socket.off("stroke:undo");
      socket.off("stroke:split");
      socket.off("page:clear");
      socket.off("pointer:move");
      socket.off("presence:update");
      socket.off("zoom:set");
      socket.off("splitRatio:set");
      socket.off("page:remove");
      socket.off("scroll:set");
      socket.off("theme:set");
      socket.off("notebookStyle:set");
      socket.off("host:online");
      socket.off("host:offline");
      socket.off("session:ended");
      if (pointerThrottleTimerRef.current) window.clearTimeout(pointerThrottleTimerRef.current);
      closeClassroomSocket();
    };
  }, [sessionId, role, guestName]);

  const emitHost = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    const socket = getClassroomSocket();
    socket.emit(event, { sessionId: sessionIdRef.current, token: localStorage.getItem("token"), ...payload });
  }, []);

  const hostActions = {
    setPage: (page: number) => emitHost("host:setPage", { page }),
    // Optimistik: local ekranga darhol qo'shiladi (socket round-trip'ni
    // kutmasdan) — shuning uchun ustoz o'zi chizganda chiziq "yo'qolib
    // qayta paydo bo'lish" holati bo'lmaydi. Server javobi kelganda
    // stroke:add handleri id bo'yicha dublikatni tashlab yuboradi.
    sendStroke: (page: number, stroke: CsStroke, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => {
      if (pane === "right") {
        setState((s) => ({ ...s, rightStrokesByPage: { ...s.rightStrokesByPage, [page]: [...(s.rightStrokesByPage[page] ?? []), stroke] } }));
      } else {
        setState((s) => {
          const existing = s.strokesByPage[page] ?? [];
          if (existing.some((x) => x.id === stroke.id)) return s;
          return { ...s, strokesByPage: { ...s.strokesByPage, [page]: [...existing, stroke] } };
        });
      }
      emitHost("host:stroke", { page, stroke, pane, mode });
    },
    moveStroke: (page: number, strokeId: string, x: number, y: number, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => {
      setState((s) => {
        const key = pane === "right" ? "rightStrokesByPage" : "strokesByPage";
        const source = s[key];
        const next = (source[page] ?? []).map((stroke) => stroke.id === strokeId ? { ...stroke, points: moveStrokePoints(stroke, x, y) } : stroke);
        return { ...s, [key]: { ...source, [page]: next } };
      });
      emitHost("host:moveStroke", { page, strokeId, x, y, pane, mode });
    },
    updateTextStroke: (page: number, stroke: CsStroke, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => {
      setState((s) => {
        const key = pane === "right" ? "rightStrokesByPage" : "strokesByPage";
        const source = s[key];
        const next = (source[page] ?? []).map((item) => item.id === stroke.id ? stroke : item);
        return { ...s, [key]: { ...source, [page]: next } };
      });
      emitHost("host:updateTextStroke", { page, stroke, pane, mode });
    },
    updateShapeStroke: (page: number, stroke: CsStroke, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => {
      setState((s) => {
        const key = pane === "right" ? "rightStrokesByPage" : "strokesByPage";
        const source = s[key];
        const next = (source[page] ?? []).map((item) => item.id === stroke.id ? stroke : item);
        return { ...s, [key]: { ...source, [page]: next } };
      });
      emitHost("host:updateShapeStroke", { page, stroke, pane, mode });
    },
    // MUHIM: bu yerda optimistik local o'zgartirish YO'Q — "forward"/"backward"
    // amallari (undo/erase/move'dan farqli) ID bo'yicha idempotent emas, balki
    // nisbiy (bir pog'ona) siljitadi. Server ustozning o'ziga ham broadcast
    // qaytaradi (socket o'z xonasiga a'zo), shuning uchun optimistik + echo
    // ikkalasi ham qo'llansa, ustoz ekranida element 2 pog'ona (studentlarda 1
    // pog'ona) siljib, holat rassinxron bo'lib qolardi. Shu sabab faqat
    // serverdan qaytgan "stroke:reorder" (yuqoridagi socket.on) orqali
    // qo'llanadi — kichik kechikish evaziga har doim to'g'ri tartib.
    reorderStroke: (page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward", pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => {
      emitHost("host:reorderStroke", { page, strokeIds, op, pane, mode });
    },
    undo: (page: number, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => emitHost("host:undo", { page, pane, mode }),
    // Stroke-eraser: sichqoncha ustidan o'tgan chizmani optimistik ravishda
    // darhol o'chiradi, keyin serverga ID bilan yuboradi.
    eraseStroke: (page: number, strokeId: string, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => {
      const key = pane === "right" ? "rightStrokesByPage" : "strokesByPage";
      setState((s) => ({
        ...s,
        [key]: { ...s[key], [page]: (s[key][page] ?? []).filter((x) => x.id !== strokeId) },
      }));
      emitHost("host:eraseStroke", { page, strokeId, pane, mode });
    },
    // Pixel-eraser: bitta chizmani (segment-darajasida kesilgan) bir nechta
    // yangi chizmalar bilan optimistik almashtiradi.
    splitStroke: (page: number, strokeId: string, replacements: CsStroke[], pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => {
      const key = pane === "right" ? "rightStrokesByPage" : "strokesByPage";
      setState((s) => {
        const existing = s[key][page] ?? [];
        const idx = existing.findIndex((x) => x.id === strokeId);
        if (idx === -1) return s;
        const next = [...existing];
        next.splice(idx, 1, ...replacements);
        return { ...s, [key]: { ...s[key], [page]: next } };
      });
      emitHost("host:splitStroke", { page, strokeId, replacements, pane, mode });
    },
    clearPage: (page: number, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => emitHost("host:clearPage", { page, pane, mode }),
    // ~30ms throttle: pointermove juda tez-tez otiladi, lekin ko'zga bu
    // aniqlik shart emas. "active: false" (barmoq/sichqoncha ko'tarilishi)
    // hech qachon throttle'lanmaydi — aks holda kursor oxirgi joyida
    // "yopishib" qolib, hech qachon yashirinmasligi mumkin edi.
    pointer: (page: number, x: number, y: number, active: boolean, pane: "left" | "right" = "left") => {
      if (pointerThrottleTimerRef.current) {
        window.clearTimeout(pointerThrottleTimerRef.current);
        pointerThrottleTimerRef.current = null;
      }
      if (!active) {
        lastPointerSentRef.current = Date.now();
        emitHost("host:pointer", { page, x, y, active, pane });
        return;
      }
      const now = Date.now();
      const elapsed = now - lastPointerSentRef.current;
      if (elapsed >= POINTER_THROTTLE_MS) {
        lastPointerSentRef.current = now;
        emitHost("host:pointer", { page, x, y, active, pane });
      } else {
        pointerThrottleTimerRef.current = window.setTimeout(() => {
          lastPointerSentRef.current = Date.now();
          emitHost("host:pointer", { page, x, y, active, pane });
        }, POINTER_THROTTLE_MS - elapsed);
      }
    },
    setZoom: (zoom: number, pane: "left" | "right" = "left") => emitHost("host:setZoom", { zoom, pane }),
    setSplitRatio: (ratio: number) => emitHost("host:setSplitRatio", { ratio }),
    removePage: (mode: CsBoardMode, pageIndex: number, pane: "left" | "right" = "left") =>
      emitHost("host:removePage", { mode, pageIndex, pane }),
    setScroll: (page: number, yRatio: number, pane: "left" | "right" = "left", xRatio = 0) => emitHost("host:scroll", { page, yRatio, pane, xRatio }),
    setBoardMode: (mode: CsBoardMode) => emitHost("host:setBoardMode", { mode }),
    setBoardView: (layout: CsBoardLayout, leftMode: CsBoardMode, rightMode: CsBoardMode) => emitHost("host:setBoardView", { layout, leftMode, rightMode }),
    setTheme: (theme: "light" | "dark") => {
      setState((s) => ({ ...s, classroomTheme: theme }));
      emitHost("host:setTheme", { theme });
    },
    setNotebookStyle: (style: CsNotebookStyle) => {
      setState((s) => ({ ...s, notebookStyle: style }));
      emitHost("host:setNotebookStyle", { style });
    },
    endLesson: () => emitHost("host:end"),
  };

  return { state, hostActions };
}
