import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getClassroomSocket, closeClassroomSocket } from "../api/classroomSocket";
import { useThemeStore } from "../stores/themeStore";
import type { CsBoardLayout, CsBoardMode, CsNotebookOrientation, CsNotebookStyle, CsParticipant, CsPointer, CsScrollPosition, CsSnapshot, CsStroke } from "../api/classroom";
import {
  applyBoardSet, applyBoardUndo, applyBoardRedo, applyNotebookPageInsert, applyNotebookPageStyle, applyPageClear, applyPageRemove, applyPageSet, applyPdfInsert, applyPdfSet,
  applyStrokeAdd, applyStrokeReorder, applyStrokeShapeUpdate, applyStrokeSplit, applyStrokeTextUpdate, applyStrokeUndo,
  applyStrokeUpdate, moveStrokePoints,
} from "./classroomReducers";
import type { StickerReactionItem } from "../components/classroom/StickerReactionsOverlay";
import type { RaisedHandItem } from "../components/classroom/RaisedHandsControl";

export interface ClassroomState {
  joined: boolean;
  title?: string | null;
  error: string | null;
  ended: boolean;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  rightStrokesByPage: Record<number, CsStroke[]>;
  participants: CsParticipant[];
  hostOnline: boolean;
  hostUserId?: string | null;
  hostName?: string | null;
  pointer: CsPointer | null;
  zoom: number;
  rightZoom: number;
  splitRatio: number;
  notebookPageCount: number;
  scroll: CsScrollPosition | null;
  rightScroll: CsScrollPosition | null;
  isFree: boolean;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  isBoardOpen: boolean;
  classroomTheme: "light" | "dark";
  notebookPageStyles: Record<number, CsNotebookStyle>;
  notebookPageOrientations: Record<number, CsNotebookOrientation>;
  strokesByMode?: Record<CsBoardMode, Record<number, CsStroke[]>>;
  reactions?: StickerReactionItem[];
  userReactions?: Record<string, string>;
  raisedHands?: RaisedHandItem[];
  isReplay?: boolean;
}

const INITIAL: ClassroomState = {
  joined: false, error: null, ended: false,
  title: null,
  pdfName: null, pages: [], currentPage: 1,
  strokesByPage: {}, rightStrokesByPage: {}, participants: [], hostOnline: false, hostUserId: null, hostName: null, pointer: null, zoom: 1, scroll: null,
  isFree: false, boardMode: "pdf", boardLayout: "single", leftBoardMode: "pdf", rightBoardMode: "pdf", rightScroll: null, rightZoom: 1, splitRatio: 0.5, notebookPageCount: 1, isBoardOpen: false, classroomTheme: useThemeStore.getState().theme,
  notebookPageStyles: {},
  notebookPageOrientations: {},
  reactions: [],
  userReactions: {},
  raisedHands: [],
};

// Ustoz kursorining tarmoqqa yuborilish chastotasi — brauzer pointermove'ni
// sekundiga 60-120 marta otishi mumkin, lekin ko'z 30ms'dan tezroq farqni
// sezmaydi. Throttle bo'lmasa server/tarmoq yuki keraksiz ravishda ortadi.
const POINTER_THROTTLE_MS = 30;

// Login qilmagan mehmon uchun barqaror ID — shu tab/sessiyada qayta
// ulanishlarda bir xil qolishi uchun sessionStorage'da saqlanadi (login
// qilingandan farqli, bu foydalanuvchi identifikatsiyasi emas — faqat
// bitta jonli dars davomida boshqalardan farqlash uchun).
export function getGuestId(): string {
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

  useLayoutEffect(() => {
    setState({
      ...INITIAL,
      classroomTheme: role === "host" ? globalTheme : INITIAL.classroomTheme,
    });
  }, [sessionId, role]);

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
      socket.timeout(10_000).emit(
        role === "host" ? "host:join" : "student:join",
        joinPayload,
        (timeoutError: Error | null, res?: { ok: boolean; code?: string; state?: CsSnapshot }) => {
          if (timeoutError) {
            setState((s) => ({ ...s, error: "CONNECTION_TIMEOUT" }));
            return;
          }
          if (!res?.ok || !res.state) {
            setState((s) => ({ ...s, error: res?.code ?? "ERROR" }));
            return;
          }
          const snap = res.state;
          setState({
            joined: true, error: null, ended: false,
            title: snap.title ?? null,
            pdfName: snap.pdfName, pages: snap.pages, currentPage: snap.currentPage,
            strokesByPage: snap.strokesByPage ?? {},
            rightStrokesByPage: snap.rightStrokesByPage ?? {},
            strokesByMode: snap.strokesByMode ?? {
              pdf: snap.boardMode === "pdf" ? (snap.strokesByPage ?? {}) : {},
              notebook: snap.boardMode === "notebook" ? (snap.strokesByPage ?? {}) : {},
            },
            participants: snap.participants, hostOnline: snap.hostOnline, hostUserId: snap.hostUserId ?? null, hostName: snap.hostName, pointer: null,
            zoom: snap.zoom ?? 1, scroll: snap.scroll ?? null, isFree: snap.isFree,
            rightScroll: snap.rightScroll ?? null, rightZoom: snap.rightZoom ?? snap.zoom ?? 1,
            splitRatio: snap.splitRatio ?? 0.5,
            notebookPageCount: snap.notebookPageCount ?? 1,
            boardMode: snap.boardMode ?? "pdf",
            boardLayout: snap.boardLayout ?? "single", leftBoardMode: snap.leftBoardMode ?? snap.boardMode ?? "pdf", rightBoardMode: snap.rightBoardMode ?? snap.boardMode ?? "pdf",
            isBoardOpen: snap.isBoardOpen ?? false,
            classroomTheme: snap.classroomTheme ?? globalTheme,
            notebookPageStyles: snap.notebookPageStyles ?? {},
            notebookPageOrientations: snap.notebookPageOrientations ?? {},
            reactions: [],
            userReactions: {},
            raisedHands: snap.raisedHands ?? [],
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
      if (role === "host") return;
      setState((s) => applyStrokeUpdate(s, p));
    });
    socket.on("stroke:textUpdate", (p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      if (role === "host") return;
      setState((s) => applyStrokeTextUpdate(s, p));
    });
    socket.on("stroke:shapeUpdate", (p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      if (role === "host") return;
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
      if (role === "host") return;
      setState((s) => ({ ...s, pointer: p.active ? p : null }));
    });
    socket.on("presence:update", (p: { participants: CsParticipant[]; hostOnline: boolean }) => {
      setState((s) => ({ ...s, participants: p.participants, hostOnline: p.hostOnline }));
    });
    socket.on("zoom:set", (p: { zoom: number; pane?: "left" | "right" }) => {
      if (role === "host") return;
      setState((s) => p.pane === "right" ? ({ ...s, rightZoom: p.zoom }) : ({ ...s, zoom: p.zoom }));
    });
    socket.on("splitRatio:set", (p: { ratio: number }) => {
      if (role === "host") return;
      setState((s) => ({ ...s, splitRatio: p.ratio }));
    });
    socket.on("page:remove", (p: { mode: CsBoardMode; pageIndex: number; pane?: "left" | "right" }) => setState((s) => applyPageRemove(s, p)));
    socket.on("pdf:insert", (p: { pages: string[]; afterPageIndex: number }) => setState((s) => applyPdfInsert(s, p)));
    socket.on("page:insert", (p: { mode: CsBoardMode; afterPageIndex: number; style: CsNotebookStyle; orientation?: CsNotebookOrientation; pane?: "left" | "right" }) => setState((s) => applyNotebookPageInsert(s, p)));
    socket.on("notebook:pageStyle", (p: { page: number; style: CsNotebookStyle }) =>
      setState((s) => applyNotebookPageStyle(s, p)));
    socket.on("board:undo", (p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; pane?: "left" | "right"; before: unknown; after?: unknown }) => setState((s) => applyBoardUndo(s, p)));
    socket.on("board:redo", (p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; pane?: "left" | "right"; before?: unknown; after: unknown }) => setState((s) => applyBoardRedo(s, p)));
    socket.on("scroll:set", (p: CsScrollPosition & { pane?: "left" | "right" }) => {
      if (role === "host") return;
      setState((s) => p.pane === "right" ? ({ ...s, rightScroll: p }) : ({ ...s, scroll: p }));
    });
    socket.on("board:open:set", (p: { isOpen: boolean }) => setState((s) => ({ ...s, isBoardOpen: p.isOpen })));
    socket.on("theme:set", (p: { theme: "light" | "dark" }) => setState((s) => ({ ...s, classroomTheme: p.theme })));
    socket.on("host:online", () => setState((s) => ({ ...s, hostOnline: true })));
    socket.on("host:offline", () => setState((s) => ({ ...s, hostOnline: false })));
    socket.on("session:ended", () => setState((s) => ({ ...s, ended: true })));
    socket.on("reaction:receive", (p: { id: string; userId: string; emoji: string; userName: string; socketId: string }) => {
      const isSelf = p.socketId === socket.id;
      const item: StickerReactionItem = { id: p.id, userId: p.userId, emoji: p.emoji, userName: p.userName, isSelf };

      setState((s) => ({
        ...s,
        reactions: [...(s.reactions ?? []), item],
        userReactions: { ...s.userReactions, [p.userId]: p.emoji },
      }));

      setTimeout(() => {
        setState((s) => ({
          ...s,
          reactions: (s.reactions ?? []).filter((r) => r.id !== p.id),
        }));
      }, 3500);

      setTimeout(() => {
        setState((s) => {
          const nextMap = { ...s.userReactions };
          if (nextMap[p.userId] === p.emoji) {
            delete nextMap[p.userId];
          }
          return { ...s, userReactions: nextMap };
        });
      }, 5000);
    });

    socket.on("hand:update", (p: { raisedHands: RaisedHandItem[] }) => {
      setState((s) => ({ ...s, raisedHands: p.raisedHands }));
    });

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
      socket.off("pdf:insert");
      socket.off("page:insert");
      socket.off("notebook:pageStyle");
      socket.off("board:undo");
      socket.off("board:redo");
      socket.off("scroll:set");
      socket.off("theme:set");
      socket.off("host:online");
      socket.off("host:offline");
      socket.off("session:ended");
      socket.off("reaction:receive");
      socket.off("hand:update");
      if (pointerThrottleTimerRef.current) window.clearTimeout(pointerThrottleTimerRef.current);
      closeClassroomSocket();
    };
  }, [sessionId, role, guestName]);

  const emitHost = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    const socket = getClassroomSocket();
    socket.emit(event, { sessionId: sessionIdRef.current, token: localStorage.getItem("token"), ...payload });
  }, []);

  // Shape/matn sudralganda (resize/rotate/control-point) pointermove sekundiga
  // o'nlab marta otiladi. Har biri to'liq socket.emit qilsa, tarmoq/asosiy
  // thread bosimi ostida keyingi pointermove eventlari "orqada qolib" chiziq
  // sichqonchadan lag bilan ergashadi (silkinib ko'rinadi). Local setState
  // (optimistik, silliq vizual feedback uchun) HAR chaqiruvda darhol
  // bajariladi — faqat SOCKET EMIT bir freym ichida koalessiya qilinadi,
  // faqat oxirgi (eng yangi) qiymat yuboriladi.
  const pendingEmitRef = useRef<Map<string, { event: string; payload: Record<string, unknown> }>>(new Map());
  const emitFrameRef = useRef<number | null>(null);
  const emitHostThrottled = useCallback((coalesceKey: string, event: string, payload: Record<string, unknown> = {}) => {
    pendingEmitRef.current.set(coalesceKey, { event, payload });
    if (emitFrameRef.current !== null) return;
    emitFrameRef.current = window.requestAnimationFrame(() => {
      emitFrameRef.current = null;
      const pending = pendingEmitRef.current;
      pendingEmitRef.current = new Map();
      for (const { event: ev, payload: pl } of pending.values()) emitHost(ev, pl);
    });
  }, [emitHost]);
  const flushHostEmits = useCallback(() => {
    if (emitFrameRef.current !== null) {
      window.cancelAnimationFrame(emitFrameRef.current);
      emitFrameRef.current = null;
    }
    const pending = pendingEmitRef.current;
    pendingEmitRef.current = new Map();
    for (const { event, payload } of pending.values()) emitHost(event, payload);
  }, [emitHost]);

  // MUHIM: `strokesByMode` mavjud bo'lsa (split/replay rejimida), optimistik
  // setState ham uni yangilashi shart. Aks holda keyingi har qanday server echo
  // (stroke:add, stroke:shapeUpdate va h.k.) `updateStrokeListInState` orqali
  // `strokesByPage = strokesByMode[activeLeftMode]` deb qayta derive qiladi va
  // bu yerda strokesByMode eski qiymatda turgani uchun shape/text pozitsiyasi
  // yoki uslubi oldingi holatga «rollback» qilib qo'yiladi.
  const optimistikApplyToPage = (
    s: ClassroomState,
    page: number,
    pane: "left" | "right",
    mode: string | undefined,
    updateFn: (list: CsStroke[]) => CsStroke[],
  ): ClassroomState => {
    const isRight = pane === "right";
    const key = isRight ? "rightStrokesByPage" : "strokesByPage";
    const targetMode = mode ?? (isRight ? s.rightBoardMode : s.leftBoardMode) ?? "pdf";

    if (s.strokesByMode) {
      const byMode = s.strokesByMode;
      const modeObj = byMode[targetMode] ?? {};
      const nextList = updateFn(modeObj[page] ?? []);
      const nextModeObj = { ...modeObj, [page]: nextList };
      const nextByMode = { ...byMode, [targetMode]: nextModeObj };
      const activeLeft = s.leftBoardMode ?? s.boardMode ?? "pdf";
      const activeRight = s.rightBoardMode ?? s.boardMode ?? "pdf";
      return {
        ...s,
        strokesByMode: nextByMode,
        strokesByPage: nextByMode[activeLeft] ?? s.strokesByPage,
        rightStrokesByPage: nextByMode[activeRight] ?? s.rightStrokesByPage,
      };
    }

    const source = s[key];
    return { ...s, [key]: { ...source, [page]: updateFn(source[page] ?? []) } };
  };

  const hostActions = {
    setPage: (page: number) => emitHost("host:setPage", { page }),
    // Optimistik: local ekranga darhol qo'shiladi (socket round-trip'ni
    // kutmasdan) — shuning uchun ustoz o'zi chizganda chiziq «yo'qolib
    // qayta paydo bo'lish» holati bo'lmaydi. Server javobi kelganda
    // stroke:add handleri id bo'yicha dublikatni tashlab yuboradi.
    sendStroke: (page: number, stroke: CsStroke, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf", groupId?: string) => {
      // Shape/text transform hali RAF queue'da turgan paytda yangi connector
      // yuborilsa server avval yangi stroke'ni, keyin eski transformni ko'rib
      // bog'langan obyektlarni rollback qilishi mumkin. Oldingi mutatsiyalarni
      // tartib bilan jo'natib bo'lgachgina yangi stroke qo'shamiz.
      flushHostEmits();
      setState((s) => optimistikApplyToPage(s, page, pane, mode, (list) => {
        if (list.some((x) => x.id === stroke.id)) return list;
        return [...list, stroke];
      }));
      emitHost("host:stroke", { page, stroke, pane, mode, groupId });
    },
    moveStroke: (page: number, strokeId: string, x: number, y: number, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf", groupId?: string) => {
      setState((s) => optimistikApplyToPage(s, page, pane, mode, (list) =>
        list.map((stroke) => stroke.id === strokeId ? { ...stroke, points: moveStrokePoints(stroke, x, y) } : stroke)
      ));
      emitHostThrottled(`moveStroke:${strokeId}`, "host:moveStroke", { page, strokeId, x, y, pane, mode, groupId });
    },
    updateTextStroke: (page: number, stroke: CsStroke, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf", groupId?: string) => {
      setState((s) => optimistikApplyToPage(s, page, pane, mode, (list) =>
        list.map((item) => item.id === stroke.id ? stroke : item)
      ));
      emitHostThrottled(`updateTextStroke:${stroke.id}`, "host:updateTextStroke", { page, stroke, pane, mode, groupId });
    },
    updateShapeStroke: (page: number, stroke: CsStroke, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf", groupId?: string) => {
      setState((s) => optimistikApplyToPage(s, page, pane, mode, (list) =>
        list.map((item) => item.id === stroke.id ? stroke : item)
      ));
      emitHostThrottled(`updateShapeStroke:${stroke.id}`, "host:updateShapeStroke", { page, stroke, pane, mode, groupId });
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
    undo: () => {
      flushHostEmits();
      emitHost("host:undo");
    },
    redo: () => {
      flushHostEmits();
      emitHost("host:redo");
    },
    // Stroke-eraser: sichqoncha ustidan o'tgan chizmani optimistik ravishda
    // darhol o'chiradi, keyin serverga ID bilan yuboradi.
    eraseStroke: (page: number, strokeId: string, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf", groupId?: string) => {
      setState((s) => optimistikApplyToPage(s, page, pane, mode, (list) =>
        list.filter((x) => x.id !== strokeId)
      ));
      emitHost("host:eraseStroke", { page, strokeId, pane, mode, groupId });
    },
    // Pixel-eraser: bitta chizmani (segment-darajasida kesilgan) bir nechta
    // yangi chizmalar bilan optimistik almashtiradi.
    splitStroke: (page: number, strokeId: string, replacements: CsStroke[], pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => {
      setState((s) => optimistikApplyToPage(s, page, pane, mode, (list) => {
        const idx = list.findIndex((x) => x.id === strokeId);
        if (idx === -1) return list;
        const next = [...list];
        next.splice(idx, 1, ...replacements);
        return next;
      }));
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
    setZoom: (zoom: number, pane: "left" | "right" = "left") => {
      setState((s) => pane === "right" ? ({ ...s, rightZoom: zoom }) : ({ ...s, zoom }));
      emitHost("host:setZoom", { zoom, pane });
    },
    setSplitRatio: (ratio: number) => {
      setState((s) => ({ ...s, splitRatio: ratio }));
      emitHost("host:setSplitRatio", { ratio });
    },
    removePage: (mode: CsBoardMode, pageIndex: number, pane: "left" | "right" = "left") =>
      emitHost("host:removePage", { mode, pageIndex, pane }),
    insertNotebookPage: (afterPageIndex: number, style: CsNotebookStyle, orientation: CsNotebookOrientation = "portrait", pane: "left" | "right" = "left") =>
      emitHost("host:insertNotebookPage", { afterPageIndex, style, orientation, pane }),
    setNotebookPageStyle: (page: number, style: CsNotebookStyle, pane: "left" | "right" = "left") =>
      emitHost("host:setNotebookPageStyle", { page, style, pane }),
    pastePage: (mode: CsBoardMode, afterPageIndex: number, pageUrl: string | undefined, style: CsNotebookStyle, orientation: CsNotebookOrientation, strokes: CsStroke[], pane: "left" | "right" = "left") =>
      emitHost("host:pastePage", { mode, afterPageIndex, pageUrl, style, orientation, strokes, pane }),
    setScroll: (page: number, yRatio: number, pane: "left" | "right" = "left", xRatio = 0) => emitHost("host:scroll", { page, yRatio, pane, xRatio }),
    setBoardMode: (mode: CsBoardMode) => emitHost("host:setBoardMode", { mode }),
    setBoardView: (layout: CsBoardLayout, leftMode: CsBoardMode, rightMode: CsBoardMode) => emitHost("host:setBoardView", { layout, leftMode, rightMode }),
    setBoardOpen: (isOpen: boolean) => {
      setState((s) => ({ ...s, isBoardOpen: isOpen }));
      emitHost("host:setBoardOpen", { isOpen });
    },
    setTheme: (theme: "light" | "dark") => {
      setState((s) => ({ ...s, classroomTheme: theme }));
      emitHost("host:setTheme", { theme });
    },
    endLesson: () => emitHost("host:end"),
  };

  const sendReaction = useCallback((emoji: string) => {
    if (!sessionIdRef.current) return;
    const socket = getClassroomSocket();
    const token = localStorage.getItem("token");
    socket.emit("reaction:send", {
      sessionId: sessionIdRef.current,
      token,
      emoji,
      userName: guestName || (role === "host" ? "Ustoz" : "O'quvchi"),
    });
  }, [role, guestName]);

  const toggleHandRaise = useCallback(() => {
    if (!sessionIdRef.current) return;
    const socket = getClassroomSocket();
    const token = localStorage.getItem("token");
    socket.emit("hand:toggle", {
      sessionId: sessionIdRef.current,
      token,
      userName: guestName || (role === "host" ? "Ustoz" : "O'quvchi"),
    });
  }, [role, guestName]);

  const lowerAllHands = useCallback(() => {
    if (!sessionIdRef.current) return;
    const socket = getClassroomSocket();
    const token = localStorage.getItem("token");
    socket.emit("hand:lowerAll", { sessionId: sessionIdRef.current, token });
  }, []);

  const lowerUserHand = useCallback((targetUserId: string) => {
    if (!sessionIdRef.current) return;
    const socket = getClassroomSocket();
    const token = localStorage.getItem("token");
    socket.emit("hand:lowerUser", { sessionId: sessionIdRef.current, token, targetUserId });
  }, []);

  return {
    state,
    hostActions: {
      ...hostActions,
      lowerAllHands,
      lowerUserHand,
    },
    sendReaction,
    toggleHandRaise,
    lowerAllHands,
    lowerUserHand,
  };
}
