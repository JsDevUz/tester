import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {getClassroomSocket, closeClassroomSocket} from '../lib/classroomSocket';
import {useAuthStore} from '../store/authStore';
import {storage} from '../lib/storage';
import {
  applyBoardRedo,
  applyBoardSet,
  applyBoardUndo,
  applyNotebookPageInsert,
  applyNotebookPageStyle,
  applyPageClear,
  applyPageRemove,
  applyPageSet,
  applyPdfInsert,
  applyPdfSet,
  applyStrokeAdd,
  applyStrokeReorder,
  applyStrokeShapeUpdate,
  applyStrokeSplit,
  applyStrokeTextUpdate,
  applyStrokeUndo,
  applyStrokeUpdate,
} from '../lib/classroomReducers';
import {CLASSROOM_INITIAL_STATE} from '../types/classroom';
import type {
  ClassroomState,
  CsBoardMode,
  CsNotebookOrientation,
  CsNotebookStyle,
  CsParticipant,
  CsPointer,
  CsScrollPosition,
  CsSnapshot,
  CsStroke,
  RaisedHandItem,
} from '../types/classroom';

export async function getGuestId(): Promise<string> {
  const existing = await storage.get<string>('classroom_guest_id');
  if (existing) return existing;
  const id = `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await storage.set('classroom_guest_id', id);
  return id;
}

export function isGuestEligible(hasToken: boolean, guestName: string | undefined | null): boolean {
  return hasToken || Boolean(guestName && guestName.trim().length > 0);
}

export function useClassroomSession(
  sessionId: string | undefined,
  guestName?: string,
  userName?: string,
) {
  const [state, setState] = useState<ClassroomState>(CLASSROOM_INITIAL_STATE);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    if (!sessionId) return;
    const socket = getClassroomSocket();
    const token = useAuthStore.getState().token;
    let cancelled = false;

    const join = async () => {
      const joinPayload: Record<string, unknown> = {sessionId, token};
      if (!token && guestName) {
        joinPayload.guestId = await getGuestId();
        joinPayload.guestName = guestName;
      }
      if (cancelled) return;
      socket.emit(
        'student:join',
        joinPayload,
        (res: {ok: boolean; code?: string; state?: CsSnapshot}) => {
          if (!res.ok || !res.state) {
            setState(s => ({...s, error: res.code ?? 'ERROR'}));
            return;
          }
          const snap = res.state;
          setState({
            joined: true,
            error: null,
            ended: false,
            pdfName: snap.pdfName,
            pages: snap.pages,
            currentPage: snap.currentPage,
            strokesByPage: snap.strokesByPage ?? {},
            rightStrokesByPage: snap.rightStrokesByPage ?? {},
            participants: snap.participants,
            hostOnline: snap.hostOnline,
            hostUserId: snap.hostUserId ?? null,
            hostName: snap.hostName ?? null,
            pointer: null,
            zoom: snap.zoom ?? 1,
            scroll: snap.scroll ?? null,
            isFree: snap.isFree,
            rightScroll: snap.rightScroll ?? null,
            rightZoom: snap.rightZoom ?? snap.zoom ?? 1,
            splitRatio: snap.splitRatio ?? 0.5,
            notebookPageCount: snap.notebookPageCount ?? 1,
            boardMode: snap.boardMode ?? 'pdf',
            boardLayout: snap.boardLayout ?? 'single',
            leftBoardMode: snap.leftBoardMode ?? snap.boardMode ?? 'pdf',
            rightBoardMode: snap.rightBoardMode ?? snap.boardMode ?? 'pdf',
            isBoardOpen: snap.isBoardOpen ?? false,
            classroomTheme: snap.classroomTheme ?? 'light',
            notebookPageStyles: snap.notebookPageStyles ?? {},
            notebookPageOrientations: snap.notebookPageOrientations ?? {},
            reactions: [],
            userReactions: {},
            raisedHands: snap.raisedHands ?? [],
          });
        },
      );
    };

    if (socket.connected) void join();
    socket.on('connect', () => void join());

    socket.on('pdf:set', (p: {pdfName: string; pages: string[]; currentPage: number}) =>
      setState(s => applyPdfSet(s, p)),
    );
    socket.on(
      'board:set',
      (p: {
        mode: CsBoardMode;
        layout?: 'single' | 'split';
        leftMode?: CsBoardMode;
        rightMode?: CsBoardMode;
        currentPage: number;
        strokesByPage?: Record<number, CsStroke[]>;
        rightStrokesByPage?: Record<number, CsStroke[]>;
      }) => setState(s => applyBoardSet(s, p)),
    );
    socket.on('page:set', (p: {page: number}) => setState(s => applyPageSet(s, p)));
    socket.on(
      'stroke:add',
      (p: {page: number; stroke: CsStroke; pane?: 'left' | 'right'; mode?: CsBoardMode}) =>
        setState(s => applyStrokeAdd(s, p)),
    );
    socket.on(
      'stroke:update',
      (p: {page: number; strokeId: string; x: number; y: number; pane?: 'left' | 'right'; mode?: CsBoardMode}) =>
        setState(s => applyStrokeUpdate(s, p)),
    );
    socket.on(
      'stroke:textUpdate',
      (p: {page: number; stroke: CsStroke; pane?: 'left' | 'right'; mode?: CsBoardMode}) =>
        setState(s => applyStrokeTextUpdate(s, p)),
    );
    socket.on(
      'stroke:shapeUpdate',
      (p: {page: number; stroke: CsStroke; pane?: 'left' | 'right'; mode?: CsBoardMode}) =>
        setState(s => applyStrokeShapeUpdate(s, p)),
    );
    socket.on(
      'stroke:reorder',
      (p: {
        page: number;
        strokeIds: string[];
        op: 'front' | 'back' | 'forward' | 'backward';
        pane?: 'left' | 'right';
        mode?: CsBoardMode;
      }) => setState(s => applyStrokeReorder(s, p)),
    );
    socket.on(
      'stroke:undo',
      (p: {page: number; strokeId: string; pane?: 'left' | 'right'; mode?: CsBoardMode}) =>
        setState(s => applyStrokeUndo(s, p)),
    );
    socket.on(
      'stroke:split',
      (p: {page: number; strokeId: string; replacements: CsStroke[]; pane?: 'left' | 'right'; mode?: CsBoardMode}) =>
        setState(s => applyStrokeSplit(s, p)),
    );
    socket.on('page:clear', (p: {page: number; pane?: 'left' | 'right'; mode?: CsBoardMode}) =>
      setState(s => applyPageClear(s, p)),
    );
    socket.on('pointer:move', (p: CsPointer) => setState(s => ({...s, pointer: p.active ? p : null})));
    socket.on('presence:update', (p: {participants: CsParticipant[]; hostOnline: boolean}) =>
      setState(s => ({...s, participants: p.participants, hostOnline: p.hostOnline})),
    );
    socket.on('zoom:set', (p: {zoom: number; pane?: 'left' | 'right'}) =>
      setState(s => (p.pane === 'right' ? {...s, rightZoom: p.zoom} : {...s, zoom: p.zoom})),
    );
    socket.on('splitRatio:set', (p: {ratio: number}) => setState(s => ({...s, splitRatio: p.ratio})));
    socket.on(
      'page:remove',
      (p: {mode: CsBoardMode; pageIndex: number; pane?: 'left' | 'right'}) =>
        setState(s => applyPageRemove(s, p)),
    );
    socket.on('pdf:insert', (p: {pages: string[]; afterPageIndex: number}) =>
      setState(s => applyPdfInsert(s, p)),
    );
    socket.on(
      'page:insert',
      (p: {
        mode: CsBoardMode;
        afterPageIndex: number;
        style: CsNotebookStyle;
        orientation?: CsNotebookOrientation;
        pane?: 'left' | 'right';
      }) => setState(s => applyNotebookPageInsert(s, p)),
    );
    socket.on('notebook:pageStyle', (p: {page: number; style: CsNotebookStyle}) =>
      setState(s => applyNotebookPageStyle(s, p)),
    );
    socket.on(
      'board:undo',
      (p: {
        mode: CsBoardMode;
        page: number;
        entryType: string;
        strokeId?: string;
        pane?: 'left' | 'right';
        before: unknown;
        after?: unknown;
      }) => setState(s => applyBoardUndo(s, p)),
    );
    socket.on(
      'board:redo',
      (p: {
        mode: CsBoardMode;
        page: number;
        entryType: string;
        strokeId?: string;
        pane?: 'left' | 'right';
        before?: unknown;
        after: unknown;
      }) => setState(s => applyBoardRedo(s, p)),
    );
    socket.on('scroll:set', (p: CsScrollPosition & {pane?: 'left' | 'right'}) =>
      setState(s => (p.pane === 'right' ? {...s, rightScroll: p} : {...s, scroll: p})),
    );
    socket.on('theme:set', (p: {theme: 'light' | 'dark'}) => setState(s => ({...s, classroomTheme: p.theme})));
    socket.on('host:online', () => setState(s => ({...s, hostOnline: true})));
    socket.on('host:offline', () => setState(s => ({...s, hostOnline: false})));
    socket.on('session:ended', () => setState(s => ({...s, ended: true})));
    socket.on('board:open:set', (p: {isOpen: boolean}) =>
      setState(s => ({...s, isBoardOpen: p.isOpen})),
    );
    socket.on(
      'reaction:receive',
      (p: {id: string; userId: string; emoji: string; userName: string; socketId: string}) => {
        const isSelf = p.socketId === socket.id;
        const item = {id: p.id, userId: p.userId, emoji: p.emoji, userName: p.userName, isSelf};
        setState(s => ({
          ...s,
          reactions: [...s.reactions, item],
          userReactions: {...s.userReactions, [p.userId]: p.emoji},
        }));
        setTimeout(() => {
          setState(s => ({...s, reactions: s.reactions.filter(r => r.id !== p.id)}));
        }, 3500);
        setTimeout(() => {
          setState(s => {
            if (s.userReactions[p.userId] !== p.emoji) return s;
            const nextMap = {...s.userReactions};
            delete nextMap[p.userId];
            return {...s, userReactions: nextMap};
          });
        }, 5000);
      },
    );
    socket.on('hand:update', (p: {raisedHands: RaisedHandItem[]}) =>
      setState(s => ({...s, raisedHands: p.raisedHands})),
    );

    // Mobile OSes suspend background sockets far more aggressively than a
    // browser tab keeps a connection alive — re-join explicitly on
    // foreground rather than relying solely on socket.io's own reconnect.
    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && !socket.connected) {
        socket.connect();
      } else if (nextState === 'active' && socket.connected) {
        void join();
      }
    });

    return () => {
      cancelled = true;
      socket.off('connect');
      socket.off('pdf:set');
      socket.off('board:set');
      socket.off('page:set');
      socket.off('stroke:add');
      socket.off('stroke:update');
      socket.off('stroke:textUpdate');
      socket.off('stroke:shapeUpdate');
      socket.off('stroke:reorder');
      socket.off('stroke:undo');
      socket.off('stroke:split');
      socket.off('page:clear');
      socket.off('pointer:move');
      socket.off('presence:update');
      socket.off('zoom:set');
      socket.off('splitRatio:set');
      socket.off('page:remove');
      socket.off('pdf:insert');
      socket.off('page:insert');
      socket.off('notebook:pageStyle');
      socket.off('board:undo');
      socket.off('board:redo');
      socket.off('scroll:set');
      socket.off('theme:set');
      socket.off('host:online');
      socket.off('host:offline');
      socket.off('session:ended');
      socket.off('board:open:set');
      socket.off('reaction:receive');
      socket.off('hand:update');
      appStateSub.remove();
      closeClassroomSocket();
    };
  }, [sessionId, guestName]);

  const sendReaction = useCallback(
    (emoji: string) => {
      if (!sessionIdRef.current) return;
      const socket = getClassroomSocket();
      const token = useAuthStore.getState().token;
      socket.emit('reaction:send', {
        sessionId: sessionIdRef.current,
        token,
        emoji,
        userName: guestName || userName || "O'quvchi",
      });
    },
    [guestName, userName],
  );

  const toggleHandRaise = useCallback(() => {
    if (!sessionIdRef.current) return;
    const socket = getClassroomSocket();
    const token = useAuthStore.getState().token;
    socket.emit('hand:toggle', {
      sessionId: sessionIdRef.current,
      token,
      userName: guestName || userName || "O'quvchi",
    });
  }, [guestName, userName]);

  return {state, sendReaction, toggleHandRaise};
}
