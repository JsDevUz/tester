# Mobile ↔ Web Parity — Phase 6: Live Classroom (Student View)

## Context

This is Phase 6 of the mobile-web parity effort (see [Phase 1 spec](2026-07-20-mobile-web-parity-phase1-design.md) for the overall phased plan and repo layout — `apps/mobile` is a bare-RN-CLI, no-Expo, student-only app; `apps/mobile/` is entirely outside the outer repo's git, tracked in its own local-only nested repo for development purposes only).

Phase 6 covers the single most complex feature in the whole parity effort: the **live classroom** (real-time synced PDF/whiteboard viewing + group voice chat) and its **replay** (recorded playback of a past session). Mobile is student-only, so this phase ports only `ClassroomStudentPage.tsx` and `ClassroomReplayPage.tsx` — the teacher/host experience (`ClassroomHostPage.tsx`, all drawing tools, the toolbar, PDF library management) is permanently out of scope for mobile.

## Why This Is Tractable Despite The Size

The web implementation is ~5000 lines across frontend+backend, but it was deliberately designed to be platform/resolution-independent:

- **PDF pages are never parsed on the client.** The teacher's uploaded PDF is rasterized server-side (mupdf → WebP, ~1600px wide) once, at upload time. Every client — web or mobile — just displays a static image URL per page. There is no pdf.js-equivalent problem on mobile; `<Image>` is sufficient.
- **Stroke coordinates are normalized to `[0,1]`** relative to each page's own width/height (`CsStroke.points: number[]`, flat `[x0,y0,x1,y1,...]` pairs). A phone and a desktop receive the exact same wire payload and just multiply by their own local pixel dimensions at paint time. No coordinate reconciliation needed.
- **Scroll position is page-relative** (`{page, yRatio, xRatio}`), not a global scroll-height percentage — resolution/render-state independent by design.
- **The state-reducer logic is already pure, framework-free TypeScript** (`apps/frontend/src/hooks/classroomReducers.ts`, 133 lines, zero DOM dependencies) and is reused verbatim by both the live view and the replay view on web. This file can be copied into the mobile app with no changes beyond the import paths.
- **Socket.IO and LiveKit both have official React Native SDKs** (`socket.io-client` already installed in mobile; `@livekit/react-native` is LiveKit's maintained RN package) that map closely to the web APIs already in use.

The genuinely hard, non-portable part is narrow and identifiable: the **Canvas2D paint code** (arrows, hachure/cross-hatch fills, rotated text) and the **DOM-scroll-container-based pinch/zoom math** in `ClassroomPdfViewer.tsx` (3036 lines, but the vast majority of that is host-only drawing-tool state machines that mobile never needs — the student-relevant rendering/gesture subset is roughly 800-1000 lines' worth of *concepts*, not code, to reimplement).

## Scope

**In scope:**
- Live classroom: join a session, view synced PDF/notebook pages with live strokes, pinch-zoom/pan (synced or free), split-screen (two panes, following device orientation), participant roster, group voice chat (join muted, self-unmute, see force-mute from teacher, active-speaker indicator).
- Replay: fetch a finished session's full event log + recording audio, scrub/play back through the same rendering layer used live, in read-only mode, with an attendance list instead of a live roster.
- Free (guest, no-login) classroom sessions: guest name entry, voice access correctly withheld (matches web — guests never get a voice token).

**Out of scope (host-only, permanently — mobile has no teacher role):**
- Any drawing tool, the toolbar, lasso selection, text/shape editing, PDF library management, starting/ending a class, force-muting others, changing board mode/theme/notebook style.

**Out of scope (this phase, deferred):**
- Background audio session deep configuration beyond what's needed for "voice keeps playing while backgrounded" (e.g. lock-screen media controls, CarPlay) — not requested, not part of the web feature either.
- Any offline/cached fallback for classroom (the existing `cached()` read-through pattern used elsewhere in mobile does not apply here — this is inherently a live, online-only feature, matching web's behavior where a disconnected student simply can't participate).

## Architecture

### Rendering layer: React Native Skia

`@shopify/react-native-skia` (new dependency, bare-RN-CLI compatible) renders each page's strokes on a canvas-like surface layered over the page's `<Image>`. Skia's API (paths, arcs, clipping, rotation transforms, gradient/pattern fills) is close enough to Canvas2D that the web's draw-primitive *math* (arrow head angles, hachure line spacing, rounded-rect corner radii, text rotation matrices) ports as direct translations of formula to Skia's equivalent primitive — not a redesign. Since mobile is student-only, there is no pointer/touch input to the canvas at all (`editable=false` always) — this removes the majority of the web component's complexity (no lasso, no drag-to-move, no text-edit cursor, no tool-specific pointer state machines).

### State layer: ported reducers + a new `useClassroomSession` hook

`apps/frontend/src/hooks/classroomReducers.ts` is copied into mobile essentially unchanged (pure functions, only type-import paths change). A new mobile `useClassroomSession` hook mirrors the web one's *listener* half only (no `hostActions` — mobile never emits `host:*` events): connects the socket, emits `student:join`, applies every incoming event through the ported reducers, exposes `{state, error}`.

### Socket transport

`socket.io-client` (already an mobile dependency) connects to the same `/classroom` namespace, same per-emit `{sessionId, token}` auth pattern (JWT from the existing `useAuthStore`/`storage`, not `localStorage`). No socket-handshake-level auth change needed — this is a direct port of `apps/frontend/src/api/classroomSocket.ts` and the join/listener wiring in `useClassroomSession.ts`.

### Voice: LiveKit

`@livekit/react-native` (new dependency) connects using a token fetched from the existing `POST /classroom/sessions/:id/voice-token` REST endpoint (unchanged backend contract). Same full-duplex model as web: everyone can talk, students join muted, self-unmute via a single toggle button, can be force-muted by the teacher (reflected via LiveKit's `TrackMuted` event, same as web). No device-picker UI (per user decision — OS handles audio routing). No manual `<audio>`-element autoplay-unlock dance (web-only concern); RN's native audio session handles playback automatically once a remote track is subscribed.

### Zoom/pan: gesture-handler + reanimated (both already installed)

Pinch-to-zoom (`MIN_ZOOM=1, MAX_ZOOM=4`, matching web) and pan, via `react-native-gesture-handler`'s `Gesture.Pinch()`/`Gesture.Pan()` composed with `react-native-reanimated` shared values driving a transform matrix — conceptually the same anchored-zoom behavior as web's `useClassroomZoom.ts`, implemented against RN's gesture system instead of DOM scroll-container tricks. A "Move" toggle breaks sync from the teacher's broadcast zoom/scroll (same UX as web); scroll-sync is driven by a `FlatList` (one page per row) using `onViewableItemsChanged`/manual offset math to compute and apply `{page, yRatio}`, mirroring the web's page-relative (not global-percentage) sync model.

### Split-screen layout

Per user decision: matches web's behavior exactly — the device's own orientation (not an app-controlled lock) determines whether both panes render side-by-side (landscape, sufficient width) or one at a time with a switch control (portrait). The app never forces orientation; it just responds to `useWindowDimensions()`/orientation changes the way it would to any other resize.

### Background lifecycle

Per user decision: when the app backgrounds, the classroom socket connection is allowed to drop (or is explicitly closed) — LiveKit's voice connection is deliberately left running so backgrounded audio continues. On foreground (`AppState` listener), the socket reconnects and re-emits `student:join`, receiving a fresh snapshot exactly as a first-time join would (this re-join-on-reconnect behavior already exists in the web hook via `socket.on("connect", join)` and needs no protocol change — mobile just needs to also listen for `AppState` transitions and nudge a reconnect attempt if the socket didn't reconnect on its own).

### Replay

Reuses the exact same Skia rendering layer and gesture/zoom code (always `editable=false`, always free-pan — there's no "host" to sync to in a replay). Fetches `GET /classroom/sessions/:id/replay` once (existing endpoint, unchanged), which returns the full `historyEvents` array (each event's payload byte-identical to what was broadcast live) plus a `recordingUrl`. Mobile ports `useClassroomReplay.ts`'s `computeStateAt(timeMs)` logic (replays events 0..timeMs through the same ported reducers) — no server-side "snapshot at time T" endpoint exists or is needed. Audio playback uses `react-native-video` (already installed in mobile from Phase 1) in audio-only mode; its playback position becomes the time source driving `computeStateAt()`, matching web's "audio element drives the clock" design (`recordingStartedAtMs` offset applied the same way).

## Data Flow Summary

```
Backend (unchanged) --Socket.IO /classroom namespace--> mobile useClassroomSession
                                                              |
                                                    ported classroomReducers.ts
                                                              |
                                                        ClassroomState
                                                          /        \
                                          Skia page renderer    Roster / voice UI
                                          (strokes, per page)   (LiveKit Room)

Backend (unchanged) --GET /classroom/sessions/:id/replay--> historyEvents[] + recordingUrl
                                                              |
                                              computeStateAt(timeMs) [ported]
                                                              |
                                                  same Skia renderer, editable=false
```

## New Native Dependencies (bare RN CLI only, no Expo)

- `@shopify/react-native-skia` — stroke rendering (arrows, shapes, hachure fills, rotated text).
- `@livekit/react-native` — group voice chat.
- (No new dependency for replay audio — reuses `react-native-video` from Phase 1.)
- (`socket.io-client` already present.)
- (`react-native-gesture-handler`, `react-native-reanimated` already present — used for pinch/pan.)

Native config additions: iOS `Info.plist` microphone usage description (`NSMicrophoneUsageDescription` — likely already present from Phase 1's classroom-adjacent groundwork; verify and add if missing), Android `RECORD_AUDIO` manifest permission, plus whatever `@livekit/react-native`'s own install docs specify for autolinking (WebRTC native module setup).

## Screens/Components (new)

- `ClassroomScreen.tsx` (or similar) — the live classroom screen, analogous to `ClassroomStudentPage.tsx`. Handles the join flow (including guest-name entry for free/guest routes), error states (`SESSION_NOT_FOUND`, `NOT_ENROLLED`, `UNAUTHORIZED`, `GUEST_NAME_REQUIRED`), and the "session ended" terminal state.
- `ClassroomReplayScreen.tsx` — the replay screen, analogous to `ClassroomReplayPage.tsx`.
- `useClassroomSession.ts` (mobile hook) — ported listener-only version of the web hook.
- `useClassroomReplay.ts` (mobile hook) — ported `computeStateAt` scrubbing logic.
- `classroomReducers.ts` (mobile) — direct port, pure functions.
- `useClassroomVoice.ts` (mobile hook) — LiveKit connect/token/mute-state wiring, `@livekit/react-native` instead of `livekit-client`.
- A Skia-based page/stroke renderer component (exact name TBD at planning time) — the single largest new piece of code in this phase.
- Zoom/pan gesture wrapper component built on `react-native-gesture-handler`/`reanimated`.
- Participant roster component (bottom sheet, matching the existing mobile bottom-sheet pattern established in Phase 1's `CourseLeaderboardSheet.tsx`/`ProfileSheet.tsx`).
- Mic toggle control (single button, no device picker).

## Error Handling

Matches web's existing error surface exactly, since the backend contract is unchanged:
- Join failures (`SESSION_NOT_FOUND` / `NOT_ENROLLED` / `UNAUTHORIZED` / `GUEST_NAME_REQUIRED`) → full-screen localized error state with a way back to Courses.
- `hostOnline: false` (teacher disconnected, 90s grace period) → non-blocking banner, matching web's "Ustoz bilan aloqa uzildi" treatment.
- Voice unavailable (`VOICE_DISABLED`, LiveKit not configured server-side, HTTP 503 from the token endpoint) → class continues without voice, mic control disabled, matching web's soft-dependency treatment.
- `session:ended` → terminal "Dars yakunlandi" screen.
- Network loss mid-session → relies on Socket.IO's own reconnection plus the `AppState`-driven re-join described above; no bespoke retry UI beyond what already exists via `useNetwork()` elsewhere in the app for surfacing connectivity state.

## Testing

Per this project's established mobile test strategy (Phase 1 precedent): Jest unit tests for pure logic only — `classroomReducers.ts` (ported, and directly testable with the same kind of input/output assertions used for `lib/lessons.ts` in Phase 1) and `computeStateAt()`'s event-replay logic. No component/rendering tests for the Skia canvas or gesture layers (matches the codebase's existing minimal-test culture; these are verified manually, same as Phase 1's screens).

## Resolved Decisions (from brainstorming)

1. **Drawing library**: React Native Skia (not `react-native-svg`) — closer to Canvas2D, lets the web's paint-primitive math port as direct translation.
2. **LiveKit native setup**: done as part of this phase's implementation tasks, not split into a separate "native audio setup" phase.
3. **Replay**: in scope for this phase (not deferred) — the shared rendering layer makes it low-marginal-cost once the live view exists.
4. **Split-screen**: full parity with web — both panes render, landscape shows them side-by-side, portrait shows one at a time with a switch control. The app does not force/lock orientation; it only responds to the device's own current orientation, matching the user's explicit direction not to auto-rotate.
5. **Mic device picker**: dropped for mobile — a single mic on/off toggle only, no "choose which microphone" UI (OS handles audio routing).
6. **Replay audio player**: `react-native-video` (already installed), not a new audio-specific library.
7. **Background behavior**: voice (LiveKit) continues in the background; the classroom Socket.IO connection does not need to be kept alive in the background and resyncs via a fresh `student:join` on foreground.
