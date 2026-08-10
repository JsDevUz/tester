# Mobile Classroom — Full Student Parity (Live + Native Replay)

## Context

Phase 6 ([2026-07-20-mobile-classroom-phase6-design.md](2026-07-20-mobile-classroom-phase6-design.md)) shipped the first native classroom cut: a student can join a live session, see synced PDF/notebook pages with strokes (read-only, Skia-rendered), pinch-zoom/pan with sync-break/resync, use a participant roster bottom sheet, and talk/listen via LiveKit voice with a plain mic toggle.

That cut is intentionally partial. Comparing today's mobile code (`apps/mobile/src/screens/ClassroomScreen.tsx`, `hooks/useClassroomSession.ts`, `hooks/useClassroomVoice.ts`, `types/classroom.ts`, `components/classroom/*`) against the web student experience (`apps/frontend/src/pages/ClassroomStudentPage.tsx`, `hooks/useClassroomSession.ts`, `hooks/useClassroomVoice.ts`, `hooks/useClassroomReplay.ts`, `components/classroom/*`) shows real gaps, and replay is still a WebView (`CourseScreen.tsx`'s `openLiveClassReplay` navigates to the `Web` screen at `/classroom-history/:id/replay`).

This spec closes every remaining gap so the mobile student experience is 1:1 with web, entirely native — **no WebView anywhere in the classroom flow**. Host/teacher tooling remains permanently out of scope (mobile has no teacher role, as established in Phase 6).

## Scope

**In scope — Live session, filling gaps:**
1. `isBoardOpen` state — when the teacher closes the board, show a native participants grid (avatar tiles, Google-Meet-style) instead of the board, matching `ClassroomParticipantsGrid.tsx`.
2. Guest (unauthenticated) join flow for `/classroom/free/:id`-equivalent sessions — name entry screen before joining, matching `ClassroomStudentPage.tsx`'s pre-join modal.
3. Emoji reactions — send + floating animated overlay, matching `StickerReactionsOverlay.tsx`.
4. Raised hands — toggle button + list of raised hands (read-only list — no lower-hand controls, since that's host-only), matching `RaisedHandsControl.tsx` in `readOnly` mode.
5. Audio-unlock affordance — if RN's audio session ever fails to auto-play a subscribed LiveKit track, surface a manual "tap to unlock" control (mirrors web's autoplay-policy workaround; kept for parity even though RN rarely needs it).
6. `hostName` in banners/grid (currently hardcoded/missing on mobile in places).

**In scope — Native replay (new):**
7. A native `ClassroomReplayScreen` replacing the WebView fallback. Fetches `GET /classroom/sessions/:id/replay`, always renders the **board-only** view (static `boardSnapshot` + audio + subtitle + pointer/scroll/zoom overlay for `boardAudio` mode, fully static for `boardSilent`/legacy) — never the interactive full event-replay scrubbing-through-history mode, because the backend already restricts that to teachers (`isTeacher` flag) and mobile has no teacher role. This matches how a student would experience `/classroom-history/:id/replay?view=board` on web today, just native.
8. Subtitle overlay during replay, matching `ClassroomSubtitleOverlay.tsx`.
9. Play/pause/scrub transport bar, attendance list, matching `ClassroomReplayPage.tsx`'s student-relevant subset (board download and the `?view=board` teacher toggle are host-only conveniences and are excluded).

**Out of scope (unchanged from Phase 6):**
- Any drawing/editing tool, teacher toolbar, PDF library management, recording controls, mute-other-participants, theme toggle control (mobile still *receives* `theme:set` and applies it, it just never sends it), board download/export.
- Audio input device picker (per prior decision — OS handles routing).
- Full interactive replay scrubbing (`recordingMode: 'full'`) — permanently inaccessible to students on web too.

## Architecture

### 1. `isBoardOpen` + participants grid

`apps/mobile/src/types/classroom.ts` is missing `isBoardOpen`, `hostName`, `raisedHands`, `strokesByMode`, and the `laser`/`line`/eraser/lasso/select tool variants that can arrive in a stroke's `tool` field from the wire (mobile never draws, but a stroke record can still reference these tools since the teacher used them). Bring `CsTool`, `CsSnapshot`, and `ClassroomState` in mobile's `types/classroom.ts` up to parity with `apps/frontend/src/api/classroom.ts`'s definitions (lines 319–413).

`ClassroomScreen.tsx` branches on `state.isBoardOpen`: when `false`, render a new `ClassroomParticipantsGrid.tsx` (RN port of the web component minus the `ResizeObserver`/dynamic-grid-limit math — RN has no scrollbar to avoid, so this simplifies to a `FlatList`/`ScrollView` grid with a fixed reasonable column count by `useWindowDimensions()` width, same visual tile design: avatar circle with initials, speaking ring, mic badge, "Yana N ta" overflow tile). When `true`, render the existing `ClassroomBoard` as today, plus a new top participant strip (compact horizontal version, analogous to `ClassroomTopParticipantBar.tsx`) above it.

`useClassroomSession.ts` (mobile) needs to read `isBoardOpen` from the join snapshot and listen for `board:open:set` (currently entirely absent from the mobile hook's listener list) — this is a one-line reducer addition (`setState(s => ({...s, isBoardOpen: p.isOpen}))`), no ported-reducer change needed since it's not part of `classroomReducers.ts` on web either (handled inline in the hook there too).

### 2. Guest join flow

Mobile's `useClassroomSession` hook already accepts a `guestName` parameter and has `getGuestId()` (persisted via the existing `storage` wrapper, mirroring web's `sessionStorage`-backed `getGuestId()`). What's missing is the UI: `ClassroomScreen.tsx` needs to detect "no auth token and this is a free/guest-eligible session" and render a pre-join name-entry screen before calling `useClassroomSession`, matching web's dark modal (`ClassroomStudentPage.tsx` lines 80–140) — avatar circle, "Uchrashuvdagi ismingiz" label, text input, "Qo'shilish" submit button. Once submitted, the name is passed into `useClassroomSession(sessionId, guestName)` exactly as today's signature already allows.

Voice must also respect guest eligibility: `useClassroomVoice` should only connect when `admin/user` is present OR a guest name was submitted (mirrors web's `isGuestUser` gate) — mobile's current `ClassroomScreen.tsx` gates voice on `user` only, dropping guest voice entirely; this needs the same `isGuestUser` OR-condition web has, and `apiVoiceToken` needs the guest overload (`guestId`, `guestName` → hits `/classroom/sessions/:id/voice-token/guest`), which mobile's `api/classroom.ts` doesn't have today (only the authenticated `voice-token` call exists).

How a user reaches a guest-eligible session on mobile at all (deep link vs. in-app share) is a navigation-layer question resolved at plan time — this spec only requires that once `ClassroomScreen` is opened without an auth token for such a session, the guest flow described above runs instead of failing with `GUEST_NAME_REQUIRED`.

### 3. Reactions

Port `StickerReactionsOverlay.tsx`'s visual design to RN Reanimated: each reaction is an emoji + name tag that floats up and fades over ~3.5s with a randomized horizontal drift, deterministic per reaction `id` (same seeded-hash approach as web, so the animation math ports directly — swap CSS `@keyframes`/custom properties for a Reanimated `withTiming` sequence driving `translateY`/`translateX`/`opacity`).

`useClassroomSession.ts` (mobile) gains `sendReaction(emoji)` (emits `reaction:send` with `{sessionId, token, emoji, userName}`) and a `reaction:receive` listener that appends to `state.reactions` and auto-clears after 3.5s — direct port of the web hook's logic (lines 215–241 there). A small emoji-picker popover/action-sheet (9 emoji: 💖👍🎉👏😂😮😢🤔👎) triggers `sendReaction`, surfaced from the call bar (see §6).

### 4. Raised hands

Port `RaisedHandsControl.tsx` in `readOnly` mode only (no `onLowerAll`/`onLowerUser` handlers wired — those buttons simply don't render, matching how web already conditionally hides them via the `readOnly` prop). RN version: a green pill button (first raiser's name + count) that opens a bottom sheet listing all raised hands with avatar + name, no lower-hand action icons.

`useClassroomSession.ts` (mobile) gains `toggleHandRaise()` (emits `hand:toggle`) and a `hand:update` listener writing `state.raisedHands` — direct port of web hook lines 243–245, 435–444.

### 5. Audio-unlock affordance

RN's `Room.on(RoomEvent.TrackSubscribed, ...)` via `@livekit/react-native` attaches audio automatically through the native audio session, which does not have a browser-style autoplay-block — so `needsAudioUnlock` will realistically almost never fire. Still, for parity and defensive coverage (e.g. an OS-level audio interruption that leaves a track silently unresumed), mirror the state shape: `useClassroomVoice.ts` (mobile) tracks a `needsAudioUnlock` boolean and exposes `unlockAudio()`; `ClassroomScreen.tsx` shows a small "Ovozni yoqish uchun bosing" pill (matching web's amber/indigo banner styling adapted to the app's dark classroom background) only when that flag is true. This is a thin, mostly-dormant affordance — not a major build item.

### 6. Call bar consolidation

Today mobile's bottom row in `ClassroomScreen.tsx` is just a mic toggle + a text label opening the roster. Web's `ClassroomCallBar.tsx` combines mic toggle, reaction picker, hand-raise toggle, and end-call into one floating bottom bar. Mobile gets an equivalent `ClassroomCallBar.tsx`: mic pill, reaction-emoji button (opens the picker from §3), hand-raise button (toggles via §4's `toggleHandRaise`), and participants-count button (opens the existing `ClassroomRoster` sheet). No end-call button distinct from the screen's own back navigation (mobile already handles "leave" via standard back gesture/header — web's `onEndCall={() => navigate("/")}` maps to the equivalent RN nav-back, not a new control).

### 7. Native replay screen

New `apps/mobile/src/screens/ClassroomReplayScreen.tsx`, wired into `navigation/types.ts` as `ClassroomReplay: {sessionId: string}` and registered in `RootNavigator.tsx`. `CourseScreen.tsx`'s `openLiveClassReplay` changes from a `Web`-screen WebView navigation to `navigation.navigate('ClassroomReplay', {sessionId: classSessionId})`.

Data flow, student-only subset:
- `apiClassReplay(sessionId)` (mobile's `api/classroom.ts` already has this, but its return type in `types/classroom.ts`'s `ClassReplayData` is missing `boardSnapshot`, `recordingMode`, `subtitles`, `recordings` — bring it up to parity with web's `ClassReplayData` interface, `apps/frontend/src/api/classroom.ts` lines 227–250).
- Because students always get the board-only view (backend enforces this via `isTeacher`), the screen skips the interactive `computeStateAt(timeMs)` full-history replay path entirely — no need to port `useClassroomReplay.ts`'s RAF-driven scrubbing-through-`historyEvents` logic for mobile. Instead: render the static `boardSnapshot` (final strokes/pages, same `ClassroomBoard`/Skia renderer used live, `editable=false`, no live sync since there's no "host" — always free-pan) and, if `recordingMode === 'boardAudio'`, layer a **lightweight** timeline replay that only drives `pointer`/`scroll`/`zoom` from `historyEvents` (not strokes — those are already final/static) synced to audio position. If `recordingMode === 'boardSilent'` or there's no recording, it's fully static with no transport bar beyond nothing to scrub (no audio, nothing to play).
  - This lightweight pointer/scroll/zoom-only replay reuses a small slice of the ported `classroomReducers.ts` reducers already in `apps/mobile/src/lib/classroomReducers.ts` (the `zoom:set`/`scroll:set`/`pointer:move` cases only) — not a new reducer file, just driving the existing state shape's `zoom`/`scroll`/`pointer` fields from event timestamps the same way web's `computeStateAt` does, scoped to those three event types.
- Audio playback: `react-native-video` in audio-only mode (already installed, already used by `HlsVideoPlayer.tsx` for course videos — same library, new usage), `recordingUrl` as source. Its reported position (`onProgress`) is the time source for the pointer/scroll/zoom replay and for the subtitle overlay, offset by `recordingStartedAtMs` exactly as web's `handleSeek`/`play` logic does (`apps/frontend/src/pages/ClassroomReplayPage.tsx` lines 93–174 — the offset arithmetic ports directly, only the audio API surface changes from `HTMLAudioElement` to `react-native-video`'s ref API).
- Transport bar: play/pause, scrubber (`Slider` from an already-available RN component, matching what other native players in this app use), elapsed/duration labels, "REPLAY" badge — visual port of the web bottom bar (`ClassroomReplayPage.tsx` lines 276–316), auto-hiding on inactivity using the same tap-to-reveal pattern already established elsewhere in mobile's video/PDF viewers if one exists, otherwise a simple 3s-idle-timeout `Animated` fade (no new gesture library needed).
- Attendance: bottom sheet listing `data.attendance` (name + present/late/absent), reusing the existing bottom-sheet visual pattern from `ClassroomRoster.tsx`.
- Subtitles: `ClassroomSubtitleOverlay` (RN port) — cue lookup against `data.subtitles ?? data.boardSnapshot?.subtitles ?? []` by current replay time, same as web.
- Error/loading states: reuse the same `SESSION_NOT_FOUND`-style error card pattern already in `ClassroomScreen.tsx`; polling every 5s while `recordingUrl` exists but `subtitles` hasn't arrived yet (server generates subtitles async) — direct port of web's polling `useEffect` (`ClassroomReplayPage.tsx` lines 43–63).

## Data Flow Summary

```
Live (existing, extended):
Backend --Socket.IO /classroom--> useClassroomSession (mobile, extended)
    adds: board:open:set, reaction:receive, hand:update listeners
    adds: sendReaction(), toggleHandRaise() emitters
                    |
              ClassroomState (extended: isBoardOpen, reactions, raisedHands, hostName)
               /            \                    \
    isBoardOpen=false   isBoardOpen=true      StickerReactionsOverlay
  ParticipantsGrid      ClassroomBoard         RaisedHandsControl (readOnly)
   (new)                 (existing)            ClassroomCallBar (new, consolidated)

Replay (new):
GET /classroom/sessions/:id/replay --> ClassReplayData (boardSnapshot, recordingMode, subtitles)
                    |
     static boardSnapshot rendered via existing ClassroomBoard/Skia (editable=false, no sync)
                    |
     if recordingMode === 'boardAudio': historyEvents (zoom/scroll/pointer only) replayed
     against react-native-video's audio position (offset by recordingStartedAtMs)
                    |
        ClassroomSubtitleOverlay (new) + transport bar (new) + attendance sheet (new)
```

## New Native Dependencies

None. Everything needed (`@shopify/react-native-skia`, `@livekit/react-native`, `socket.io-client`, `react-native-video`, `react-native-gesture-handler`, `react-native-reanimated`) is already installed per Phase 6. This spec is entirely new application code (screens, components, hook extensions, type extensions) against existing native capability.

## Components/Files Summary

**New:**
- `screens/ClassroomReplayScreen.tsx`
- `components/classroom/ClassroomParticipantsGrid.tsx`
- `components/classroom/ClassroomTopParticipantBar.tsx`
- `components/classroom/ClassroomCallBar.tsx` (replaces the inline mic-row in `ClassroomScreen.tsx`)
- `components/classroom/StickerReactionsOverlay.tsx`
- `components/classroom/RaisedHandsControl.tsx` (readOnly-only)
- `components/classroom/ClassroomSubtitleOverlay.tsx`
- `components/classroom/ClassroomGuestJoinForm.tsx`
- `components/classroom/ClassroomReplayTransportBar.tsx`
- `components/classroom/ClassroomAttendanceSheet.tsx` (or reuse/extend `ClassroomRoster.tsx`'s sheet shell)

**Modified:**
- `types/classroom.ts` — add `isBoardOpen`, `hostName`, `raisedHands`, `strokesByMode`, extended `CsTool`, extended `ClassReplayData` (`boardSnapshot`, `recordingMode`, `subtitles`, `recordings`)
- `hooks/useClassroomSession.ts` — add `board:open:set`, `reaction:receive`, `hand:update` listeners; add `sendReaction`, `toggleHandRaise` emitters; guest-eligibility plumbing
- `hooks/useClassroomVoice.ts` — guest-name support (voice-token/guest call), `needsAudioUnlock`/`unlockAudio`
- `api/classroom.ts` — add guest voice-token overload, extend `apiClassReplay` return type usage
- `screens/ClassroomScreen.tsx` — branch on `isBoardOpen`, render guest join form when applicable, wire new call bar
- `screens/CourseScreen.tsx` — `openLiveClassReplay` navigates to native `ClassroomReplay` instead of `Web`
- `navigation/types.ts`, `navigation/RootNavigator.tsx` — register `ClassroomReplay` route
- `lib/classroomReducers.ts` — no new reducers required (zoom/scroll/pointer cases already exist and are reused as-is for replay)

## Testing

Consistent with this codebase's established mobile test strategy (Jest unit tests for pure logic only, no component/rendering tests for Skia/gesture layers):
- Any new pure logic (guest-eligibility gating, reaction auto-clear timing math, pointer/scroll/zoom-from-events replay derivation) gets Jest coverage where it's a plain function.
- Screens/visual components are verified manually.

## Resolved Decisions (from brainstorming)

1. **Scope**: student-side only, no host/teacher tooling — confirmed explicitly.
2. **Replay**: in scope, fully native, no WebView.
3. **`isBoardOpen` participants grid**: in scope, full native port.
4. **Guest join**: in scope, full native port (name entry + guest voice token).
5. **Subtitles**: in scope for replay.
6. **Reactions + raised hands**: both in scope, full native port (raised hands read-only, since lowering hands is host-only).
7. **Audio controls**: audio-unlock affordance in scope (thin/defensive); mic device picker explicitly out of scope (OS handles routing, per Phase 6 precedent).
8. **Replay depth**: only the board-only/static-snapshot replay path is built — the interactive full-history scrubbing mode is never reachable by students on web either, so it is not ported.
