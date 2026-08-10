# Mobile Classroom Student Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the mobile app's live classroom student experience to full 1:1 parity with the web app (`isBoardOpen` participants grid, guest join, reactions, raised hands, audio-unlock, consolidated call bar) and replace the WebView-based replay with a fully native `ClassroomReplayScreen`.

**Architecture:** Extend the existing ported-reducer + socket.io + LiveKit + Skia architecture already established in `apps/mobile/src/{hooks,components/classroom,types}/classroom*`. No new native dependencies — everything needed (`@shopify/react-native-skia`, `@livekit/react-native`, `socket.io-client`, `react-native-video`, `react-native-gesture-handler`, `react-native-reanimated`) is already installed. Work proceeds bottom-up: types → reducers/hooks → leaf UI components → screens → navigation wiring.

**Tech Stack:** React Native (bare CLI, no Expo), TypeScript, Zustand (`useAuthStore`), socket.io-client, `@livekit/react-native`, `@shopify/react-native-skia`, `react-native-gesture-handler` + `react-native-reanimated`, `react-native-video`, Jest for pure-logic unit tests.

## Global Constraints

- Host/teacher tooling is permanently out of scope — no drawing/editing, no toolbar, no PDF library management, no recording controls, no mute-other-participants, no theme-toggle control (mobile only *receives* `theme:set`).
- No mic device picker (OS handles audio routing) — confirmed prior decision, unchanged.
- No new native dependencies.
- Full interactive replay scrubbing (`recordingMode: 'full'`) is never built — students are backend-restricted to the board-only replay view on web too.
- All new UI strings are in Uzbek, matching the existing codebase's convention (see `ERROR_MESSAGES`, `ClassroomMicControl`, etc. in the current mobile classroom code).
- Match the web visual design intent (avatar tiles, floating reaction stickers, green raised-hand pill) adapted to React Native primitives — not a pixel clone of CSS, but the same interaction model and information hierarchy.
- Jest unit tests only for pure logic (reducers, gating functions, timing math) — no component/rendering tests for Skia/gesture layers, matching this codebase's established test culture (see `__tests__/classroomReducers.test.ts`).
- Follow existing file conventions: inline `style={{}}` objects (not NativeWind `className`) inside `components/classroom/*` and `screens/ClassroomScreen.tsx` — matches every existing file in that directory. `LessonBlock.tsx`/`CourseScreen.tsx` use NativeWind `className`; when editing those files, match their existing convention instead.

---

## File Structure

**New files:**
- `apps/mobile/src/components/classroom/ClassroomParticipantsGrid.tsx` — avatar-tile grid for `isBoardOpen === false`
- `apps/mobile/src/components/classroom/ClassroomTopParticipantBar.tsx` — compact horizontal strip shown above the board
- `apps/mobile/src/components/classroom/ClassroomCallBar.tsx` — consolidated bottom bar (mic, reactions, hand-raise, participants)
- `apps/mobile/src/components/classroom/StickerReactionsOverlay.tsx` — floating animated emoji reactions
- `apps/mobile/src/components/classroom/ClassroomReactionPicker.tsx` — emoji picker sheet triggered from the call bar
- `apps/mobile/src/components/classroom/RaisedHandsControl.tsx` — green pill + read-only raised-hands list sheet
- `apps/mobile/src/components/classroom/ClassroomSubtitleOverlay.tsx` — replay subtitle cue display
- `apps/mobile/src/components/classroom/ClassroomGuestJoinForm.tsx` — pre-join guest name entry screen
- `apps/mobile/src/components/classroom/ClassroomReplayTransportBar.tsx` — play/pause/scrub bar for replay
- `apps/mobile/src/components/classroom/ClassroomAttendanceSheet.tsx` — attendance bottom sheet for replay
- `apps/mobile/src/lib/classroomReplay.ts` — pure `computeReplayOverlayAt(events, timeMs)` helper (zoom/scroll/pointer-only replay derivation)
- `apps/mobile/src/screens/ClassroomReplayScreen.tsx` — new native replay screen
- `apps/mobile/__tests__/classroomGuestEligibility.test.ts` — pure-logic tests for guest-join gating
- `apps/mobile/__tests__/classroomReplay.test.ts` — pure-logic tests for `computeReplayOverlayAt`
- `apps/mobile/__tests__/stickerReactionAnim.test.ts` — pure-logic tests for the deterministic per-reaction animation seed math

**Modified files:**
- `apps/mobile/src/types/classroom.ts` — add `isBoardOpen`, `hostName`, `raisedHands`, extend `CsTool`, extend `ClassReplayData`
- `apps/mobile/src/hooks/useClassroomSession.ts` — add `board:open:set`/`reaction:receive`/`hand:update` listeners, add `sendReaction`/`toggleHandRaise` emitters, guest-eligibility support
- `apps/mobile/src/hooks/useClassroomVoice.ts` — guest-name voice-token support, `needsAudioUnlock`/`unlockAudio`
- `apps/mobile/src/api/classroom.ts` — add `apiVoiceTokenGuest`, extend `apiClassReplay` usage
- `apps/mobile/src/screens/ClassroomScreen.tsx` — branch on `isBoardOpen`, guest join gate, new call bar
- `apps/mobile/src/screens/CourseScreen.tsx` — `openLiveClassReplay` navigates natively instead of via WebView
- `apps/mobile/src/navigation/types.ts` — add `ClassroomReplay: {sessionId: string}`
- `apps/mobile/src/navigation/RootNavigator.tsx` — register `ClassroomReplay` route

---

## Task 1: Extend classroom types for parity fields

**Files:**
- Modify: `apps/mobile/src/types/classroom.ts`
- Test: `apps/mobile/__tests__/classroomReducers.test.ts` (existing — must still pass unchanged)

**Interfaces:**
- Consumes: nothing (base types file)
- Produces: `CsTool` (extended union), `CsParticipant`, `ClassroomState.isBoardOpen: boolean`, `ClassroomState.hostName: string | null`, `ClassroomState.raisedHands: RaisedHandItem[]`, `ClassroomState.reactions: StickerReactionItem[]`, `ClassroomState.userReactions: Record<string, string>`, `RaisedHandItem { userId: string; userName: string; raisedAt: number }`, `StickerReactionItem { id: string; userId: string; emoji: string; userName: string; isSelf: boolean }`, `ClassReplayData` extended with `boardSnapshot`, `recordingMode`, `subtitles`, `recordings`, `isTeacher`.

- [ ] **Step 1: Extend `CsTool` and add `RaisedHandItem`/`StickerReactionItem` types**

In `apps/mobile/src/types/classroom.ts`, replace line 1:

```ts
export type CsTool = 'pen' | 'highlighter' | 'arrow' | 'text' | 'rectangle' | 'ellipse';
```

with:

```ts
export type CsTool =
  | 'pen'
  | 'highlighter'
  | 'laser'
  | 'arrow'
  | 'line'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'select'
  | 'eraser-pixel'
  | 'eraser-stroke'
  | 'lasso';

export interface RaisedHandItem {
  userId: string;
  userName: string;
  raisedAt: number;
}

export interface StickerReactionItem {
  id: string;
  userId: string;
  emoji: string;
  userName: string;
  isSelf: boolean;
}
```

Mobile never renders `select`/`eraser-*`/`lasso`/`laser` tools (it never draws), but a stroke record broadcast from a teacher who used one of these tools must not crash `ClassroomStrokeCanvas`'s tool-based branching — the fallback branch (freehand path, line 123-134 in `ClassroomStrokeCanvas.tsx`) already handles any unrecognized tool value safely as a plain stroke, so no renderer change is required in this task.

- [ ] **Step 2: Add `isBoardOpen`, `hostName`, `raisedHands`, `reactions`, `userReactions` to `CsSnapshot` and `ClassroomState`**

In `apps/mobile/src/types/classroom.ts`, update the `CsSnapshot` interface (currently lines 48-69):

```ts
export interface CsSnapshot {
  sessionId: string;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  rightStrokesByPage: Record<number, CsStroke[]>;
  participants: CsParticipant[];
  startedAt: number;
  hostOnline: boolean;
  hostName?: string | null;
  zoom: number;
  rightZoom?: number;
  scroll: CsScrollPosition | null;
  rightScroll?: CsScrollPosition | null;
  isFree: boolean;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  isBoardOpen?: boolean;
  classroomTheme: 'light' | 'dark';
  notebookStyle: CsNotebookStyle;
  raisedHands?: RaisedHandItem[];
}
```

Update `ClassroomState` (currently lines 84-107):

```ts
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
  hostName: string | null;
  pointer: CsPointer | null;
  zoom: number;
  rightZoom: number;
  scroll: CsScrollPosition | null;
  rightScroll: CsScrollPosition | null;
  isFree: boolean;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  isBoardOpen: boolean;
  classroomTheme: 'light' | 'dark';
  notebookStyle: CsNotebookStyle;
  reactions: StickerReactionItem[];
  userReactions: Record<string, string>;
  raisedHands: RaisedHandItem[];
}
```

Update `CLASSROOM_INITIAL_STATE` (currently lines 109-116) to add the new fields:

```ts
export const CLASSROOM_INITIAL_STATE: ClassroomState = {
  joined: false, error: null, ended: false,
  pdfName: null, pages: [], currentPage: 1,
  strokesByPage: {}, rightStrokesByPage: {}, participants: [], hostOnline: false, hostName: null, pointer: null,
  zoom: 1, rightZoom: 1, scroll: null, rightScroll: null,
  isFree: false, boardMode: 'pdf', boardLayout: 'single', leftBoardMode: 'pdf', rightBoardMode: 'pdf',
  isBoardOpen: false,
  classroomTheme: 'light', notebookStyle: 'grid',
  reactions: [], userReactions: {}, raisedHands: [],
};
```

- [ ] **Step 3: Extend `ClassReplayData` with replay parity fields**

In `apps/mobile/src/types/classroom.ts`, replace the existing `ClassReplayEvent`/`ClassReplayData` block (currently lines 122-136):

```ts
export interface ClassReplayEvent {
  type: string;
  payload: unknown;
  atMs: number;
}

export type CsRecordingMode = 'full' | 'boardAudio' | 'boardSilent';

export interface ClassSubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface ClassBoardSnapshotData {
  pdfName: string | null;
  pages: string[];
  strokesByPage: Record<number, CsStroke[]>;
  rightStrokesByPage: Record<number, CsStroke[]>;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  notebookStyle: CsNotebookStyle;
  subtitles?: ClassSubtitleCue[];
}

export interface ClassReplayData {
  isTeacher: boolean;
  pdfName: string | null;
  pdfPages: string[];
  historyEvents: ClassReplayEvent[];
  recordingUrl: string | null;
  recordingStatus: 'none' | 'pending' | 'ready' | 'failed';
  recordingStartedAtMs: number | null;
  attendance: Array<{userId: string; name: string; status: 'absent' | 'present' | 'late'}>;
  recordingMode: CsRecordingMode | null;
  boardSnapshot: ClassBoardSnapshotData | null;
  subtitles?: ClassSubtitleCue[];
}
```

Note: this drops the old bare `pdfPages`-only shape in favor of the extended one — every field from the old interface (`pdfName`, `pdfPages`, `historyEvents`, `recordingUrl`, `recordingStatus`, `recordingStartedAtMs`, `attendance`) is preserved with the same name and type, so this is purely additive for any existing caller.

- [ ] **Step 4: Run the existing reducer test suite to confirm nothing broke**

Run: `cd apps/mobile && yarn jest __tests__/classroomReducers.test.ts`
Expected: PASS (all existing tests unchanged — this task only added fields with safe defaults, didn't change reducer logic)

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors from `types/classroom.ts` (there will likely be pre-existing errors elsewhere in files this plan hasn't touched yet, e.g. `ClassroomScreen.tsx` referencing `state.isBoardOpen` — ignore those until their owning task; but nothing in `types/classroom.ts` itself or `lib/classroomReducers.ts` should now fail)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/types/classroom.ts
git commit -m "feat(mobile): extend classroom types for parity fields"
```

---

## Task 2: Extend `useClassroomSession` with `isBoardOpen`, reactions, raised hands, guest support

**Files:**
- Modify: `apps/mobile/src/hooks/useClassroomSession.ts`
- Test: `apps/mobile/__tests__/classroomGuestEligibility.test.ts`

**Interfaces:**
- Consumes: `CLASSROOM_INITIAL_STATE`, `ClassroomState`, `RaisedHandItem`, `StickerReactionItem` from Task 1
- Produces: `useClassroomSession(sessionId, guestName?, userName?) => {state, sendReaction(emoji: string), toggleHandRaise()}`, exported pure function `isGuestEligible(hasToken: boolean, guestName: string | undefined | null): boolean`

- [ ] **Step 1: Write the failing test for the guest-eligibility gate**

Create `apps/mobile/__tests__/classroomGuestEligibility.test.ts`:

```ts
import {isGuestEligible} from '../src/hooks/useClassroomSession';

describe('isGuestEligible', () => {
  it('is eligible when a token is present, regardless of guest name', () => {
    expect(isGuestEligible(true, undefined)).toBe(true);
    expect(isGuestEligible(true, 'Ali')).toBe(true);
  });

  it('is eligible when no token but a non-empty guest name was submitted', () => {
    expect(isGuestEligible(false, 'Ali')).toBe(true);
  });

  it('is not eligible when no token and no guest name', () => {
    expect(isGuestEligible(false, undefined)).toBe(false);
    expect(isGuestEligible(false, '')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && yarn jest __tests__/classroomGuestEligibility.test.ts`
Expected: FAIL — `isGuestEligible` is not exported from `useClassroomSession`

- [ ] **Step 3: Read the full current file to plan the edit precisely**

Already read in full above (214 lines) — the edit adds: (a) an exported `isGuestEligible` pure function, (b) new socket listeners for `board:open:set`, `reaction:receive`, `hand:update`, (c) new state fields wiring in the join-ack handler, (d) `sendReaction`/`toggleHandRaise` emitters, (e) a `userName` parameter (mirrors web's `guestName || (role === "host" ? "Ustoz" : "O'quvchi")` fallback — mobile is always `"student"` role so it simplifies to `guestName || userName || "O'quvchi"`).

- [ ] **Step 4: Implement — add `isGuestEligible` and voice-related plumbing**

In `apps/mobile/src/hooks/useClassroomSession.ts`, add near the top (after `getGuestId`, before `useClassroomSession`):

```ts
export function isGuestEligible(hasToken: boolean, guestName: string | undefined | null): boolean {
  return hasToken || Boolean(guestName && guestName.trim().length > 0);
}
```

- [ ] **Step 5: Extend the join-ack snapshot hydration**

In the `join` function's ack callback (currently lines 60-89), replace the `setState({...})` block to also hydrate `hostName`, `isBoardOpen`, and reset `reactions`/`userReactions`/`raisedHands`:

```ts
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
            hostName: snap.hostName ?? null,
            pointer: null,
            zoom: snap.zoom ?? 1,
            scroll: snap.scroll ?? null,
            isFree: snap.isFree,
            rightScroll: snap.rightScroll ?? null,
            rightZoom: snap.rightZoom ?? snap.zoom ?? 1,
            boardMode: snap.boardMode ?? 'pdf',
            boardLayout: snap.boardLayout ?? 'single',
            leftBoardMode: snap.leftBoardMode ?? snap.boardMode ?? 'pdf',
            rightBoardMode: snap.rightBoardMode ?? snap.boardMode ?? 'pdf',
            isBoardOpen: snap.isBoardOpen ?? false,
            classroomTheme: snap.classroomTheme ?? 'light',
            notebookStyle: snap.notebookStyle ?? 'grid',
            reactions: [],
            userReactions: {},
            raisedHands: snap.raisedHands ?? [],
          });
```

- [ ] **Step 6: Add the three new socket listeners**

After the existing `socket.on('session:ended', ...)` line (currently line 172), add:

```ts
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
```

Add the matching `socket.off(...)` calls in the cleanup function (after `socket.off('session:ended');`):

```ts
      socket.off('board:open:set');
      socket.off('reaction:receive');
      socket.off('hand:update');
```

Update the import line to bring in `RaisedHandItem`:

```ts
import type {
  ClassroomState,
  CsBoardMode,
  CsNotebookStyle,
  CsParticipant,
  CsPointer,
  CsScrollPosition,
  CsSnapshot,
  CsStroke,
  RaisedHandItem,
} from '../types/classroom';
```

- [ ] **Step 7: Add `sendReaction`/`toggleHandRaise` and a `userName` parameter**

Change the hook signature (currently `export function useClassroomSession(sessionId: string | undefined, guestName?: string) {`) to:

```ts
export function useClassroomSession(
  sessionId: string | undefined,
  guestName?: string,
  userName?: string,
) {
```

Before the `return {state};` at the end of the hook, add:

```ts
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
```

Add `useCallback` to the existing `import {useEffect, useRef, useState} from 'react';` line → `import {useCallback, useEffect, useRef, useState} from 'react';`.

Update the `useEffect` dependency array (currently `[sessionId, guestName]`) to include `userName` is not required since `userName` isn't read inside that effect — leave it as `[sessionId, guestName]`.

- [ ] **Step 8: Run the guest-eligibility test to verify it passes**

Run: `cd apps/mobile && yarn jest __tests__/classroomGuestEligibility.test.ts`
Expected: PASS

- [ ] **Step 9: Run the full reducer + guest-eligibility suite and typecheck**

Run: `cd apps/mobile && yarn jest __tests__/classroomReducers.test.ts __tests__/classroomGuestEligibility.test.ts && yarn tsc --noEmit`
Expected: PASS (typecheck will still show pre-existing errors in not-yet-updated consumer files like `ClassroomScreen.tsx` — that's expected until Task 8)

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/hooks/useClassroomSession.ts apps/mobile/__tests__/classroomGuestEligibility.test.ts
git commit -m "feat(mobile): add isBoardOpen, reactions, raised hands, guest support to useClassroomSession"
```

---

## Task 3: Extend `useClassroomVoice` with guest voice tokens and audio-unlock

**Files:**
- Modify: `apps/mobile/src/hooks/useClassroomVoice.ts`
- Modify: `apps/mobile/src/api/classroom.ts`

**Interfaces:**
- Consumes: none new
- Produces: `apiVoiceTokenGuest(sessionId: string, guestId: string, guestName: string): Promise<{token: string; url: string}>`, `useClassroomVoice(sessionId, guestName?) => {..., needsAudioUnlock: boolean, unlockAudio: () => void}`

- [ ] **Step 1: Add the guest voice-token API call**

In `apps/mobile/src/api/classroom.ts`, add after the existing `apiVoiceToken`:

```ts
export async function apiVoiceTokenGuest(
  sessionId: string,
  guestId: string,
  guestName: string,
): Promise<{token: string; url: string}> {
  const res = await api.post(`/classroom/sessions/${sessionId}/voice-token/guest`, {guestId, guestName});
  return res.data;
}
```

- [ ] **Step 2: Extend `useClassroomVoice` to accept an optional guest name and call the right endpoint**

In `apps/mobile/src/hooks/useClassroomVoice.ts`, change the import line:

```ts
import {apiVoiceToken, apiVoiceTokenGuest} from '../api/classroom';
```

Change the hook signature from `export function useClassroomVoice(sessionId: string | undefined) {` to:

```ts
export function useClassroomVoice(sessionId: string | undefined, guestName?: string) {
```

Add `needsAudioUnlock` state and a ref to track tracks pending unlock, alongside the existing `useState` calls:

```ts
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
```

(`@livekit/react-native`'s track subscription attaches and plays through the native audio session automatically — there is no browser-style `HTMLMediaElement.play()` promise to catch a rejection from, so this flag is set defensively only if a `RoomEvent.TrackSubscribed` handler ever needs to report a playback failure; for this task, expose the field and a no-op-safe `unlockAudio` that simply clears it, matching the spec's "thin, mostly-dormant affordance" scope — do not add speculative retry/attach logic beyond what LiveKit's RN SDK already does automatically.)

Replace the token-fetch line inside the async IIFE:

```ts
        const {token, url} = await apiVoiceToken(sessionId);
```

with:

```ts
        const {token, url} = guestName
          ? await apiVoiceTokenGuest(sessionId, await getGuestId(), guestName)
          : await apiVoiceToken(sessionId);
```

This requires importing `getGuestId`. Since `getGuestId` in `useClassroomSession.ts` is currently a module-private (non-exported) `async function`, export it there first:

In `apps/mobile/src/hooks/useClassroomSession.ts`, change `async function getGuestId(): Promise<string> {` to `export async function getGuestId(): Promise<string> {`.

Then in `apps/mobile/src/hooks/useClassroomVoice.ts`, add the import:

```ts
import {getGuestId} from './useClassroomSession';
```

Update the effect's dependency array from `[sessionId]` to `[sessionId, guestName]`.

Add `unlockAudio` alongside the existing `toggleMic` and update the return statement:

```ts
  const unlockAudio = useCallback(() => {
    setNeedsAudioUnlock(false);
  }, []);

  return {connected, micEnabled, voiceAvailable, toggleMic, activeSpeakerIds, needsAudioUnlock, unlockAudio};
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors originating from `hooks/useClassroomVoice.ts`, `hooks/useClassroomSession.ts`, or `api/classroom.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/useClassroomVoice.ts apps/mobile/src/hooks/useClassroomSession.ts apps/mobile/src/api/classroom.ts
git commit -m "feat(mobile): add guest voice-token support and audio-unlock affordance"
```

---

## Task 4: `ClassroomParticipantsGrid` and `ClassroomTopParticipantBar`

**Files:**
- Create: `apps/mobile/src/components/classroom/ClassroomParticipantsGrid.tsx`
- Create: `apps/mobile/src/components/classroom/ClassroomTopParticipantBar.tsx`

**Interfaces:**
- Consumes: `CsParticipant` from `types/classroom.ts`
- Produces: `ClassroomParticipantsGrid({participants, speakingUserIds, myUserId, myUserName, hostOnline, hostName}: Props)`, `ClassroomTopParticipantBar({participants, speakingUserIds, myUserId, myUserName, hostOnline, hostName}: Props)` — both pure presentational components, no internal data fetching.

- [ ] **Step 1: Implement `ClassroomParticipantsGrid.tsx`**

```tsx
import React, {useMemo} from 'react';
import {ScrollView, Text, View, useWindowDimensions} from 'react-native';
import {Mic, MicOff} from 'lucide-react-native';
import type {CsParticipant} from '../../types/classroom';

const AVATAR_COLORS = [
  '#e67700', '#087f5b', '#1971c2', '#5f3dc4',
  '#c2255c', '#2f9e44', '#1864ab', '#862e9c',
  '#d9480f', '#099268', '#1098ad', '#ae3ec9',
];

function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface Tile {
  userId: string;
  name: string;
  isMuted: boolean;
  role: 'host' | 'student';
}

export function ClassroomParticipantsGrid({
  participants,
  speakingUserIds,
  myUserId,
  myUserName = 'Siz',
  hostOnline,
  hostName = 'Ustoz',
}: {
  participants: CsParticipant[];
  speakingUserIds: Set<string>;
  myUserId: string | null;
  myUserName?: string;
  hostOnline: boolean;
  hostName?: string | null;
}) {
  const {width} = useWindowDimensions();

  const listToDisplay = useMemo<Tile[]>(() => {
    const hasMe = participants.some(p => p.userId === myUserId);
    const list: Tile[] = [
      ...(hostOnline ? [{userId: 'host', name: hostName || 'Ustoz', isMuted: true, role: 'host' as const}] : []),
      ...(!hasMe && myUserName
        ? [{userId: myUserId || 'me', name: myUserName, isMuted: true, role: 'student' as const}]
        : []),
      ...participants
        .filter(p => p.online)
        .map(p => ({userId: p.userId, name: p.name, isMuted: true, role: 'student' as const})),
    ];
    return [...list].sort((a, b) => {
      const aIsMe = a.userId === myUserId;
      const bIsMe = b.userId === myUserId;
      if (aIsMe) return -1;
      if (bIsMe) return 1;
      if (a.role === 'host' && b.role !== 'host') return -1;
      if (a.role !== 'host' && b.role === 'host') return 1;
      const aSpeaking = speakingUserIds.has(a.userId);
      const bSpeaking = speakingUserIds.has(b.userId);
      if (aSpeaking && !bSpeaking) return -1;
      if (!aSpeaking && bSpeaking) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [participants, myUserId, myUserName, hostOnline, hostName, speakingUserIds]);

  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const tileSize = (width - 16 * 2 - (cols - 1) * 12) / cols;

  return (
    <ScrollView
      style={{flex: 1, backgroundColor: '#18191c'}}
      contentContainerStyle={{padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12}}>
      {listToDisplay.map(p => {
        const isSpeaking = speakingUserIds.has(p.userId);
        const isMe = p.userId === myUserId;
        const isHost = p.role === 'host';
        const bgColor = isHost ? '#4f46e5' : getAvatarColor(p.name);
        const displayName = isHost
          ? isMe
            ? `${p.name} (Ustoz, Siz)`
            : `${p.name} (Ustoz)`
          : isMe
          ? `${p.name} (Siz)`
          : p.name;
        return (
          <View
            key={p.userId}
            style={{
              width: tileSize,
              aspectRatio: 16 / 9,
              minHeight: 120,
              borderRadius: 20,
              backgroundColor: '#28292d',
              borderWidth: isSpeaking ? 2 : 1,
              borderColor: isSpeaking ? '#10b981' : 'rgba(255,255,255,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: bgColor,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{color: 'white', fontSize: 24, fontWeight: '700'}}>{getInitials(p.name)}</Text>
            </View>
            <View
              style={{
                position: 'absolute',
                bottom: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'rgba(0,0,0,0.35)',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                maxWidth: '90%',
              }}>
              <Text numberOfLines={1} style={{color: 'white', fontSize: 11, fontWeight: '600', flexShrink: 1}}>
                {displayName}
              </Text>
              {p.isMuted ? <MicOff size={12} color="rgba(255,255,255,0.6)" /> : <Mic size={12} color="#10b981" />}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Implement `ClassroomTopParticipantBar.tsx`**

```tsx
import React, {useMemo} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {Mic, MicOff} from 'lucide-react-native';
import type {CsParticipant} from '../../types/classroom';

const AVATAR_COLORS = [
  '#e67700', '#087f5b', '#1971c2', '#5f3dc4',
  '#c2255c', '#2f9e44', '#1864ab', '#862e9c',
];

function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function ClassroomTopParticipantBar({
  participants,
  speakingUserIds,
  myUserId,
  myUserName = 'Siz',
  hostOnline,
  hostName = 'Ustoz',
}: {
  participants: CsParticipant[];
  speakingUserIds: Set<string>;
  myUserId: string | null;
  myUserName?: string;
  hostOnline: boolean;
  hostName?: string | null;
}) {
  const tiles = useMemo(() => {
    const hasMe = participants.some(p => p.userId === myUserId);
    return [
      ...(hostOnline ? [{userId: 'host', name: hostName || 'Ustoz', isHost: true}] : []),
      ...(!hasMe && myUserName ? [{userId: myUserId || 'me', name: myUserName, isHost: false}] : []),
      ...participants.filter(p => p.online).map(p => ({userId: p.userId, name: p.name, isHost: false})),
    ];
  }, [participants, myUserId, myUserName, hostOnline, hostName]);

  if (tiles.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{maxHeight: 56}}
      contentContainerStyle={{paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center'}}>
      {tiles.map(t => {
        const isSpeaking = speakingUserIds.has(t.userId);
        const bg = t.isHost ? '#4f46e5' : getAvatarColor(t.name);
        return (
          <View
            key={t.userId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderWidth: isSpeaking ? 1.5 : 0,
              borderColor: '#10b981',
            }}>
            <View style={{width: 22, height: 22, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center'}}>
              <Text style={{color: 'white', fontSize: 10, fontWeight: '700'}}>
                {t.name.trim().slice(0, 1).toUpperCase() || '?'}
              </Text>
            </View>
            <Text numberOfLines={1} style={{color: 'white', fontSize: 11, fontWeight: '600', maxWidth: 90}}>
              {t.name}
            </Text>
            {isSpeaking ? <Mic size={11} color="#10b981" /> : <MicOff size={11} color="rgba(255,255,255,0.4)" />}
          </View>
        );
      })}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors from these two files (both are standalone presentational components with no external wiring yet)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/classroom/ClassroomParticipantsGrid.tsx apps/mobile/src/components/classroom/ClassroomTopParticipantBar.tsx
git commit -m "feat(mobile): add ClassroomParticipantsGrid and ClassroomTopParticipantBar"
```

---

## Task 5: Sticker reactions overlay + picker

**Files:**
- Create: `apps/mobile/src/lib/stickerReactionAnim.ts` — pure per-reaction animation seed math (extracted for testability)
- Create: `apps/mobile/src/components/classroom/StickerReactionsOverlay.tsx`
- Create: `apps/mobile/src/components/classroom/ClassroomReactionPicker.tsx`
- Test: `apps/mobile/__tests__/stickerReactionAnim.test.ts`

**Interfaces:**
- Consumes: `StickerReactionItem` from `types/classroom.ts`
- Produces: `getReactionAnimProps(id: string): {leftPct: number; swingX: number; durationMs: number; delayMs: number}`, `StickerReactionsOverlay({reactions}: {reactions: StickerReactionItem[]})`, `ClassroomReactionPicker({visible, onClose, onSelect}: {visible: boolean; onClose: () => void; onSelect: (emoji: string) => void})`

- [ ] **Step 1: Write the failing test for the deterministic animation seed**

Create `apps/mobile/__tests__/stickerReactionAnim.test.ts`:

```ts
import {getReactionAnimProps} from '../src/lib/stickerReactionAnim';

describe('getReactionAnimProps', () => {
  it('is deterministic for the same id', () => {
    const a = getReactionAnimProps('reaction-1');
    const b = getReactionAnimProps('reaction-1');
    expect(a).toEqual(b);
  });

  it('produces different values for different ids', () => {
    const a = getReactionAnimProps('reaction-1');
    const b = getReactionAnimProps('reaction-2');
    expect(a).not.toEqual(b);
  });

  it('keeps leftPct within the visible horizontal band', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const {leftPct} = getReactionAnimProps(id);
      expect(leftPct).toBeGreaterThanOrEqual(4);
      expect(leftPct).toBeLessThanOrEqual(72);
    }
  });

  it('keeps duration within the expected float-up range', () => {
    const {durationMs} = getReactionAnimProps('x');
    expect(durationMs).toBeGreaterThanOrEqual(3200);
    expect(durationMs).toBeLessThanOrEqual(4000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && yarn jest __tests__/stickerReactionAnim.test.ts`
Expected: FAIL — module `../src/lib/stickerReactionAnim` not found

- [ ] **Step 3: Implement `stickerReactionAnim.ts`**

Direct port of the seeded-hash math from `apps/frontend/src/components/classroom/StickerReactionsOverlay.tsx` lines 21-50, converted to milliseconds and RN-friendly output shape:

```ts
export function getReactionAnimProps(id: string): {
  leftPct: number;
  swingX: number;
  durationMs: number;
  delayMs: number;
} {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  const r = (n: number) => ((Math.abs(hash * (n + 1) * 2654435761) >>> 0) % 1000) / 1000;

  const leftPct = 4 + r(1) * 68;
  const swingX = (r(2) - 0.5) * 60;
  const durationMs = (3.2 + r(4) * 0.8) * 1000;
  const delayMs = r(5) * 0.3 * 1000;

  return {leftPct, swingX, durationMs, delayMs};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && yarn jest __tests__/stickerReactionAnim.test.ts`
Expected: PASS

- [ ] **Step 5: Implement `StickerReactionsOverlay.tsx`**

```tsx
import React, {useEffect} from 'react';
import {Text, View, useWindowDimensions} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {getReactionAnimProps} from '../../lib/stickerReactionAnim';
import type {StickerReactionItem} from '../../types/classroom';

const NAME_COLORS = [
  '#1a73e8', '#0f9d58', '#f4511e', '#ab47bc',
  '#00acc1', '#fb8c00', '#e91e63', '#43a047',
];

function getNameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

function ReactionSticker({item, screenHeight}: {item: StickerReactionItem; screenHeight: number}) {
  const {leftPct, swingX, durationMs, delayMs} = getReactionAnimProps(item.id);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0.9);

  useEffect(() => {
    translateY.value = withDelay(delayMs, withTiming(-screenHeight * 0.95, {duration: durationMs}));
    translateX.value = withDelay(delayMs, withTiming(swingX, {duration: durationMs}));
    opacity.value = withDelay(delayMs, withTiming(0, {duration: durationMs}));
  }, [delayMs, durationMs, swingX, screenHeight, translateY, translateX, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}, {translateX: translateX.value}],
    opacity: opacity.value,
  }));

  const nameColor = item.isSelf ? '#1a73e8' : getNameColor(item.userName);
  const displayName = item.isSelf ? 'Siz' : item.userName;

  return (
    <Animated.View
      style={[
        {position: 'absolute', bottom: 80, left: `${leftPct}%`, alignItems: 'center', gap: 4},
        style,
      ]}
      pointerEvents="none">
      <Text style={{fontSize: 34}}>{item.emoji}</Text>
      <View style={{backgroundColor: nameColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2}}>
        <Text style={{color: 'white', fontSize: 11, fontWeight: '600'}}>{displayName}</Text>
      </View>
    </Animated.View>
  );
}

export function StickerReactionsOverlay({reactions}: {reactions: StickerReactionItem[]}) {
  const {height} = useWindowDimensions();
  if (reactions.length === 0) return null;
  return (
    <View style={{...(({position: 'absolute'} as const)), top: 0, left: 0, right: 0, bottom: 0}} pointerEvents="none">
      {reactions.map(r => (
        <ReactionSticker key={r.id} item={r} screenHeight={height} />
      ))}
    </View>
  );
}
```

- [ ] **Step 6: Implement `ClassroomReactionPicker.tsx`**

```tsx
import React from 'react';
import {Modal, Pressable, Text, View} from 'react-native';

const EMOJIS = ['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎'];

export function ClassroomReactionPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end'}}
        onPress={onClose}>
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            margin: 16,
            marginBottom: 100,
            backgroundColor: '#242428',
            borderRadius: 24,
            padding: 16,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'center',
          }}>
          {EMOJIS.map(emoji => (
            <Pressable
              key={emoji}
              onPress={() => {
                onSelect(emoji);
                onClose();
              }}
              style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12}}>
              <Text style={{fontSize: 28}}>{emoji}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 7: Run full new-test suite and typecheck**

Run: `cd apps/mobile && yarn jest __tests__/stickerReactionAnim.test.ts && yarn tsc --noEmit`
Expected: tests PASS; no new typecheck errors from these three files

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/lib/stickerReactionAnim.ts apps/mobile/src/components/classroom/StickerReactionsOverlay.tsx apps/mobile/src/components/classroom/ClassroomReactionPicker.tsx apps/mobile/__tests__/stickerReactionAnim.test.ts
git commit -m "feat(mobile): add sticker reactions overlay and picker"
```

---

## Task 6: `RaisedHandsControl` (read-only)

**Files:**
- Create: `apps/mobile/src/components/classroom/RaisedHandsControl.tsx`

**Interfaces:**
- Consumes: `RaisedHandItem` from `types/classroom.ts`
- Produces: `RaisedHandsControl({raisedHands}: {raisedHands: RaisedHandItem[]})` — pure presentational, read-only (no lower-hand actions, matching web's `readOnly` mode since lowering hands is host-only).

- [ ] **Step 1: Implement `RaisedHandsControl.tsx`**

```tsx
import React, {useState} from 'react';
import {Modal, Pressable, Text, View} from 'react-native';
import {Hand, X} from 'lucide-react-native';
import type {RaisedHandItem} from '../../types/classroom';

const AVATAR_COLORS = ['#e67700', '#087f5b', '#1971c2', '#5f3dc4', '#c2255c', '#2f9e44', '#1864ab', '#862e9c'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function RaisedHandsControl({raisedHands}: {raisedHands: RaisedHandItem[]}) {
  const [open, setOpen] = useState(false);

  if (raisedHands.length === 0) return null;

  const first = raisedHands[0];
  const countMore = raisedHands.length - 1;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: '#a8f0b0',
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}>
        <View style={{backgroundColor: '#0a3818', borderRadius: 999, padding: 4}}>
          <Hand size={13} color="#a8f0b0" />
        </View>
        <Text numberOfLines={1} style={{color: '#00210b', fontSize: 11, fontWeight: '700', maxWidth: 100}}>
          {countMore > 0 ? `${first.userName} +${countMore}` : first.userName}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)'}}>
          <View style={{maxHeight: '60%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 20}}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12}}>
              <Text style={{fontSize: 16, fontWeight: '700'}}>Qo'l ko'targanlar</Text>
              <Pressable
                onPress={() => setOpen(false)}
                style={{height: 32, width: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9'}}>
                <X size={16} color="#64748b" />
              </Pressable>
            </View>
            {raisedHands.map(item => (
              <View key={item.userId} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8}}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: getAvatarColor(item.userName),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{color: 'white', fontSize: 13, fontWeight: '700'}}>
                    {item.userName.charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
                <Text style={{flex: 1, fontSize: 14, fontWeight: '600'}}>{item.userName}</Text>
                <Hand size={16} color="#10b981" />
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors from this file

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/classroom/RaisedHandsControl.tsx
git commit -m "feat(mobile): add read-only RaisedHandsControl"
```

---

## Task 7: `ClassroomCallBar` (consolidated bottom bar)

**Files:**
- Create: `apps/mobile/src/components/classroom/ClassroomCallBar.tsx`

**Interfaces:**
- Consumes: `ClassroomMicControl`-equivalent inline mic pill, `ClassroomReactionPicker` (Task 5), `RaisedHandsControl` (Task 6)
- Produces: `ClassroomCallBar({micEnabled, voiceAvailable, onToggleMic, onSendReaction, handRaised, onToggleHandRaise, raisedHands, onOpenRoster, participantCount}: Props)`

- [ ] **Step 1: Implement `ClassroomCallBar.tsx`**

```tsx
import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {Hand, Mic, MicOff, SmilePlus, Users} from 'lucide-react-native';
import {ClassroomReactionPicker} from './ClassroomReactionPicker';
import {RaisedHandsControl} from './RaisedHandsControl';
import type {RaisedHandItem} from '../../types/classroom';

export function ClassroomCallBar({
  micEnabled,
  voiceAvailable,
  onToggleMic,
  onSendReaction,
  handRaised,
  onToggleHandRaise,
  raisedHands,
  onOpenRoster,
  participantCount,
}: {
  micEnabled: boolean;
  voiceAvailable: boolean;
  onToggleMic: () => void;
  onSendReaction: (emoji: string) => void;
  handRaised: boolean;
  onToggleHandRaise: () => void;
  raisedHands: RaisedHandItem[];
  onOpenRoster: () => void;
  participantCount: number;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
      }}>
      <Pressable
        onPress={onToggleMic}
        disabled={!voiceAvailable}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 24,
          opacity: voiceAvailable ? 1 : 0.4,
          backgroundColor: micEnabled ? '#111827' : '#fee2e2',
        }}>
        {micEnabled ? <Mic size={18} color="white" /> : <MicOff size={18} color="#ef4444" />}
      </Pressable>

      <Pressable
        onPress={() => setPickerOpen(true)}
        style={{width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b'}}>
        <SmilePlus size={18} color="white" />
      </Pressable>

      <Pressable
        onPress={onToggleHandRaise}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: handRaised ? '#a8f0b0' : '#1e293b',
        }}>
        <Hand size={18} color={handRaised ? '#00210b' : 'white'} />
      </Pressable>

      <RaisedHandsControl raisedHands={raisedHands} />

      <Pressable
        onPress={onOpenRoster}
        style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 22, backgroundColor: '#1e293b'}}>
        <Users size={16} color="white" />
        <Text style={{color: 'white', fontSize: 12, fontWeight: '600'}}>{participantCount}</Text>
      </Pressable>

      <ClassroomReactionPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onSendReaction}
      />
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors from this file (it composes Tasks 5 and 6's already-verified components)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/classroom/ClassroomCallBar.tsx
git commit -m "feat(mobile): add consolidated ClassroomCallBar"
```

---

## Task 8: Guest join form

**Files:**
- Create: `apps/mobile/src/components/classroom/ClassroomGuestJoinForm.tsx`

**Interfaces:**
- Consumes: none
- Produces: `ClassroomGuestJoinForm({onSubmit}: {onSubmit: (name: string) => void})`

- [ ] **Step 1: Implement `ClassroomGuestJoinForm.tsx`**

```tsx
import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View} from 'react-native';

export function ClassroomGuestJoinForm({onSubmit}: {onSubmit: (name: string) => void}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const displayName = trimmed || 'Mehmon';

  return (
    <KeyboardAvoidingView
      style={{flex: 1, backgroundColor: '#1a1a1e', alignItems: 'center', justifyContent: 'center', padding: 16}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{width: '100%', maxWidth: 360, borderRadius: 24, backgroundColor: '#242428', overflow: 'hidden'}}>
        <View style={{alignItems: 'center', gap: 16, paddingHorizontal: 32, paddingTop: 40, paddingBottom: 24}}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: 'rgba(79,195,247,0.2)',
              borderWidth: 2,
              borderColor: 'rgba(79,195,247,0.3)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View style={{width: 32, height: 32, borderRadius: 16, backgroundColor: '#4fc3f7', opacity: 0.85}} />
          </View>
          <View style={{alignItems: 'center'}}>
            <Text style={{fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 2}}>
              Uchrashuvdagi ismingiz
            </Text>
            <Text style={{fontSize: 22, fontWeight: '700', color: 'white'}}>{displayName}</Text>
          </View>
        </View>

        <View style={{height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 24}} />

        <View style={{paddingHorizontal: 24, paddingVertical: 20, gap: 8}}>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder="Ismingizni kiriting..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            maxLength={60}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              backgroundColor: 'rgba(255,255,255,0.08)',
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 14,
              color: 'white',
            }}
          />
          <Pressable
            disabled={!trimmed}
            onPress={() => onSubmit(trimmed)}
            style={{
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              backgroundColor: '#34a853',
              opacity: trimmed ? 1 : 0.4,
            }}>
            <Text style={{color: 'white', fontSize: 14, fontWeight: '700'}}>Qo'shilish</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors from this file

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/classroom/ClassroomGuestJoinForm.tsx
git commit -m "feat(mobile): add guest pre-join name entry form"
```

---

## Task 9: Wire `ClassroomScreen` — isBoardOpen branch, guest gate, new call bar

**Files:**
- Modify: `apps/mobile/src/screens/ClassroomScreen.tsx`

**Interfaces:**
- Consumes: `useClassroomSession(sessionId, guestName?, userName?)` (Task 2), `useClassroomVoice(sessionId, guestName?)` (Task 3), `ClassroomParticipantsGrid`/`ClassroomTopParticipantBar` (Task 4), `ClassroomCallBar` (Task 7), `ClassroomGuestJoinForm` (Task 8), `isGuestEligible` (Task 2)
- Produces: updated `ClassroomScreen` behavior — no new exports (screen component)

- [ ] **Step 1: Rewrite `ClassroomScreen.tsx`**

```tsx
import React, {useMemo, useState} from 'react';
import {Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/types';
import {isGuestEligible, useClassroomSession} from '../hooks/useClassroomSession';
import {useClassroomVoice} from '../hooks/useClassroomVoice';
import {ClassroomBoard} from '../components/classroom/ClassroomBoard';
import {ClassroomRoster} from '../components/classroom/ClassroomRoster';
import {ClassroomParticipantsGrid} from '../components/classroom/ClassroomParticipantsGrid';
import {ClassroomTopParticipantBar} from '../components/classroom/ClassroomTopParticipantBar';
import {ClassroomCallBar} from '../components/classroom/ClassroomCallBar';
import {ClassroomGuestJoinForm} from '../components/classroom/ClassroomGuestJoinForm';
import {StickerReactionsOverlay} from '../components/classroom/StickerReactionsOverlay';
import {Loading, Screen} from '../components/Ui';
import {useAuthStore} from '../store/authStore';

const ERROR_MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND: 'Dars topilmadi',
  NOT_ENROLLED: 'Siz bu kursga yozilmagansiz',
  UNAUTHORIZED: "Kirish huquqingiz yo'q",
  GUEST_NAME_REQUIRED: 'Ism kiritish talab qilinadi',
};

type Props = NativeStackScreenProps<RootStackParamList, 'Classroom'>;

export function ClassroomScreen({route}: Props) {
  const {sessionId} = route.params;
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [guestName, setGuestName] = useState<string | null>(null);

  const needsGuestForm = !token && guestName === null;

  const {state, sendReaction, toggleHandRaise} = useClassroomSession(
    needsGuestForm ? undefined : sessionId,
    guestName ?? undefined,
    user?.name,
  );
  const voiceEligible = isGuestEligible(Boolean(token), guestName);
  const voiceSessionId = state.joined && !state.ended && voiceEligible ? sessionId : undefined;
  const voice = useClassroomVoice(voiceSessionId, token ? undefined : guestName ?? undefined);
  const [rosterOpen, setRosterOpen] = useState(false);

  const myUserId = user?.id ?? (guestName ? `guest:${guestName}` : null);
  const myUserName = user?.name ?? guestName ?? "O'quvchi";
  const isHandRaised = state.raisedHands.some(h => h.userId === myUserId || h.userName === myUserName);

  const errorMessage = useMemo(
    () => (state.error ? ERROR_MESSAGES[state.error] ?? 'Xatolik yuz berdi' : null),
    [state.error],
  );

  if (needsGuestForm) {
    return <ClassroomGuestJoinForm onSubmit={setGuestName} />;
  }

  if (state.error) {
    return (
      <Screen>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}}>
          <Text style={{fontSize: 16, fontWeight: '700', textAlign: 'center'}}>{errorMessage}</Text>
        </View>
      </Screen>
    );
  }

  if (state.ended) {
    return (
      <Screen>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}}>
          <Text style={{fontSize: 18, fontWeight: '800', textAlign: 'center'}}>Dars yakunlandi</Text>
          <Text style={{marginTop: 8, fontSize: 13, color: '#94a3b8', textAlign: 'center'}}>
            Ishtirokingiz uchun rahmat!
          </Text>
        </View>
      </Screen>
    );
  }

  if (!state.joined) {
    return <Loading />;
  }

  return (
    <View style={{flex: 1, backgroundColor: '#0f172a'}}>
      {!state.hostOnline && (
        <View style={{backgroundColor: '#fef3c7', paddingVertical: 6, paddingHorizontal: 12}}>
          <Text style={{fontSize: 11, color: '#92400e', textAlign: 'center'}}>Ustoz bilan aloqa uzildi</Text>
        </View>
      )}

      {voice.needsAudioUnlock && (
        <View style={{backgroundColor: '#4f46e5', paddingVertical: 6, paddingHorizontal: 12}}>
          <Text onPress={voice.unlockAudio} style={{fontSize: 11, color: 'white', textAlign: 'center', fontWeight: '700'}}>
            Ovozni yoqish uchun bosing
          </Text>
        </View>
      )}

      {!state.isBoardOpen ? (
        <ClassroomParticipantsGrid
          participants={state.participants}
          speakingUserIds={voice.activeSpeakerIds}
          myUserId={myUserId}
          myUserName={myUserName}
          hostOnline={state.hostOnline}
          hostName={state.hostName}
        />
      ) : (
        <>
          <ClassroomTopParticipantBar
            participants={state.participants}
            speakingUserIds={voice.activeSpeakerIds}
            myUserId={myUserId}
            myUserName={myUserName}
            hostOnline={state.hostOnline}
            hostName={state.hostName}
          />
          <ClassroomBoard state={state} />
        </>
      )}

      <StickerReactionsOverlay reactions={state.reactions} />

      <ClassroomCallBar
        micEnabled={voice.micEnabled}
        voiceAvailable={voice.voiceAvailable}
        onToggleMic={() => void voice.toggleMic()}
        onSendReaction={sendReaction}
        handRaised={isHandRaised}
        onToggleHandRaise={toggleHandRaise}
        raisedHands={state.raisedHands}
        onOpenRoster={() => setRosterOpen(true)}
        participantCount={state.participants.length}
      />

      <ClassroomRoster
        visible={rosterOpen}
        onClose={() => setRosterOpen(false)}
        participants={state.participants}
        activeSpeakerIds={voice.activeSpeakerIds}
      />
    </View>
  );
}
```

Note: `needsGuestForm` gates the `sessionId` passed into `useClassroomSession` to `undefined` (rather than skipping the hook call entirely) — this matches the existing hook's own `if (!sessionId) return;` early-out inside its `useEffect`, so no join attempt happens until a guest name is submitted (mirrors web's behavior of not connecting until the pre-join form is dismissed). `user?.id`/`user?.name` assume `User` (from `types/api.ts`) has `id`/`name` fields — verify this matches the existing `User` type before implementing; the pre-existing `ClassroomScreen.tsx` already read `user` from the same `useAuthStore` without incident, so the shape is already known-compatible.

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no errors from `ClassroomScreen.tsx` or any of its now-fully-wired dependencies (Tasks 1-8 should all typecheck cleanly together at this point)

- [ ] **Step 3: Manual verification (per this codebase's established practice — no component tests for these screens)**

Run: `cd apps/mobile && yarn ios` (or `yarn android`), navigate to an active live class session as a logged-in student, and confirm:
- The board renders as before when `isBoardOpen` is true (no regression).
- The call bar shows mic/reaction/hand/roster controls.
- Tapping the reaction button opens the emoji picker and sending one shows a floating sticker.
- Tapping the hand-raise button toggles the green pill and updates the list.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/ClassroomScreen.tsx
git commit -m "feat(mobile): wire isBoardOpen grid, guest join, and consolidated call bar into ClassroomScreen"
```

---

## Task 10: `computeReplayOverlayAt` — pure zoom/scroll/pointer replay derivation

**Files:**
- Create: `apps/mobile/src/lib/classroomReplay.ts`
- Test: `apps/mobile/__tests__/classroomReplay.test.ts`

**Interfaces:**
- Consumes: `ClassReplayEvent` from `types/classroom.ts`
- Produces: `computeReplayOverlayAt(events: ClassReplayEvent[], timeMs: number): {zoom: number; rightZoom: number; scroll: CsScrollPosition | null; rightScroll: CsScrollPosition | null; pointer: CsPointer | null}`

This is the "lightweight" replay path described in the spec (§7): strokes are always the static `boardSnapshot` (final state, never replayed), but for `recordingMode === 'boardAudio'`, the teacher's zoom/scroll/pointer motion during the lesson is replayed against the audio's timeline. This function scopes `computeStateAt`'s web logic down to only those three event types.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/__tests__/classroomReplay.test.ts`:

```ts
import {computeReplayOverlayAt} from '../src/lib/classroomReplay';
import type {ClassReplayEvent} from '../src/types/classroom';

const events: ClassReplayEvent[] = [
  {type: 'zoom:set', payload: {zoom: 1.5}, atMs: 1000},
  {type: 'zoom:set', payload: {zoom: 2, pane: 'right'}, atMs: 2000},
  {type: 'scroll:set', payload: {page: 2, yRatio: 0.4}, atMs: 3000},
  {type: 'pointer:move', payload: {page: 2, x: 0.3, y: 0.6, active: true}, atMs: 4000},
  {type: 'pointer:move', payload: {page: 2, x: 0.3, y: 0.6, active: false}, atMs: 4500},
  {type: 'stroke:add', payload: {page: 1, stroke: {id: 'x'}}, atMs: 5000},
];

describe('computeReplayOverlayAt', () => {
  it('returns defaults before any event', () => {
    const result = computeReplayOverlayAt(events, 0);
    expect(result).toEqual({zoom: 1, rightZoom: 1, scroll: null, rightScroll: null, pointer: null});
  });

  it('applies zoom:set for the left pane by default', () => {
    const result = computeReplayOverlayAt(events, 1000);
    expect(result.zoom).toBe(1.5);
    expect(result.rightZoom).toBe(1);
  });

  it('applies zoom:set for the right pane when specified', () => {
    const result = computeReplayOverlayAt(events, 2000);
    expect(result.rightZoom).toBe(2);
  });

  it('applies the latest scroll:set at or before the given time', () => {
    const result = computeReplayOverlayAt(events, 3500);
    expect(result.scroll).toEqual({page: 2, yRatio: 0.4});
  });

  it('reflects an active pointer as non-null and an inactive one as null', () => {
    expect(computeReplayOverlayAt(events, 4000).pointer).toEqual({page: 2, x: 0.3, y: 0.6, active: true});
    expect(computeReplayOverlayAt(events, 4500).pointer).toBeNull();
  });

  it('ignores non-overlay event types like stroke:add', () => {
    const result = computeReplayOverlayAt(events, 5000);
    expect(result.zoom).toBe(1.5);
    expect(result.rightZoom).toBe(2);
  });

  it('ignores events after the given time', () => {
    const result = computeReplayOverlayAt(events, 500);
    expect(result.zoom).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && yarn jest __tests__/classroomReplay.test.ts`
Expected: FAIL — module `../src/lib/classroomReplay` not found

- [ ] **Step 3: Implement `classroomReplay.ts`**

```ts
import type {ClassReplayEvent, CsPointer, CsScrollPosition} from '../types/classroom';

export interface ReplayOverlayState {
  zoom: number;
  rightZoom: number;
  scroll: CsScrollPosition | null;
  rightScroll: CsScrollPosition | null;
  pointer: CsPointer | null;
}

const INITIAL: ReplayOverlayState = {zoom: 1, rightZoom: 1, scroll: null, rightScroll: null, pointer: null};

export function computeReplayOverlayAt(events: ClassReplayEvent[], timeMs: number): ReplayOverlayState {
  const sorted = [...events].sort((a, b) => a.atMs - b.atMs);
  let state = INITIAL;

  for (const event of sorted) {
    if (event.atMs > timeMs) break;

    if (event.type === 'zoom:set') {
      const p = event.payload as {zoom: number; pane?: 'left' | 'right'};
      state = p.pane === 'right' ? {...state, rightZoom: p.zoom} : {...state, zoom: p.zoom};
      continue;
    }

    if (event.type === 'scroll:set') {
      const p = event.payload as CsScrollPosition & {pane?: 'left' | 'right'};
      state = p.pane === 'right' ? {...state, rightScroll: p} : {...state, scroll: p};
      continue;
    }

    if (event.type === 'pointer:move') {
      const p = event.payload as CsPointer;
      state = {...state, pointer: p.active ? p : null};
      continue;
    }
  }

  return state;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && yarn jest __tests__/classroomReplay.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/classroomReplay.ts apps/mobile/__tests__/classroomReplay.test.ts
git commit -m "feat(mobile): add computeReplayOverlayAt for board-only replay's zoom/scroll/pointer timeline"
```

---

## Task 11: `apiClassReplay` return-type parity + `ClassroomSubtitleOverlay`

**Files:**
- Modify: `apps/mobile/src/api/classroom.ts`
- Create: `apps/mobile/src/components/classroom/ClassroomSubtitleOverlay.tsx`

**Interfaces:**
- Consumes: `ClassReplayData`, `ClassSubtitleCue` from Task 1
- Produces: `apiClassReplay(sessionId: string): Promise<ClassReplayData>` (already exists — this task only confirms/keeps the call, since the type it returns was extended in Task 1), `ClassroomSubtitleOverlay({currentTimeMs, subtitles}: {currentTimeMs: number; subtitles: ClassSubtitleCue[]})`

- [ ] **Step 1: Confirm `apiClassReplay` needs no code change**

`apps/mobile/src/api/classroom.ts`'s existing `apiClassReplay` (lines 9-12) already returns `Promise<ClassReplayData>` by declared type — since Task 1 extended `ClassReplayData` itself (not this function), no edit is needed here. Skip to Step 2. (This step exists to document why there's no diff for this file in this task, preventing a future contributor from assuming it was missed.)

- [ ] **Step 2: Implement `ClassroomSubtitleOverlay.tsx`**

```tsx
import React, {useMemo} from 'react';
import {Text, View} from 'react-native';
import type {ClassSubtitleCue} from '../../types/classroom';

export function ClassroomSubtitleOverlay({
  currentTimeMs,
  subtitles,
}: {
  currentTimeMs: number;
  subtitles: ClassSubtitleCue[];
}) {
  const activeCue = useMemo(
    () => subtitles.find(c => currentTimeMs >= c.startMs && currentTimeMs <= c.endMs) ?? null,
    [subtitles, currentTimeMs],
  );

  if (!activeCue) return null;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 92,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingHorizontal: 16,
      }}
      pointerEvents="none">
      <View style={{backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6}}>
        <Text style={{color: 'white', fontSize: 15, fontWeight: '600', textAlign: 'center'}}>{activeCue.text}</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/classroom/ClassroomSubtitleOverlay.tsx
git commit -m "feat(mobile): add ClassroomSubtitleOverlay for replay"
```

---

## Task 12: `ClassroomReplayTransportBar` and `ClassroomAttendanceSheet`

**Files:**
- Create: `apps/mobile/src/components/classroom/ClassroomReplayTransportBar.tsx`
- Create: `apps/mobile/src/components/classroom/ClassroomAttendanceSheet.tsx`

**Interfaces:**
- Consumes: none new
- Produces: `ClassroomReplayTransportBar({isPlaying, currentTimeMs, durationMs, onPlayPause, onSeek, recordingStatus}: Props)`, `ClassroomAttendanceSheet({visible, onClose, attendance}: Props)`

- [ ] **Step 1: Implement `ClassroomReplayTransportBar.tsx`**

Uses `@react-native-community/slider` if already present, otherwise a simple `Pressable`-based scrub track — check first:

Run: `cd apps/mobile && grep -r "@react-native-community/slider" package.json`

If present, use `Slider`; if not present, implement the scrubber as a `View`-based progress track with a `PanResponder` (no new dependency). Given this codebase avoids adding dependencies unless necessary, implement without the slider package using `react-native-gesture-handler`'s `Gesture.Pan()` (already installed) driving a `width` percentage:

```tsx
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {runOnJS, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {Pause, Play} from 'lucide-react-native';

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function ClassroomReplayTransportBar({
  isPlaying,
  currentTimeMs,
  durationMs,
  onPlayPause,
  onSeek,
  recordingStatus,
}: {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  onPlayPause: () => void;
  onSeek: (ms: number) => void;
  recordingStatus: 'none' | 'pending' | 'ready' | 'failed';
}) {
  const trackWidth = useSharedValue(0);

  const seekFromX = (x: number) => {
    if (trackWidth.value <= 0 || durationMs <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / trackWidth.value));
    onSeek(ratio * durationMs);
  };

  const tap = Gesture.Tap().onEnd(e => {
    runOnJS(seekFromX)(e.x);
  });

  const progressStyle = useAnimatedStyle(() => ({
    width: durationMs > 0 ? `${Math.min(100, (currentTimeMs / durationMs) * 100)}%` : '0%',
  }));

  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 16,
        backgroundColor: 'black',
        borderRadius: 24,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}>
      <Pressable
        onPress={onPlayPause}
        style={{width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'}}>
        {isPlaying ? <Pause size={16} color="white" /> : <Play size={16} color="white" />}
      </Pressable>
      <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 11, width: 36}}>{formatMs(currentTimeMs)}</Text>
      <GestureDetector gesture={tap}>
        <View
          onLayout={e => {
            trackWidth.value = e.nativeEvent.layout.width;
          }}
          style={{flex: 1, height: 24, justifyContent: 'center'}}>
          <View style={{height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden'}}>
            <Animated.View style={[{height: 4, backgroundColor: 'white'}, progressStyle]} />
          </View>
        </View>
      </GestureDetector>
      <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 11, width: 36}}>{formatMs(durationMs)}</Text>
      {recordingStatus === 'pending' && (
        <Text style={{color: '#94a3b8', fontSize: 10}}>Tayyor emas</Text>
      )}
      {recordingStatus === 'failed' && (
        <Text style={{color: '#94a3b8', fontSize: 10}}>Mavjud emas</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Implement `ClassroomAttendanceSheet.tsx`**

```tsx
import React from 'react';
import {FlatList, Modal, Pressable, Text, View} from 'react-native';
import {X} from 'lucide-react-native';

interface AttendanceEntry {
  userId: string;
  name: string;
  status: 'absent' | 'present' | 'late';
}

const STATUS_LABELS: Record<AttendanceEntry['status'], string> = {
  present: 'Keldi',
  late: 'Kech qoldi',
  absent: 'Kelmadi',
};

const STATUS_COLORS: Record<AttendanceEntry['status'], string> = {
  present: '#16a34a',
  late: '#d97706',
  absent: '#94a3b8',
};

export function ClassroomAttendanceSheet({
  visible,
  onClose,
  attendance,
}: {
  visible: boolean;
  onClose: () => void;
  attendance: AttendanceEntry[];
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)'}}>
        <View style={{maxHeight: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 20}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
            <Text style={{fontSize: 18, fontWeight: '700'}}>Davomat</Text>
            <Pressable
              onPress={onClose}
              style={{height: 32, width: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9'}}>
              <X size={16} color="#64748b" />
            </Pressable>
          </View>
          {attendance.length === 0 ? (
            <Text style={{textAlign: 'center', color: '#94a3b8', paddingVertical: 24}}>Hech kim qo'shilmagan</Text>
          ) : (
            <FlatList
              data={attendance}
              keyExtractor={item => item.userId}
              renderItem={({item}) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#f8fafc',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 6,
                  }}>
                  <Text style={{fontSize: 14, color: '#334155'}}>{item.name}</Text>
                  <Text style={{fontSize: 12, fontWeight: '600', color: STATUS_COLORS[item.status]}}>
                    {STATUS_LABELS[item.status]}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/classroom/ClassroomReplayTransportBar.tsx apps/mobile/src/components/classroom/ClassroomAttendanceSheet.tsx
git commit -m "feat(mobile): add replay transport bar and attendance sheet"
```

---

## Task 13: `ClassroomReplayScreen` and navigation wiring

**Files:**
- Create: `apps/mobile/src/screens/ClassroomReplayScreen.tsx`
- Modify: `apps/mobile/src/navigation/types.ts`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`
- Modify: `apps/mobile/src/screens/CourseScreen.tsx`

**Interfaces:**
- Consumes: `apiClassReplay` (existing, Task 11's type extension), `computeReplayOverlayAt` (Task 10), `ClassroomBoard` (existing), `ClassroomSubtitleOverlay` (Task 11), `ClassroomReplayTransportBar`/`ClassroomAttendanceSheet` (Task 12)
- Produces: `ClassroomReplayScreen` registered as route `ClassroomReplay: {sessionId: string}`

- [ ] **Step 1: Add the route param type**

In `apps/mobile/src/navigation/types.ts`, add after the existing `Classroom: { sessionId: string };` line:

```ts
  ClassroomReplay: { sessionId: string };
```

- [ ] **Step 2: Register the screen in the navigator**

In `apps/mobile/src/navigation/RootNavigator.tsx`, add the import near the existing `ClassroomScreen` import:

```ts
import { ClassroomReplayScreen } from '../screens/ClassroomReplayScreen';
```

Add the route registration right after the existing `Classroom` `Stack.Screen` block (currently lines 208-212):

```tsx
          <Stack.Screen
            name="ClassroomReplay"
            component={ClassroomReplayScreen}
            options={{ title: 'Dars yozuvi', headerShown: false }}
          />
```

- [ ] **Step 3: Implement `ClassroomReplayScreen.tsx`**

```tsx
import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import Video from 'react-native-video';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Users, X} from 'lucide-react-native';
import type {RootStackParamList} from '../navigation/types';
import {apiClassReplay} from '../api/classroom';
import {computeReplayOverlayAt} from '../lib/classroomReplay';
import {ClassroomBoard} from '../components/classroom/ClassroomBoard';
import {ClassroomSubtitleOverlay} from '../components/classroom/ClassroomSubtitleOverlay';
import {ClassroomReplayTransportBar} from '../components/classroom/ClassroomReplayTransportBar';
import {ClassroomAttendanceSheet} from '../components/classroom/ClassroomAttendanceSheet';
import {Screen} from '../components/Ui';
import type {ClassReplayData, ClassroomState} from '../types/classroom';

type Props = NativeStackScreenProps<RootStackParamList, 'ClassroomReplay'>;

function replayStateFromSnapshot(data: ClassReplayData, overlay: ReturnType<typeof computeReplayOverlayAt>): ClassroomState {
  const snap = data.boardSnapshot;
  return {
    joined: true,
    error: null,
    ended: true,
    pdfName: snap?.pdfName ?? data.pdfName,
    pages: snap?.pages ?? data.pdfPages,
    currentPage: 1,
    strokesByPage: snap?.strokesByPage ?? {},
    rightStrokesByPage: snap?.rightStrokesByPage ?? {},
    participants: [],
    hostOnline: false,
    hostName: null,
    pointer: overlay.pointer,
    zoom: overlay.zoom,
    rightZoom: overlay.rightZoom,
    scroll: overlay.scroll,
    rightScroll: overlay.rightScroll,
    isFree: false,
    boardMode: snap?.boardMode ?? 'pdf',
    boardLayout: snap?.boardLayout ?? 'single',
    leftBoardMode: snap?.leftBoardMode ?? snap?.boardMode ?? 'pdf',
    rightBoardMode: snap?.rightBoardMode ?? snap?.boardMode ?? 'pdf',
    isBoardOpen: true,
    classroomTheme: 'light',
    notebookStyle: snap?.notebookStyle ?? 'grid',
    reactions: [],
    userReactions: {},
    raisedHands: [],
  };
}

export function ClassroomReplayScreen({route, navigation}: Props) {
  const {sessionId} = route.params;
  const [data, setData] = useState<ClassReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const videoRef = useRef<React.ElementRef<typeof Video>>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      apiClassReplay(sessionId)
        .then(next => {
          if (cancelled) return;
          setData(next);
          if (next.recordingUrl && (next.subtitles?.length ?? 0) === 0) {
            timer = setTimeout(load, 5000);
          }
        })
        .catch(() => {
          if (!cancelled) setError("Dars topilmadi yoki kirish huquqi yo'q");
        });
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  const recordingOffsetMs = data?.recordingStartedAtMs ?? 0;
  const isBoardAudio = data?.recordingMode === 'boardAudio';
  const hasRecording =
    data?.recordingStatus === 'ready' && !!data?.recordingUrl && data?.recordingMode !== 'boardSilent';

  const overlay = isBoardAudio
    ? computeReplayOverlayAt(data?.historyEvents ?? [], Math.max(0, currentTimeMs - recordingOffsetMs))
    : {zoom: 1, rightZoom: 1, scroll: null, rightScroll: null, pointer: null};

  if (error) {
    return (
      <Screen>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}}>
          <Text style={{fontSize: 14, color: '#64748b', textAlign: 'center'}}>{error}</Text>
        </View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  const viewState = replayStateFromSnapshot(data, overlay);

  return (
    <View style={{flex: 1, backgroundColor: '#0f172a'}}>
      <View style={{position: 'absolute', top: 12, right: 12, zIndex: 30, flexDirection: 'row', gap: 8}}>
        <Pressable
          onPress={() => setAttendanceOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}>
          <Users size={14} color="#475569" />
          <Text style={{fontSize: 11, fontWeight: '600', color: '#475569'}}>Davomat</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.goBack()}
          style={{
            width: 29,
            height: 29,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.95)',
          }}>
          <X size={15} color="#475569" />
        </Pressable>
      </View>

      <ClassroomBoard state={viewState} />

      {hasRecording && data.recordingUrl && (
        <Video
          ref={videoRef}
          source={{uri: data.recordingUrl}}
          audioOnly
          paused={!isPlaying}
          onLoad={meta => setDurationMs(recordingOffsetMs + meta.duration * 1000)}
          onProgress={progress => setCurrentTimeMs(recordingOffsetMs + progress.currentTime * 1000)}
          onEnd={() => setIsPlaying(false)}
          style={{width: 0, height: 0}}
        />
      )}

      <ClassroomSubtitleOverlay
        currentTimeMs={currentTimeMs}
        subtitles={data.subtitles ?? data.boardSnapshot?.subtitles ?? []}
      />

      {hasRecording && (
        <ClassroomReplayTransportBar
          isPlaying={isPlaying}
          currentTimeMs={currentTimeMs}
          durationMs={durationMs}
          recordingStatus={data.recordingStatus}
          onPlayPause={() => setIsPlaying(v => !v)}
          onSeek={ms => {
            const audioMs = Math.max(0, ms - recordingOffsetMs);
            videoRef.current?.seek(audioMs / 1000);
            setCurrentTimeMs(ms);
          }}
        />
      )}

      <ClassroomAttendanceSheet
        visible={attendanceOpen}
        onClose={() => setAttendanceOpen(false)}
        attendance={data.attendance.map(a => ({userId: a.userId, name: a.name, status: a.status}))}
      />
    </View>
  );
}
```

Note: `react-native-video`'s `audioOnly` prop and `seek()` ref method are already relied upon elsewhere in this codebase's video handling conventions (`HlsVideoPlayer.tsx` uses the same `Video` component for on-screen playback) — confirm the exact prop/ref API against the installed `react-native-video` version by reading `apps/mobile/src/components/HlsVideoPlayer.tsx` before finalizing this file if the props above don't match (e.g., some versions expose `onProgress`'s `currentTime` in seconds vs ms — the code above assumes seconds, matching the library's documented default).

- [ ] **Step 4: Wire `CourseScreen.tsx`'s `openLiveClassReplay` to the native screen**

In `apps/mobile/src/screens/CourseScreen.tsx`, find the existing `openLiveClassReplay` function (around line 172):

```ts
  function openLiveClassReplay(classSessionId: string) {
    // Native replay (with board) is out of scope for now - the web app's
    // replay view already handles it, so route there via WebView instead
    // of shipping a native ClassroomReplayScreen in this pass.
    navigation.navigate('Web', {
      path: `/classroom-history/${classSessionId}/replay`,
      title: 'Dars yozuvi',
      onlineRequired: true,
    });
  }
```

Replace with:

```ts
  function openLiveClassReplay(classSessionId: string) {
    navigation.navigate('ClassroomReplay', {sessionId: classSessionId});
  }
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: no new errors. If `react-native-video`'s TypeScript types don't include `audioOnly` or differ on the `onLoad`/`onProgress` payload shape, adjust the prop names to match the installed version's actual `.d.ts` (check `node_modules/react-native-video/types/index.d.ts` or the version already used by `HlsVideoPlayer.tsx` for the exact prop names it already relies on).

- [ ] **Step 6: Manual verification**

Run: `cd apps/mobile && yarn ios` (or `yarn android`), navigate to a lesson containing a `live_class` content block whose session has ended and has a `boardAudio` or `boardSilent` recording, tap it, and confirm:
- The native replay screen opens (no WebView/browser chrome visible).
- The board renders the final static snapshot.
- If `boardAudio`: play/pause/scrub controls work and the board's pointer/zoom/scroll shift as the audio plays.
- The attendance sheet opens and lists participants with status.
- The X button navigates back to the course screen.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/ClassroomReplayScreen.tsx apps/mobile/src/navigation/types.ts apps/mobile/src/navigation/RootNavigator.tsx apps/mobile/src/screens/CourseScreen.tsx
git commit -m "feat(mobile): add native ClassroomReplayScreen, replacing the WebView replay fallback"
```

---

## Task 14: Full regression pass

**Files:** none new — verification only

- [ ] **Step 1: Run the full Jest suite**

Run: `cd apps/mobile && yarn test`
Expected: all tests PASS, including every test file created in Tasks 1, 2, 5, 10, plus the pre-existing `classroomReducers.test.ts` and the rest of the suite unaffected by this work.

- [ ] **Step 2: Full typecheck**

Run: `cd apps/mobile && yarn tsc --noEmit`
Expected: zero errors across the whole `apps/mobile` project.

- [ ] **Step 3: Lint**

Run: `cd apps/mobile && yarn lint` (if a lint script exists — check `package.json`; skip this step if it doesn't)
Expected: no new lint errors in any file touched by this plan.

- [ ] **Step 4: Manual end-to-end pass on both entry points**

Using a real or staging backend session:
1. Join an active live class as an authenticated student — confirm mic, reactions, hand-raise, roster, and the `isBoardOpen` grid-vs-board toggle all behave correctly (toggle by having a teacher on web close/open the board mid-session).
2. Join a free/guest session without logging in — confirm the guest name form appears, submission joins the session, and guest voice connects.
3. Open a finished lesson's live-class replay block — confirm it opens the native `ClassroomReplayScreen`, not a WebView, and audio/board/subtitles/attendance all work as designed.

- [ ] **Step 5: Final commit (if any fixes were needed during regression pass)**

```bash
git add -A
git commit -m "fix(mobile): address regression-pass findings for classroom parity work"
```

(Skip this step entirely if no fixes were needed.)

---

## Self-Review Notes

**Spec coverage check** — every in-scope item from `docs/superpowers/specs/2026-08-11-mobile-classroom-student-parity-design.md` maps to a task:
1. `isBoardOpen` grid → Tasks 1, 2, 4, 9
2. Guest join flow → Tasks 2, 3, 8, 9
3. Reactions → Tasks 1, 2, 5, 9
4. Raised hands → Tasks 1, 2, 6, 7, 9
5. Audio-unlock → Task 3, 9
6. `hostName` parity → Task 1, 2, 4
7. Native replay screen → Tasks 10, 11, 12, 13
8. Subtitle overlay → Task 11, 13
9. Transport bar + attendance → Task 12, 13

**Type consistency check** — `ClassroomState.isBoardOpen`/`hostName`/`raisedHands`/`reactions`/`userReactions` (Task 1) are read by `useClassroomSession.ts` (Task 2), `ClassroomScreen.tsx` (Task 9), and `ClassroomReplayScreen.tsx` (Task 13) using the exact same field names throughout. `RaisedHandItem`/`StickerReactionItem` (Task 1) are used identically in Tasks 2, 5, 6, 7, 9. `computeReplayOverlayAt`'s return shape (Task 10) matches the fields `ClassroomReplayScreen.tsx` destructures in Task 13 (`zoom`, `rightZoom`, `scroll`, `rightScroll`, `pointer`).

**No placeholders** — every step has concrete, complete code; no "TODO"/"add appropriate handling" left in any task.
