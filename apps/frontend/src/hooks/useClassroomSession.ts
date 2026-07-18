import { useCallback, useEffect, useRef, useState } from "react";
import { getClassroomSocket, closeClassroomSocket } from "../api/classroomSocket";
import type { CsParticipant, CsPointer, CsScrollPosition, CsSnapshot, CsStroke } from "../api/classroom";

export interface ClassroomState {
  joined: boolean;
  error: string | null;
  ended: boolean;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  participants: CsParticipant[];
  hostOnline: boolean;
  pointer: CsPointer | null;
  // Ustozning zoom darajasi — o'quvchi sinxron rejimda bo'lsa shunga qarab kattalashtiradi.
  zoom: number;
  // Ustozning aniq scroll pozitsiyasi — sahifa raqami + o'sha sahifa
  // balandligi ichidagi nisbiy joy. O'quvchi sinxron rejimda shu sahifaning
  // aynan shu foiziga scroll qiladi (device/ekrandan mustaqil, piksel-aniq).
  scroll: CsScrollPosition | null;
}

const INITIAL: ClassroomState = {
  joined: false, error: null, ended: false,
  pdfName: null, pages: [], currentPage: 1,
  strokesByPage: {}, participants: [], hostOnline: false, pointer: null, zoom: 1, scroll: null,
};

// Ustoz kursorining tarmoqqa yuborilish chastotasi — brauzer pointermove'ni
// sekundiga 60-120 marta otishi mumkin, lekin ko'z 30ms'dan tezroq farqni
// sezmaydi. Throttle bo'lmasa server/tarmoq yuki keraksiz ravishda ortadi.
const POINTER_THROTTLE_MS = 30;

export function useClassroomSession(sessionId: string | undefined, role: "host" | "student") {
  const [state, setState] = useState<ClassroomState>(INITIAL);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const lastPointerSentRef = useRef(0);
  const pointerThrottleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const socket = getClassroomSocket();
    const token = localStorage.getItem("token");

    const join = () => {
      socket.emit(
        role === "host" ? "host:join" : "student:join",
        { sessionId, token },
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
            participants: snap.participants, hostOnline: snap.hostOnline, pointer: null,
            zoom: snap.zoom ?? 1, scroll: snap.scroll ?? null,
          });
        },
      );
    };

    if (socket.connected) join();
    socket.on("connect", join);

    socket.on("pdf:set", (p: { pdfName: string; pages: string[]; currentPage: number }) => {
      setState((s) => ({ ...s, pdfName: p.pdfName, pages: p.pages, currentPage: p.currentPage, strokesByPage: {}, pointer: null }));
    });
    socket.on("page:set", (p: { page: number }) => {
      setState((s) => ({ ...s, currentPage: p.page, pointer: null }));
    });
    socket.on("stroke:add", (p: { page: number; stroke: CsStroke }) => {
      setState((s) => {
        const existing = s.strokesByPage[p.page] ?? [];
        // Optimistik qo'shilgan (o'zimiz chizgan) stroke server javobida
        // qaytib kelganda dublikat bo'lib qo'shilib qolmasin.
        if (existing.some((x) => x.id === p.stroke.id)) return s;
        return { ...s, strokesByPage: { ...s.strokesByPage, [p.page]: [...existing, p.stroke] } };
      });
    });
    socket.on("stroke:undo", (p: { page: number; strokeId: string }) => {
      setState((s) => ({
        ...s,
        strokesByPage: { ...s.strokesByPage, [p.page]: (s.strokesByPage[p.page] ?? []).filter((x) => x.id !== p.strokeId) },
      }));
    });
    socket.on("stroke:split", (p: { page: number; strokeId: string; replacements: CsStroke[] }) => {
      setState((s) => {
        const existing = s.strokesByPage[p.page] ?? [];
        const idx = existing.findIndex((x) => x.id === p.strokeId);
        // O'zimiz optimistik split qilgan bo'lsak, eski ID allaqachon yo'q —
        // shu holatda o'rniga qo'shishning o'rniga dublikatni tekshirib qo'shamiz.
        if (idx === -1) {
          const news = p.replacements.filter((r) => !existing.some((x) => x.id === r.id));
          if (news.length === 0) return s;
          return { ...s, strokesByPage: { ...s.strokesByPage, [p.page]: [...existing, ...news] } };
        }
        const next = [...existing];
        next.splice(idx, 1, ...p.replacements);
        return { ...s, strokesByPage: { ...s.strokesByPage, [p.page]: next } };
      });
    });
    socket.on("page:clear", (p: { page: number }) => {
      setState((s) => ({ ...s, strokesByPage: { ...s.strokesByPage, [p.page]: [] } }));
    });
    socket.on("pointer:move", (p: CsPointer) => {
      setState((s) => ({ ...s, pointer: p.active ? p : null }));
    });
    socket.on("presence:update", (p: { participants: CsParticipant[]; hostOnline: boolean }) => {
      setState((s) => ({ ...s, participants: p.participants, hostOnline: p.hostOnline }));
    });
    socket.on("zoom:set", (p: { zoom: number }) => setState((s) => ({ ...s, zoom: p.zoom })));
    socket.on("scroll:set", (p: CsScrollPosition) => setState((s) => ({ ...s, scroll: p })));
    socket.on("host:online", () => setState((s) => ({ ...s, hostOnline: true })));
    socket.on("host:offline", () => setState((s) => ({ ...s, hostOnline: false })));
    socket.on("session:ended", () => setState((s) => ({ ...s, ended: true })));

    return () => {
      socket.off("connect", join);
      socket.off("pdf:set");
      socket.off("page:set");
      socket.off("stroke:add");
      socket.off("stroke:undo");
      socket.off("stroke:split");
      socket.off("page:clear");
      socket.off("pointer:move");
      socket.off("presence:update");
      socket.off("zoom:set");
      socket.off("scroll:set");
      socket.off("host:online");
      socket.off("host:offline");
      socket.off("session:ended");
      if (pointerThrottleTimerRef.current) window.clearTimeout(pointerThrottleTimerRef.current);
      closeClassroomSocket();
    };
  }, [sessionId, role]);

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
    sendStroke: (page: number, stroke: CsStroke) => {
      setState((s) => {
        const existing = s.strokesByPage[page] ?? [];
        if (existing.some((x) => x.id === stroke.id)) return s;
        return { ...s, strokesByPage: { ...s.strokesByPage, [page]: [...existing, stroke] } };
      });
      emitHost("host:stroke", { page, stroke });
    },
    undo: (page: number) => emitHost("host:undo", { page }),
    // Stroke-eraser: sichqoncha ustidan o'tgan chizmani optimistik ravishda
    // darhol o'chiradi, keyin serverga ID bilan yuboradi.
    eraseStroke: (page: number, strokeId: string) => {
      setState((s) => ({
        ...s,
        strokesByPage: { ...s.strokesByPage, [page]: (s.strokesByPage[page] ?? []).filter((x) => x.id !== strokeId) },
      }));
      emitHost("host:eraseStroke", { page, strokeId });
    },
    // Pixel-eraser: bitta chizmani (segment-darajasida kesilgan) bir nechta
    // yangi chizmalar bilan optimistik almashtiradi.
    splitStroke: (page: number, strokeId: string, replacements: CsStroke[]) => {
      setState((s) => {
        const existing = s.strokesByPage[page] ?? [];
        const idx = existing.findIndex((x) => x.id === strokeId);
        if (idx === -1) return s;
        const next = [...existing];
        next.splice(idx, 1, ...replacements);
        return { ...s, strokesByPage: { ...s.strokesByPage, [page]: next } };
      });
      emitHost("host:splitStroke", { page, strokeId, replacements });
    },
    clearPage: (page: number) => emitHost("host:clearPage", { page }),
    // ~30ms throttle: pointermove juda tez-tez otiladi, lekin ko'zga bu
    // aniqlik shart emas. "active: false" (barmoq/sichqoncha ko'tarilishi)
    // hech qachon throttle'lanmaydi — aks holda kursor oxirgi joyida
    // "yopishib" qolib, hech qachon yashirinmasligi mumkin edi.
    pointer: (page: number, x: number, y: number, active: boolean) => {
      if (pointerThrottleTimerRef.current) {
        window.clearTimeout(pointerThrottleTimerRef.current);
        pointerThrottleTimerRef.current = null;
      }
      if (!active) {
        lastPointerSentRef.current = Date.now();
        emitHost("host:pointer", { page, x, y, active });
        return;
      }
      const now = Date.now();
      const elapsed = now - lastPointerSentRef.current;
      if (elapsed >= POINTER_THROTTLE_MS) {
        lastPointerSentRef.current = now;
        emitHost("host:pointer", { page, x, y, active });
      } else {
        pointerThrottleTimerRef.current = window.setTimeout(() => {
          lastPointerSentRef.current = Date.now();
          emitHost("host:pointer", { page, x, y, active });
        }, POINTER_THROTTLE_MS - elapsed);
      }
    },
    setZoom: (zoom: number) => emitHost("host:setZoom", { zoom }),
    setScroll: (page: number, yRatio: number) => emitHost("host:scroll", { page, yRatio }),
    endLesson: () => emitHost("host:end"),
  };

  return { state, hostActions };
}
