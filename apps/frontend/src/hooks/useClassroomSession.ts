import { useCallback, useEffect, useRef, useState } from "react";
import { getClassroomSocket, closeClassroomSocket } from "../api/classroomSocket";
import type { CsParticipant, CsPointer, CsSnapshot, CsStroke } from "../api/classroom";

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
}

const INITIAL: ClassroomState = {
  joined: false, error: null, ended: false,
  pdfName: null, pages: [], currentPage: 1,
  strokesByPage: {}, participants: [], hostOnline: false, pointer: null,
};

export function useClassroomSession(sessionId: string | undefined, role: "host" | "student") {
  const [state, setState] = useState<ClassroomState>(INITIAL);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

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
      setState((s) => ({
        ...s,
        strokesByPage: { ...s.strokesByPage, [p.page]: [...(s.strokesByPage[p.page] ?? []), p.stroke] },
      }));
    });
    socket.on("stroke:undo", (p: { page: number; strokeId: string }) => {
      setState((s) => ({
        ...s,
        strokesByPage: { ...s.strokesByPage, [p.page]: (s.strokesByPage[p.page] ?? []).filter((x) => x.id !== p.strokeId) },
      }));
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
    socket.on("host:online", () => setState((s) => ({ ...s, hostOnline: true })));
    socket.on("host:offline", () => setState((s) => ({ ...s, hostOnline: false })));
    socket.on("session:ended", () => setState((s) => ({ ...s, ended: true })));

    return () => {
      socket.off("connect", join);
      socket.off("pdf:set");
      socket.off("page:set");
      socket.off("stroke:add");
      socket.off("stroke:undo");
      socket.off("page:clear");
      socket.off("pointer:move");
      socket.off("presence:update");
      socket.off("host:online");
      socket.off("host:offline");
      socket.off("session:ended");
      closeClassroomSocket();
    };
  }, [sessionId, role]);

  const emitHost = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    const socket = getClassroomSocket();
    socket.emit(event, { sessionId: sessionIdRef.current, token: localStorage.getItem("token"), ...payload });
  }, []);

  const hostActions = {
    setPage: (page: number) => emitHost("host:setPage", { page }),
    sendStroke: (page: number, stroke: CsStroke) => emitHost("host:stroke", { page, stroke }),
    undo: (page: number) => emitHost("host:undo", { page }),
    clearPage: (page: number) => emitHost("host:clearPage", { page }),
    pointer: (page: number, x: number, y: number, active: boolean) => emitHost("host:pointer", { page, x, y, active }),
    endLesson: () => emitHost("host:end"),
  };

  return { state, hostActions };
}
