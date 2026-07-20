# Mobile Live Classroom (Phase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/mobile`'s live classroom (student view) and replay to full functional parity with `apps/frontend`'s `ClassroomStudentPage.tsx`/`ClassroomReplayPage.tsx` — synced PDF/notebook viewing with live teacher strokes, pinch-zoom/pan, split-screen, participant roster, LiveKit group voice, and scrubbable replay with recorded audio.

**Architecture:** The backend contract is unchanged — same Socket.IO `/classroom` namespace, same REST endpoints, same normalized `[0,1]` stroke coordinates and page-relative scroll model already used by web. Mobile ports the web's pure reducer functions unchanged, writes a new Skia-based rendering layer (replacing Canvas2D), and a new gesture-handler/reanimated-based zoom/pan layer (replacing DOM-scroll-container manipulation). Mobile is student-only: no drawing tools, no host actions — this removes the majority of the web component's complexity by construction.

**Tech Stack:** React Native 0.86 (bare CLI, **no Expo**), TypeScript, `@shopify/react-native-skia` (new), `@livekit/react-native` + `livekit-client` + `@livekit/react-native-webrtc` (new), `socket.io-client` (existing), `react-native-gesture-handler` + `react-native-reanimated` (existing), `react-native-video` (existing, reused for replay audio), Zustand, `@react-navigation`, Jest (unit tests for pure logic only).

## Global Constraints

- No Expo, anything. Only bare-RN-CLI-compatible libraries with autolinking.
- Mobile is student-only — never implement any `host:*`-emitting action, teacher UI, drawing tools, or PDF library management. Read-only rendering (`editable=false`) always.
- Backend contract is fixed and unchanged: same socket event names/payloads, same REST endpoints, same `CsStroke`/`CsSnapshot`/`CsParticipant` shapes as `apps/frontend/src/api/classroom.ts` — copy these types verbatim, do not invent new ones.
- Stroke coordinates are normalized `[0,1]` relative to each page's own rendered pixel size — never assume a fixed device resolution.
- Scroll sync uses `{page, yRatio, xRatio}` (page-relative), never a global scroll-percentage.
- Split-screen: both panes render; landscape shows them side-by-side, portrait shows one at a time with a switch control. The app never forces/locks device orientation — it only responds to `useWindowDimensions()`.
- No mic device picker — a single mic on/off toggle only.
- Background lifecycle: LiveKit voice keeps running in the background; the classroom Socket.IO connection may drop in the background and must re-join (fresh `student:join`) on `AppState` foreground transition.
- Replay audio uses `react-native-video` (already installed) in audio-only mode — no new audio library.
- Test strategy: Jest unit tests for pure functions only (`classroomReducers.ts` port, `computeStateAt` replay logic). No component/rendering tests for Skia/gesture layers — verified manually via the `run` skill.
- Follow existing mobile code style: dense single-line component bodies (see `apps/mobile/src/components/Ui.tsx`, `apps/mobile/src/screens/*.tsx`).

---

## File Structure

**New files:**
- `apps/mobile/src/lib/classroomReducers.ts` — ported pure reducer functions (direct copy from web, import paths only change)
- `apps/mobile/src/types/classroom.ts` — `CsStroke`, `CsSnapshot`, `CsParticipant`, `CsScrollPosition`, `CsTool`, `CsBoardMode`, `CsBoardLayout`, `CsNotebookStyle`, and related types (copied verbatim from `apps/frontend/src/api/classroom.ts`)
- `apps/mobile/src/api/classroom.ts` — REST functions: `apiActiveClassSessions`, `apiClassReplay`, `apiVoiceToken`, `apiStartClassRecording`
- `apps/mobile/src/lib/classroomSocket.ts` — socket singleton (ported from `apps/frontend/src/api/classroomSocket.ts`)
- `apps/mobile/src/hooks/useClassroomSession.ts` — join + listener wiring (student-only subset of the web hook, no `hostActions`)
- `apps/mobile/src/hooks/useClassroomReplay.ts` — `computeStateAt(timeMs)` scrubbing logic, ported
- `apps/mobile/src/hooks/useClassroomVoice.ts` — LiveKit connect/token/mute-state wiring
- `apps/mobile/src/components/classroom/ClassroomStrokeCanvas.tsx` — Skia rendering of one page's strokes (arrow/shape/text/pen/highlighter)
- `apps/mobile/src/components/classroom/ClassroomPageView.tsx` — one page: `<Image>` + `ClassroomStrokeCanvas` overlay, lazy-mounted
- `apps/mobile/src/components/classroom/ClassroomZoomPan.tsx` — pinch/pan gesture wrapper driving a shared-value transform
- `apps/mobile/src/components/classroom/ClassroomBoard.tsx` — orchestrates pages list (FlatList), scroll-sync, split-screen layout
- `apps/mobile/src/components/classroom/ClassroomRoster.tsx` — participant bottom sheet
- `apps/mobile/src/components/classroom/ClassroomMicControl.tsx` — mic on/off toggle
- `apps/mobile/src/components/classroom/ClassroomReplayTransport.tsx` — play/pause/scrubber bar for replay
- `apps/mobile/src/screens/ClassroomScreen.tsx` — live classroom screen (join flow, error states, ended state)
- `apps/mobile/src/screens/ClassroomReplayScreen.tsx` — replay screen
- `apps/mobile/__tests__/classroomReducers.test.ts` — unit tests for the ported reducers
- `apps/mobile/__tests__/classroomReplay.test.ts` — unit tests for `computeStateAt`

**Modified files:**
- `apps/mobile/package.json` — add `@shopify/react-native-skia`, `@livekit/react-native`, `livekit-client`, `@livekit/react-native-webrtc`
- `apps/mobile/src/navigation/types.ts` — add `Classroom: {sessionId: string}` and `ClassroomReplay: {sessionId: string}` routes
- `apps/mobile/src/navigation/RootNavigator.tsx` — register the two new screens
- `apps/mobile/src/screens/CourseScreen.tsx` — `openLiveClassReplay` now navigates to `ClassroomReplay` instead of the `Web` fallback route; `LiveClassBanner`'s live-session tap now navigates to `Classroom` instead of `Web`
- `apps/mobile/ios/Mobile/Info.plist` — add `NSMicrophoneUsageDescription` if not already present (verify first — Phase 1 may have added it already)
- `apps/mobile/android/app/src/main/AndroidManifest.xml` — add `RECORD_AUDIO` permission

---

### Task 1: Native dependencies install

**Files:**
- Modify: `apps/mobile/package.json` (and the outer workspace `package-lock.json`, since this is an npm-workspaces monorepo — install from the repo root or from `apps/mobile`, both resolve through the root lockfile)

**Interfaces:**
- Produces: `@shopify/react-native-skia` (`Canvas`, `Path`, `Skia`, `useCanvasRef` and other exports), `@livekit/react-native` (`Room`, `RoomEvent`, `Track`, `registerGlobals` and related), `livekit-client` (peer dep of the above), `@livekit/react-native-webrtc` (peer dep) — all available for later tasks to import.

- [ ] **Step 1: Install packages**

Run:
```bash
cd apps/mobile && npm install @shopify/react-native-skia @livekit/react-native livekit-client @livekit/react-native-webrtc
```
Expected: `package.json` dependencies gain all four; no unresolved peer-dependency errors (peer ranges were pre-verified compatible with the installed `react-native@0.86.0`, `react@19.2.7`, `react-native-reanimated@^4.5.2`).

- [ ] **Step 2: Register LiveKit's global polyfills**

`@livekit/react-native` requires `registerGlobals()` to be called once at app startup, before any LiveKit APIs are used. Open `apps/mobile/index.js` (the RN entry point) and add the import/call at the very top, before the `AppRegistry.registerComponent` call:

```javascript
import {registerGlobals} from '@livekit/react-native';
registerGlobals();
```

- [ ] **Step 3: Install iOS pods**

Run:
```bash
cd apps/mobile/ios && pod install
```
Expected: `Pod installation complete!`, with pods for `react-native-skia`, `livekit-react-native`, `react-native-webrtc` (or `@livekit/react-native-webrtc`'s pod name) listed as installed.

- [ ] **Step 4: Add iOS microphone usage description**

Check whether `apps/mobile/ios/Mobile/Info.plist` already has an `NSMicrophoneUsageDescription` key (Phase 1's plan mentioned LiveKit-adjacent groundwork might have added it already):
```bash
grep -A1 NSMicrophoneUsageDescription apps/mobile/ios/Mobile/Info.plist
```
If absent, add it inside the `<dict>` block:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Jonli darsda ovozli aloqa uchun mikrofon ruxsati kerak.</string>
```

- [ ] **Step 5: Add Android RECORD_AUDIO permission**

Open `apps/mobile/android/app/src/main/AndroidManifest.xml` and add, alongside any existing `<uses-permission>` entries near the top of the `<manifest>` block:
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

- [ ] **Step 6: Verify Android autolinking picks up the new native packages**

Run:
```bash
cd apps/mobile/android && ./gradlew :app:dependencies --configuration debugRuntimeClasspath | grep -i "skia\|livekit\|webrtc"
```
Expected: entries for the native packages appear (`react-native-skia`, `livekit-react-native`, `react-native-webrtc`).

- [ ] **Step 7: Commit**

```bash
cd apps/mobile && git add package.json index.js ios/Podfile.lock ios/Mobile/Info.plist android/app/src/main/AndroidManifest.xml
git commit -m "chore: add react-native-skia and LiveKit dependencies for classroom"
```

---

### Task 2: Classroom types + reducers (ported, TDD)

**Files:**
- Create: `apps/mobile/src/types/classroom.ts`
- Create: `apps/mobile/src/lib/classroomReducers.ts`
- Test: `apps/mobile/__tests__/classroomReducers.test.ts`

**Interfaces:**
- Produces: all types below, plus reducer functions `applyPdfSet`, `applyBoardSet`, `applyPageSet`, `applyStrokeAdd`, `applyStrokeUpdate`, `applyStrokeTextUpdate`, `applyStrokeShapeUpdate`, `applyStrokeReorder`, `applyStrokeUndo`, `applyStrokeSplit`, `applyPageClear`, `moveStrokePoints`, `reorderStrokeList` — each taking `(state: ClassroomState, payload: ...)` and returning a new `ClassroomState`, used by Task 4 (`useClassroomSession`) and Task 10 (`useClassroomReplay`).

- [ ] **Step 1: Create the types file**

Create `apps/mobile/src/types/classroom.ts` — copied verbatim from `apps/frontend/src/api/classroom.ts`'s WS-payload-type section (lines ~193-283 of that file) plus the `ClassroomState` shape from `apps/frontend/src/hooks/useClassroomSession.ts`:

```typescript
export type CsTool = 'pen' | 'highlighter' | 'arrow' | 'text' | 'rectangle' | 'ellipse';
export type CsBoardMode = 'pdf' | 'notebook';
export type CsBoardLayout = 'single' | 'split';
export type CsNotebookStyle = 'grid' | 'lined' | 'plain';

export type CsFontFamily = 'Inter' | 'Arial' | 'Georgia' | 'Comic Sans MS' | 'Nunito';
export type CsFillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type CsStrokeStyle = 'none' | 'solid' | 'dashed' | 'dotted';
export type CsSloppiness = 0 | 1 | 2;
export type CsEdges = 'sharp' | 'round';

export interface CsStroke {
  id: string;
  tool: CsTool;
  color: string;
  width: number;
  text?: string;
  fontFamily?: CsFontFamily;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  textAlign?: 'left' | 'center' | 'right';
  textBoxWidth?: number;
  textBoxHeight?: number;
  rotation?: number;
  backgroundColor?: string;
  fillStyle?: CsFillStyle;
  strokeStyle?: CsStrokeStyle;
  sloppiness?: CsSloppiness;
  edges?: CsEdges;
  opacity?: number;
  // Normalized [0,1], flat: [x0, y0, x1, y1, ...]. Shape tools use bbox corners [x0,y0,x1,y1].
  points: number[];
}

export interface CsParticipant {
  userId: string;
  name: string;
  online: boolean;
  status: 'absent' | 'present' | 'late';
}

export interface CsScrollPosition {
  page: number;
  yRatio: number;
  xRatio?: number;
}

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
  zoom: number;
  rightZoom?: number;
  scroll: CsScrollPosition | null;
  rightScroll?: CsScrollPosition | null;
  isFree: boolean;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  classroomTheme: 'light' | 'dark';
  notebookStyle: CsNotebookStyle;
}

export interface CsPresenceUpdate {
  participants: CsParticipant[];
  hostOnline: boolean;
}

export interface CsPointer {
  page: number;
  x: number;
  y: number;
  active: boolean;
  pane?: 'left' | 'right';
}

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
  zoom: number;
  rightZoom: number;
  scroll: CsScrollPosition | null;
  rightScroll: CsScrollPosition | null;
  isFree: boolean;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  classroomTheme: 'light' | 'dark';
  notebookStyle: CsNotebookStyle;
}

export const CLASSROOM_INITIAL_STATE: ClassroomState = {
  joined: false, error: null, ended: false,
  pdfName: null, pages: [], currentPage: 1,
  strokesByPage: {}, rightStrokesByPage: {}, participants: [], hostOnline: false, pointer: null,
  zoom: 1, rightZoom: 1, scroll: null, rightScroll: null,
  isFree: false, boardMode: 'pdf', boardLayout: 'single', leftBoardMode: 'pdf', rightBoardMode: 'pdf',
  classroomTheme: 'light', notebookStyle: 'grid',
};

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 0.25;

export interface ClassReplayEvent {
  type: string;
  payload: unknown;
  atMs: number;
}

export interface ClassReplayData {
  pdfName: string | null;
  pdfPages: string[];
  historyEvents: ClassReplayEvent[];
  recordingUrl: string | null;
  recordingStatus: 'none' | 'pending' | 'ready' | 'failed';
  recordingStartedAtMs: number | null;
  attendance: Array<{userId: string; name: string; status: 'absent' | 'present' | 'late'}>;
}

export interface ActiveClassSession {
  id: string;
  courseId: string;
  courseName: string;
  startedAt: number;
}
```

- [ ] **Step 2: Write the failing test for the reducers**

Create `apps/mobile/__tests__/classroomReducers.test.ts`:

```typescript
import {
  applyPdfSet,
  applyBoardSet,
  applyPageSet,
  applyStrokeAdd,
  applyStrokeUpdate,
  applyStrokeUndo,
  applyPageClear,
  moveStrokePoints,
  reorderStrokeList,
} from '../src/lib/classroomReducers';
import {CLASSROOM_INITIAL_STATE} from '../src/types/classroom';
import type {CsStroke} from '../src/types/classroom';

function stroke(id: string, points: number[] = [0.1, 0.1, 0.2, 0.2]): CsStroke {
  return {id, tool: 'pen', color: '#000', width: 4, points};
}

describe('moveStrokePoints', () => {
  it('shifts all points by the delta from the first point to the target', () => {
    const s = stroke('a', [0.1, 0.1, 0.3, 0.3]);
    const result = moveStrokePoints(s, 0.2, 0.2);
    expect(result).toEqual([0.2, 0.2, 0.4, 0.4]);
  });
});

describe('reorderStrokeList', () => {
  const list = [stroke('a'), stroke('b'), stroke('c')];

  it('moves selected strokes to the front', () => {
    const result = reorderStrokeList(list, ['a'], 'front');
    expect(result.map(s => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('moves selected strokes to the back', () => {
    const result = reorderStrokeList(list, ['c'], 'back');
    expect(result.map(s => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('moves a stroke one step forward', () => {
    const result = reorderStrokeList(list, ['a'], 'forward');
    expect(result.map(s => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves a stroke one step backward', () => {
    const result = reorderStrokeList(list, ['c'], 'backward');
    expect(result.map(s => s.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('applyPdfSet', () => {
  it('resets board mode to pdf single and clears strokes', () => {
    const result = applyPdfSet(CLASSROOM_INITIAL_STATE, {
      pdfName: 'lesson.pdf',
      pages: ['url1', 'url2'],
      currentPage: 1,
    });
    expect(result.pdfName).toBe('lesson.pdf');
    expect(result.pages).toEqual(['url1', 'url2']);
    expect(result.boardMode).toBe('pdf');
    expect(result.boardLayout).toBe('single');
    expect(result.strokesByPage).toEqual({});
  });
});

describe('applyBoardSet', () => {
  it('applies split layout with independent left/right modes', () => {
    const result = applyBoardSet(CLASSROOM_INITIAL_STATE, {
      mode: 'notebook',
      layout: 'split',
      leftMode: 'pdf',
      rightMode: 'notebook',
      currentPage: 2,
    });
    expect(result.boardLayout).toBe('split');
    expect(result.leftBoardMode).toBe('pdf');
    expect(result.rightBoardMode).toBe('notebook');
    expect(result.currentPage).toBe(2);
  });
});

describe('applyPageSet', () => {
  it('updates the current page and clears the pointer', () => {
    const state = {...CLASSROOM_INITIAL_STATE, pointer: {page: 1, x: 0.5, y: 0.5, active: true}};
    const result = applyPageSet(state, {page: 3});
    expect(result.currentPage).toBe(3);
    expect(result.pointer).toBeNull();
  });
});

describe('applyStrokeAdd', () => {
  it('adds a stroke to the given page', () => {
    const result = applyStrokeAdd(CLASSROOM_INITIAL_STATE, {page: 1, stroke: stroke('a')});
    expect(result.strokesByPage[1]).toHaveLength(1);
    expect(result.strokesByPage[1][0].id).toBe('a');
  });

  it('does not duplicate a stroke with an id that already exists', () => {
    const state = {...CLASSROOM_INITIAL_STATE, strokesByPage: {1: [stroke('a')]}};
    const result = applyStrokeAdd(state, {page: 1, stroke: stroke('a')});
    expect(result.strokesByPage[1]).toHaveLength(1);
  });

  it('adds to the right pane when pane is right', () => {
    const result = applyStrokeAdd(CLASSROOM_INITIAL_STATE, {page: 1, stroke: stroke('a'), pane: 'right'});
    expect(result.rightStrokesByPage[1]).toHaveLength(1);
    expect(result.strokesByPage[1]).toBeUndefined();
  });
});

describe('applyStrokeUpdate', () => {
  it('moves the stroke with the matching id', () => {
    const state = {...CLASSROOM_INITIAL_STATE, strokesByPage: {1: [stroke('a', [0.1, 0.1, 0.2, 0.2])]}};
    const result = applyStrokeUpdate(state, {page: 1, strokeId: 'a', x: 0.3, y: 0.3});
    expect(result.strokesByPage[1][0].points).toEqual([0.3, 0.3, 0.4, 0.4]);
  });
});

describe('applyStrokeUndo', () => {
  it('removes the stroke with the matching id', () => {
    const state = {...CLASSROOM_INITIAL_STATE, strokesByPage: {1: [stroke('a'), stroke('b')]}};
    const result = applyStrokeUndo(state, {page: 1, strokeId: 'a'});
    expect(result.strokesByPage[1].map(s => s.id)).toEqual(['b']);
  });
});

describe('applyPageClear', () => {
  it('empties the strokes list for the given page only', () => {
    const state = {...CLASSROOM_INITIAL_STATE, strokesByPage: {1: [stroke('a')], 2: [stroke('b')]}};
    const result = applyPageClear(state, {page: 1});
    expect(result.strokesByPage[1]).toEqual([]);
    expect(result.strokesByPage[2]).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
cd apps/mobile && npx jest __tests__/classroomReducers.test.ts
```
Expected: FAIL — `Cannot find module '../src/lib/classroomReducers'`.

- [ ] **Step 4: Implement `apps/mobile/src/lib/classroomReducers.ts`**

Direct port of `apps/frontend/src/hooks/classroomReducers.ts` — identical logic, only the import path changes:

```typescript
import type {CsBoardLayout, CsBoardMode, CsStroke, ClassroomState} from '../types/classroom';

export function moveStrokePoints(stroke: CsStroke, x: number, y: number): number[] {
  const dx = x - stroke.points[0];
  const dy = y - stroke.points[1];
  return stroke.points.map((value, index) => value + (index % 2 === 0 ? dx : dy));
}

export function reorderStrokeList(
  list: CsStroke[],
  strokeIds: string[],
  op: 'front' | 'back' | 'forward' | 'backward',
): CsStroke[] {
  const idSet = new Set(strokeIds);
  if (op === 'front' || op === 'back') {
    const selected = list.filter(s => idSet.has(s.id));
    const rest = list.filter(s => !idSet.has(s.id));
    return op === 'front' ? [...rest, ...selected] : [...selected, ...rest];
  }
  const next = [...list];
  const step = op === 'forward' ? 1 : -1;
  const indices =
    op === 'forward'
      ? [...next.keys()].filter(i => idSet.has(next[i].id)).reverse()
      : [...next.keys()].filter(i => idSet.has(next[i].id));
  for (const i of indices) {
    const j = i + step;
    if (j < 0 || j >= next.length || idSet.has(next[j].id)) continue;
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function applyPdfSet(
  s: ClassroomState,
  p: {pdfName: string; pages: string[]; currentPage: number},
): ClassroomState {
  return {
    ...s,
    pdfName: p.pdfName,
    pages: p.pages,
    currentPage: p.currentPage,
    boardMode: 'pdf',
    boardLayout: 'single',
    leftBoardMode: 'pdf',
    rightBoardMode: 'pdf',
    strokesByPage: {},
    rightStrokesByPage: {},
    pointer: null,
  };
}

export function applyBoardSet(
  s: ClassroomState,
  p: {
    mode: CsBoardMode;
    layout?: CsBoardLayout;
    leftMode?: CsBoardMode;
    rightMode?: CsBoardMode;
    currentPage: number;
    strokesByPage?: Record<number, CsStroke[]>;
    rightStrokesByPage?: Record<number, CsStroke[]>;
  },
): ClassroomState {
  return {
    ...s,
    boardMode: p.mode,
    boardLayout: p.layout ?? 'single',
    leftBoardMode: p.leftMode ?? p.mode,
    rightBoardMode: p.rightMode ?? p.mode,
    currentPage: p.currentPage,
    strokesByPage: p.strokesByPage ?? {},
    rightStrokesByPage: p.rightStrokesByPage ?? {},
    pointer: null,
    scroll: null,
  };
}

export function applyPageSet(s: ClassroomState, p: {page: number}): ClassroomState {
  return {...s, currentPage: p.page, pointer: null};
}

export function applyStrokeAdd(
  s: ClassroomState,
  p: {page: number; stroke: CsStroke; pane?: 'left' | 'right'; mode?: CsBoardMode},
): ClassroomState {
  if (p.pane === 'right') {
    if (p.mode && p.mode !== s.rightBoardMode) return s;
    const existing = s.rightStrokesByPage[p.page] ?? [];
    if (existing.some(x => x.id === p.stroke.id)) return s;
    return {...s, rightStrokesByPage: {...s.rightStrokesByPage, [p.page]: [...existing, p.stroke]}};
  }
  if (p.mode && p.mode !== s.leftBoardMode) return s;
  const existing = s.strokesByPage[p.page] ?? [];
  if (existing.some(x => x.id === p.stroke.id)) return s;
  return {...s, strokesByPage: {...s.strokesByPage, [p.page]: [...existing, p.stroke]}};
}

export function applyStrokeUpdate(
  s: ClassroomState,
  p: {page: number; strokeId: string; x: number; y: number; pane?: 'left' | 'right'; mode?: CsBoardMode},
): ClassroomState {
  const right = p.pane === 'right';
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const source = right ? s.rightStrokesByPage : s.strokesByPage;
  const list = source[p.page] ?? [];
  const next = list.map(stroke =>
    stroke.id === p.strokeId ? {...stroke, points: moveStrokePoints(stroke, p.x, p.y)} : stroke,
  );
  return right
    ? {...s, rightStrokesByPage: {...s.rightStrokesByPage, [p.page]: next}}
    : {...s, strokesByPage: {...s.strokesByPage, [p.page]: next}};
}

export function applyStrokeTextUpdate(
  s: ClassroomState,
  p: {page: number; stroke: CsStroke; pane?: 'left' | 'right'; mode?: CsBoardMode},
): ClassroomState {
  const right = p.pane === 'right';
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? 'rightStrokesByPage' : 'strokesByPage';
  const source = s[key];
  const list = source[p.page] ?? [];
  const next = list.some(stroke => stroke.id === p.stroke.id)
    ? list.map(stroke => (stroke.id === p.stroke.id ? p.stroke : stroke))
    : [...list, p.stroke];
  return {...s, [key]: {...source, [p.page]: next}};
}

export function applyStrokeShapeUpdate(
  s: ClassroomState,
  p: {page: number; stroke: CsStroke; pane?: 'left' | 'right'; mode?: CsBoardMode},
): ClassroomState {
  const right = p.pane === 'right';
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? 'rightStrokesByPage' : 'strokesByPage';
  const source = s[key];
  const list = source[p.page] ?? [];
  const next = list.some(stroke => stroke.id === p.stroke.id)
    ? list.map(stroke => (stroke.id === p.stroke.id ? p.stroke : stroke))
    : [...list, p.stroke];
  return {...s, [key]: {...source, [p.page]: next}};
}

export function applyStrokeReorder(
  s: ClassroomState,
  p: {
    page: number;
    strokeIds: string[];
    op: 'front' | 'back' | 'forward' | 'backward';
    pane?: 'left' | 'right';
    mode?: CsBoardMode;
  },
): ClassroomState {
  const right = p.pane === 'right';
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? 'rightStrokesByPage' : 'strokesByPage';
  const source = s[key];
  const list = source[p.page] ?? [];
  return {...s, [key]: {...source, [p.page]: reorderStrokeList(list, p.strokeIds, p.op)}};
}

export function applyStrokeUndo(
  s: ClassroomState,
  p: {page: number; strokeId: string; pane?: 'left' | 'right'; mode?: CsBoardMode},
): ClassroomState {
  const right = p.pane === 'right';
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? 'rightStrokesByPage' : 'strokesByPage';
  const source = s[key];
  return {...s, [key]: {...source, [p.page]: (source[p.page] ?? []).filter(x => x.id !== p.strokeId)}};
}

export function applyStrokeSplit(
  s: ClassroomState,
  p: {page: number; strokeId: string; replacements: CsStroke[]; pane?: 'left' | 'right'; mode?: CsBoardMode},
): ClassroomState {
  const right = p.pane === 'right';
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? 'rightStrokesByPage' : 'strokesByPage';
  const source = s[key];
  const existing = source[p.page] ?? [];
  const idx = existing.findIndex(x => x.id === p.strokeId);
  if (idx === -1) {
    const news = p.replacements.filter(r => !existing.some(x => x.id === r.id));
    if (news.length === 0) return s;
    return {...s, [key]: {...source, [p.page]: [...existing, ...news]}};
  }
  const next = [...existing];
  next.splice(idx, 1, ...p.replacements);
  return {...s, [key]: {...source, [p.page]: next}};
}

export function applyPageClear(
  s: ClassroomState,
  p: {page: number; pane?: 'left' | 'right'; mode?: CsBoardMode},
): ClassroomState {
  const right = p.pane === 'right';
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? 'rightStrokesByPage' : 'strokesByPage';
  return {...s, [key]: {...s[key], [p.page]: []}};
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
cd apps/mobile && npx jest __tests__/classroomReducers.test.ts
```
Expected: PASS, 13 tests passed.

- [ ] **Step 6: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors in the new files.

- [ ] **Step 7: Commit**

```bash
cd apps/mobile && git add src/types/classroom.ts src/lib/classroomReducers.ts __tests__/classroomReducers.test.ts
git commit -m "feat: port classroom types and pure state reducers from web"
```

---

### Task 3: Classroom REST API client + socket singleton

**Files:**
- Create: `apps/mobile/src/api/classroom.ts`
- Create: `apps/mobile/src/lib/classroomSocket.ts`

**Interfaces:**
- Consumes: `api` from `apps/mobile/src/lib/api.ts` (existing axios instance with auth interceptor), `useAuthStore` from `apps/mobile/src/store/authStore.ts` (existing).
- Produces: `apiActiveClassSessions(): Promise<ActiveClassSession[]>`, `apiClassReplay(sessionId: string): Promise<ClassReplayData>`, `apiVoiceToken(sessionId: string): Promise<{token: string; url: string}>`, `apiStartClassRecording(sessionId: string): Promise<void>` — consumed by Task 4/8/10. `getClassroomSocket(): Socket`, `closeClassroomSocket(): void` — consumed by Task 4.

- [ ] **Step 1: Create `apps/mobile/src/api/classroom.ts`**

```typescript
import {api} from '../lib/api';
import type {ActiveClassSession, ClassReplayData} from '../types/classroom';

export async function apiActiveClassSessions(): Promise<ActiveClassSession[]> {
  const res = await api.get('/classroom/sessions/active');
  return res.data;
}

export async function apiClassReplay(sessionId: string): Promise<ClassReplayData> {
  const res = await api.get(`/classroom/sessions/${sessionId}/replay`);
  return res.data;
}

export async function apiVoiceToken(sessionId: string): Promise<{token: string; url: string}> {
  const res = await api.post(`/classroom/sessions/${sessionId}/voice-token`);
  return res.data;
}

export async function apiStartClassRecording(sessionId: string): Promise<void> {
  await api.post(`/classroom/sessions/${sessionId}/recording/start`);
}
```

- [ ] **Step 2: Create `apps/mobile/src/lib/classroomSocket.ts`**

Ported from `apps/frontend/src/api/classroomSocket.ts`, using the mobile app's `API_URL` config instead of a Vite env var:

```typescript
import {io, Socket} from 'socket.io-client';
import {API_URL} from '../config/env';

const BACKEND = API_URL.replace('/api/v1', '');

let socket: Socket | null = null;

export function getClassroomSocket(): Socket {
  if (!socket) {
    socket = io(`${BACKEND}/classroom`, {transports: ['websocket', 'polling']});
  }
  return socket;
}

export function closeClassroomSocket(): void {
  socket?.close();
  socket = null;
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors in the two new files.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && git add src/api/classroom.ts src/lib/classroomSocket.ts
git commit -m "feat: add classroom REST client and socket singleton"
```

---

### Task 4: useClassroomSession hook (join + listeners)

**Files:**
- Create: `apps/mobile/src/hooks/useClassroomSession.ts`

**Interfaces:**
- Consumes: `getClassroomSocket`, `closeClassroomSocket` (Task 3), all `apply*` reducers + `CLASSROOM_INITIAL_STATE` (Task 2), `useAuthStore` (existing, for the JWT token and `storage` for a persisted guest ID).
- Produces: `useClassroomSession(sessionId: string | undefined, guestName?: string): {state: ClassroomState}` — consumed by Task 8 (`ClassroomScreen`).

- [ ] **Step 1: Implement the hook**

Create `apps/mobile/src/hooks/useClassroomSession.ts`. This is the student-only subset of the web hook: no `role` parameter (always `'student'`), no `hostActions` return, no `host:setTheme` emission on join. Uses `AppState` for background/foreground re-join, matching the existing pattern in `apps/mobile/src/providers/NetworkProvider.tsx`.

```typescript
import {useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {getClassroomSocket, closeClassroomSocket} from '../lib/classroomSocket';
import {useAuthStore} from '../store/authStore';
import {storage} from '../lib/storage';
import {
  applyBoardSet,
  applyPageClear,
  applyPageSet,
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
  CsNotebookStyle,
  CsParticipant,
  CsPointer,
  CsScrollPosition,
  CsSnapshot,
  CsStroke,
} from '../types/classroom';

async function getGuestId(): Promise<string> {
  const existing = await storage.get<string>('classroom_guest_id');
  if (existing) return existing;
  const id = `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await storage.set('classroom_guest_id', id);
  return id;
}

export function useClassroomSession(sessionId: string | undefined, guestName?: string) {
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
            classroomTheme: snap.classroomTheme ?? 'light',
            notebookStyle: snap.notebookStyle ?? 'grid',
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
    socket.on('scroll:set', (p: CsScrollPosition & {pane?: 'left' | 'right'}) =>
      setState(s => (p.pane === 'right' ? {...s, rightScroll: p} : {...s, scroll: p})),
    );
    socket.on('theme:set', (p: {theme: 'light' | 'dark'}) => setState(s => ({...s, classroomTheme: p.theme})));
    socket.on('notebookStyle:set', (p: {style: CsNotebookStyle}) =>
      setState(s => ({...s, notebookStyle: p.style})),
    );
    socket.on('host:online', () => setState(s => ({...s, hostOnline: true})));
    socket.on('host:offline', () => setState(s => ({...s, hostOnline: false})));
    socket.on('session:ended', () => setState(s => ({...s, ended: true})));

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
      socket.off('scroll:set');
      socket.off('theme:set');
      socket.off('notebookStyle:set');
      socket.off('host:online');
      socket.off('host:offline');
      socket.off('session:ended');
      appStateSub.remove();
      closeClassroomSocket();
    };
  }, [sessionId, guestName]);

  return {state};
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors in the new file. If `storage.get`/`storage.set` signatures differ from what's assumed (check the actual `apps/mobile/src/lib/storage.ts`), adjust the `getGuestId` helper to match the real API.

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && git add src/hooks/useClassroomSession.ts
git commit -m "feat: add useClassroomSession hook with AppState-driven re-join"
```

---

### Task 5: LiveKit voice hook

**Files:**
- Create: `apps/mobile/src/hooks/useClassroomVoice.ts`

**Interfaces:**
- Consumes: `apiVoiceToken`, `apiStartClassRecording` (Task 3), `Room`, `RoomEvent`, `Track` from `@livekit/react-native`/`livekit-client` (Task 1).
- Produces: `useClassroomVoice(sessionId: string | undefined): {connected: boolean; micEnabled: boolean; voiceAvailable: boolean; toggleMic: () => Promise<void>; activeSpeakerIds: Set<string>}` — consumed by Task 8 (`ClassroomScreen`) and Task 9 (`ClassroomMicControl`).

- [ ] **Step 1: Implement the hook**

```typescript
import {useCallback, useEffect, useRef, useState} from 'react';
import {Room, RoomEvent, Track} from 'livekit-client';
import {apiVoiceToken, apiStartClassRecording} from '../api/classroom';

export function useClassroomVoice(sessionId: string | undefined) {
  const [connected, setConnected] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<Set<string>>(new Set());
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
      setActiveSpeakerIds(new Set(speakers.map(p => p.identity)));
    });
    room.on(RoomEvent.LocalTrackPublished, () => setMicEnabled(true));
    room.on(RoomEvent.TrackMuted, publication => {
      if (publication.source === Track.Source.Microphone && publication.trackSid === room.localParticipant.getTrackPublication(Track.Source.Microphone)?.trackSid) {
        setMicEnabled(false);
      }
    });
    room.on(RoomEvent.Disconnected, () => {
      setConnected(false);
      setMicEnabled(false);
    });

    (async () => {
      try {
        const {token, url} = await apiVoiceToken(sessionId);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        setConnected(true);
        // Students always join muted — matches web's startMuted behavior.
        void apiStartClassRecording(sessionId).catch(() => undefined);
      } catch {
        if (!cancelled) setVoiceAvailable(false);
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
  }, [sessionId]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !connected) return;
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }, [connected, micEnabled]);

  return {connected, micEnabled, voiceAvailable, toggleMic, activeSpeakerIds};
}
```

Note: the web's `MicControl` device-picker logic (`getLocalDevices`/`switchActiveDevice`) is intentionally omitted per the plan's Global Constraints — mobile exposes only mic on/off.

- [ ] **Step 2: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors. If `livekit-client`'s actual `RoomEvent`/`Track`/`Room` API surface differs from what's assumed here (check `node_modules/livekit-client/dist/src/room/Room.d.ts` and `node_modules/livekit-client/dist/src/room/track/Track.d.ts` if errors appear — e.g. `getTrackPublication` may have a different name/signature in the installed version), adapt to match the real API and note the adaptation in your report.

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && git add src/hooks/useClassroomVoice.ts
git commit -m "feat: add LiveKit voice hook (mic toggle, active speakers, no device picker)"
```

---

### Task 6: Skia stroke rendering (ClassroomStrokeCanvas)

**Files:**
- Create: `apps/mobile/src/components/classroom/ClassroomStrokeCanvas.tsx`

**Interfaces:**
- Consumes: `CsStroke` (Task 2), Skia primitives (`Canvas`, `Path`, `Skia`, `Group`, `Text`, `useFont` or similar) from `@shopify/react-native-skia` (Task 1).
- Produces: `ClassroomStrokeCanvas` component with props `{strokes: CsStroke[]; width: number; height: number}` — pure read-only rendering, no touch handlers — consumed by Task 7 (`ClassroomPageView`).

This is a direct translation of the drawing math in `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx` (functions `drawArrow`, `drawShape`, `paintHachureFill`, `drawStroke`, lines 200-450 of that file) from Canvas2D imperative calls to Skia's declarative `Path` objects. Since mobile never renders in-progress/dimmed/edit-preview states (`editable=false` always, no `dimmed` parameter needed), this is simpler than the web version.

- [ ] **Step 1: Implement the component**

```tsx
import React, {useMemo} from 'react';
import {Canvas, Group, Path, Skia, Text, matchFont} from '@shopify/react-native-skia';
import type {CsStroke} from '../../types/classroom';

const REF_WIDTH = 1000;
const ARROW_HEAD_LEN_REF = 14;
const ARROW_HEAD_ANGLE = Math.PI / 7;

function buildArrowPath(s: CsStroke, w: number, h: number) {
  const [x0, y0, x1, y1] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const arrowHeadLen = ARROW_HEAD_LEN_REF * (w / REF_WIDTH) * Math.max(0.35, Math.min(1.4, s.width / 4));
  const headLen = Math.min(arrowHeadLen, dist / 3);

  const path = Skia.Path.Make();
  path.moveTo(x0, y0);
  path.lineTo(x1, y1);
  path.moveTo(x1 - headLen * Math.cos(angle - ARROW_HEAD_ANGLE), y1 - headLen * Math.sin(angle - ARROW_HEAD_ANGLE));
  path.lineTo(x1, y1);
  path.lineTo(x1 - headLen * Math.cos(angle + ARROW_HEAD_ANGLE), y1 - headLen * Math.sin(angle + ARROW_HEAD_ANGLE));
  return path;
}

function buildFreehandPath(s: CsStroke, w: number, h: number) {
  const path = Skia.Path.Make();
  if (s.points.length === 2) {
    path.moveTo(s.points[0] * w, s.points[1] * h);
    path.lineTo(s.points[0] * w + 0.5, s.points[1] * h + 0.5);
    return path;
  }
  if (s.points.length === 4) {
    path.moveTo(s.points[0] * w, s.points[1] * h);
    path.lineTo(s.points[2] * w, s.points[3] * h);
    return path;
  }
  path.moveTo(s.points[0] * w, s.points[1] * h);
  let prevX = s.points[0] * w;
  let prevY = s.points[1] * h;
  for (let i = 2; i + 1 < s.points.length; i += 2) {
    const curX = s.points[i] * w;
    const curY = s.points[i + 1] * h;
    const midX = (prevX + curX) / 2;
    const midY = (prevY + curY) / 2;
    path.quadTo(prevX, prevY, midX, midY);
    prevX = curX;
    prevY = curY;
  }
  path.lineTo(prevX, prevY);
  return path;
}

function buildShapePath(s: CsStroke, w: number, h: number) {
  const [x0raw, y0raw, x1raw, y1raw] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
  const x = Math.min(x0raw, x1raw);
  const y = Math.min(y0raw, y1raw);
  const width = Math.abs(x1raw - x0raw);
  const height = Math.abs(y1raw - y0raw);
  const path = Skia.Path.Make();
  if (width < 1 || height < 1) return path;
  if (s.tool === 'ellipse') {
    path.addOval(Skia.XYWHRect(x, y, width, height));
  } else {
    const radius = s.edges === 'round' ? Math.min(width, height) * 0.12 : 0;
    path.addRRect(Skia.RRectXY(Skia.XYWHRect(x, y, width, height), radius, radius));
  }
  return path;
}

function StrokeShape({s, w, h}: {s: CsStroke; w: number; h: number}) {
  const scale = w / REF_WIDTH;

  if (s.tool === 'text' && s.text) {
    const fontSize = Math.max(1, (s.fontSize ?? Math.max(14, s.width * 6)) * scale);
    const font = matchFont({fontFamily: 'sans-serif', fontSize, fontStyle: 'normal', fontWeight: s.fontWeight ?? 600});
    return (
      <Text
        x={s.points[0] * w}
        y={s.points[1] * h + fontSize}
        text={s.text}
        font={font}
        color={s.color}
      />
    );
  }

  if (s.tool === 'arrow') {
    if (s.points.length < 4) return null;
    return (
      <Path
        path={buildArrowPath(s, w, h)}
        style="stroke"
        strokeWidth={Math.max(1, s.width * scale)}
        strokeCap="round"
        strokeJoin="round"
        color={s.color}
      />
    );
  }

  if (s.tool === 'rectangle' || s.tool === 'ellipse') {
    if (s.points.length < 4) return null;
    const path = buildShapePath(s, w, h);
    const lineWidth = Math.max(1, s.width * scale);
    const hasFill = s.backgroundColor && s.backgroundColor !== 'transparent';
    return (
      <Group>
        {hasFill && (
          <Path path={path} style="fill" color={s.backgroundColor} opacity={(s.opacity ?? 100) / 100} />
        )}
        {(s.strokeStyle ?? 'solid') !== 'none' && (
          <Path path={path} style="stroke" strokeWidth={lineWidth} color={s.color} />
        )}
      </Group>
    );
  }

  const baseOpacity = s.tool === 'highlighter' ? 0.35 : 1;
  return (
    <Path
      path={buildFreehandPath(s, w, h)}
      style="stroke"
      strokeWidth={Math.max(1, s.width * scale)}
      strokeCap="round"
      strokeJoin="round"
      color={s.color}
      opacity={baseOpacity}
    />
  );
}

export function ClassroomStrokeCanvas({
  strokes,
  width,
  height,
}: {
  strokes: CsStroke[];
  width: number;
  height: number;
}) {
  const sorted = useMemo(() => strokes, [strokes]);
  if (width <= 0 || height <= 0) return null;
  return (
    <Canvas style={{width, height, position: 'absolute', top: 0, left: 0}}>
      {sorted.map(s => (
        <StrokeShape key={s.id} s={s} w={width} h={height} />
      ))}
    </Canvas>
  );
}
```

Note on scope reduction vs. web: hachure/cross-hatch fills (`paintHachureFill`), text rotation, and dashed/dotted stroke styles are intentionally simplified in this first pass (solid fill and solid stroke style only, no rotation) — these are visual-fidelity details for shapes/text a teacher might draw, not correctness-critical for a student to follow along. If `npx tsc --noEmit` or manual testing in Task 12 reveals these gaps are visually significant (e.g. many teachers use dashed lines for emphasis), file a fast-follow rather than blocking this task — flag this explicitly in your report either way.

- [ ] **Step 2: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors. If `@shopify/react-native-skia`'s actual exported API differs from what's assumed (check `node_modules/@shopify/react-native-skia/lib/typescript/src/index.d.ts` for the real `Skia.Path.Make()`, `Skia.XYWHRect`, `Skia.RRectXY`, `matchFont` signatures — Skia's JS API has had breaking changes across major versions), adapt to match the real API and note the adaptation in your report.

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && git add src/components/classroom/ClassroomStrokeCanvas.tsx
git commit -m "feat: add Skia-based read-only stroke renderer (pen/highlighter/arrow/shape/text)"
```

---

### Task 7: Page view + zoom/pan gesture layer

**Files:**
- Create: `apps/mobile/src/components/classroom/ClassroomPageView.tsx`
- Create: `apps/mobile/src/components/classroom/ClassroomZoomPan.tsx`

**Interfaces:**
- Consumes: `ClassroomStrokeCanvas` (Task 6), `CsStroke`/`CsNotebookStyle` (Task 2), `Gesture`/`GestureDetector` from `react-native-gesture-handler` (existing), `useSharedValue`/`useAnimatedStyle`/`withSpring` from `react-native-reanimated` (existing).
- Produces: `ClassroomPageView` component with props `{pageUrl: string | null; boardMode: 'pdf' | 'notebook'; notebookStyle: CsNotebookStyle; strokes: CsStroke[]; pageIndex: number}`. `ClassroomZoomPan` component with props `{zoom: number; synced: boolean; onBreakSync: () => void; onResync: () => void; children: React.ReactNode}` — both consumed by Task 8 (`ClassroomBoard`).

- [ ] **Step 1: Implement `ClassroomPageView`**

One page: a background (`<Image>` for pdf mode, a colored/patterned `<View>` for notebook mode) plus the stroke canvas overlay, matching aspect ratio via `onLayout` to get real pixel dimensions (needed since `ClassroomStrokeCanvas` needs pixel width/height, not the `[0,1]`-normalized stroke data itself).

```tsx
import React, {useState} from 'react';
import {Image, View} from 'react-native';
import {ClassroomStrokeCanvas} from './ClassroomStrokeCanvas';
import type {CsNotebookStyle, CsStroke} from '../../types/classroom';

const NOTEBOOK_BG: Record<CsNotebookStyle, string> = {
  grid: '#fafaf9',
  lined: '#fefefe',
  plain: '#ffffff',
};

export function ClassroomPageView({
  pageUrl,
  boardMode,
  notebookStyle,
  strokes,
}: {
  pageUrl: string | null;
  boardMode: 'pdf' | 'notebook';
  notebookStyle: CsNotebookStyle;
  strokes: CsStroke[];
  pageIndex: number;
}) {
  const [size, setSize] = useState({width: 0, height: 0});

  return (
    <View
      onLayout={e => setSize({width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height})}
      style={{width: '100%', aspectRatio: boardMode === 'pdf' ? 1600 / 2263 : 3 / 4}}>
      {boardMode === 'pdf' && pageUrl ? (
        <Image source={{uri: pageUrl}} style={{width: '100%', height: '100%'}} resizeMode="contain" />
      ) : (
        <View style={{width: '100%', height: '100%', backgroundColor: NOTEBOOK_BG[notebookStyle]}} />
      )}
      <ClassroomStrokeCanvas strokes={strokes} width={size.width} height={size.height} />
    </View>
  );
}
```

Note: the `1600/2263` aspect-ratio placeholder assumes a typical A4-proportioned page (matching `PDF_RENDER_WIDTH=1600` from the backend's `classroom.logic.ts`) before the actual image loads — if this causes visible layout jump once the real image dimensions differ, switch to `Image.getSize(pageUrl, ...)` to pre-fetch dimensions, or accept the minor reflow. Note in your report which approach you used.

- [ ] **Step 2: Implement `ClassroomZoomPan`**

Pinch-to-zoom + pan via `react-native-gesture-handler`, driving a Reanimated shared-value transform — architecturally simpler than web's DOM-scroll-container anchor math because Reanimated shared values update synchronously with the gesture, no layout-timing race to work around.

```tsx
import React, {useEffect} from 'react';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {MAX_ZOOM, MIN_ZOOM} from '../../types/classroom';

export function ClassroomZoomPan({
  zoom,
  synced,
  children,
}: {
  zoom: number;
  synced: boolean;
  onBreakSync: () => void;
  onResync: () => void;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (synced) {
      scale.value = withTiming(zoom);
      savedScale.value = zoom;
    }
  }, [synced, zoom, scale, savedScale]);

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.max(MIN_ZOOM, Math.min(savedScale.value * e.scale, MAX_ZOOM));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const style = useAnimatedStyle(() => ({
    transform: [{translateX: translateX.value}, {translateY: translateY.value}, {scale: scale.value}],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{flex: 1}, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
```

Note: `onBreakSync`/`onResync` props are declared in the interface for Task 8 to wire the "Move" toggle button's state, but this component doesn't call them itself (it's a pure gesture/transform wrapper) — Task 8's `ClassroomBoard` decides when the user has broken sync (e.g. detecting a pan/pinch gesture start) and calls `onBreakSync`. If threading that detection through cleanly turns out to need a callback from inside the gesture handlers, add `.onStart(() => runOnJS(onBreakSync)())` to the `pinch`/`pan` gestures — check whether `synced` prop is still true when the gesture starts, only call `onBreakSync` in that case. Use your judgment on the exact wiring and note your approach in the report.

- [ ] **Step 3: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && git add src/components/classroom/ClassroomPageView.tsx src/components/classroom/ClassroomZoomPan.tsx
git commit -m "feat: add classroom page view and pinch-zoom/pan gesture wrapper"
```

---

### Task 8: ClassroomBoard (pages list, scroll-sync, split-screen)

**Files:**
- Create: `apps/mobile/src/components/classroom/ClassroomBoard.tsx`

**Interfaces:**
- Consumes: `ClassroomPageView`, `ClassroomZoomPan` (Task 7), `ClassroomState` shape (Task 2), `useWindowDimensions` from `react-native` (built-in).
- Produces: `ClassroomBoard` component with props `{state: ClassroomState}` — consumed by Task 11 (`ClassroomScreen`).

- [ ] **Step 1: Implement the component**

Orchestrates: a `FlatList` of pages (one row per page, using `state.pages`/`state.currentPage`/`state.strokesByPage` for the left/single pane), scroll-position tracking to derive `{page, yRatio}` for local "free move" state (mobile never emits scroll back to the server — students are always receivers, never scroll-broadcasters), and split-screen layout driven by `useWindowDimensions()`.

```tsx
import React, {useCallback, useRef, useState} from 'react';
import {FlatList, Pressable, Text, View, useWindowDimensions} from 'react-native';
import {Move} from 'lucide-react-native';
import {ClassroomPageView} from './ClassroomPageView';
import {ClassroomZoomPan} from './ClassroomZoomPan';
import type {ClassroomState, CsBoardMode, CsStroke} from '../../types/classroom';

function Pane({
  pages,
  boardMode,
  notebookStyle,
  strokesByPage,
  zoom,
}: {
  pages: string[];
  boardMode: CsBoardMode;
  notebookStyle: ClassroomState['notebookStyle'];
  strokesByPage: Record<number, CsStroke[]>;
  zoom: number;
}) {
  const [synced, setSynced] = useState(true);
  const pageCount = boardMode === 'notebook' ? 4 : pages.length;
  const listData = Array.from({length: pageCount}, (_, i) => i + 1);

  return (
    <View style={{flex: 1}}>
      <ClassroomZoomPan zoom={zoom} synced={synced} onBreakSync={() => setSynced(false)} onResync={() => setSynced(true)}>
        <FlatList
          data={listData}
          keyExtractor={n => String(n)}
          renderItem={({item: pageNumber}) => (
            <ClassroomPageView
              pageUrl={boardMode === 'pdf' ? (pages[pageNumber - 1] ?? null) : null}
              boardMode={boardMode}
              notebookStyle={notebookStyle}
              strokes={strokesByPage[pageNumber] ?? []}
              pageIndex={pageNumber}
            />
          )}
        />
      </ClassroomZoomPan>
      {!synced && (
        <Pressable
          onPress={() => setSynced(true)}
          style={{position: 'absolute', bottom: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20}}>
          <Move size={16} color="white" />
          <Text style={{color: 'white', fontSize: 12, fontWeight: '600'}}>Ustozga qaytish</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ClassroomBoard({state}: {state: ClassroomState}) {
  const {width, height} = useWindowDimensions();
  const isLandscape = width > height;
  const showSplit = state.boardLayout === 'split' && isLandscape;
  const [activePane, setActivePane] = useState<'left' | 'right'>('left');

  if (state.boardLayout === 'split' && !showSplit) {
    return (
      <View style={{flex: 1}}>
        <Pane
          pages={activePane === 'left' ? state.pages : state.pages}
          boardMode={activePane === 'left' ? state.leftBoardMode : state.rightBoardMode}
          notebookStyle={state.notebookStyle}
          strokesByPage={activePane === 'left' ? state.strokesByPage : state.rightStrokesByPage}
          zoom={activePane === 'left' ? state.zoom : state.rightZoom}
        />
        <View style={{position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 8, overflow: 'hidden'}}>
          <Pressable onPress={() => setActivePane('left')} style={{paddingHorizontal: 12, paddingVertical: 6, backgroundColor: activePane === 'left' ? '#6366f1' : 'transparent'}}>
            <Text style={{color: 'white', fontSize: 11}}>Chap panel</Text>
          </Pressable>
          <Pressable onPress={() => setActivePane('right')} style={{paddingHorizontal: 12, paddingVertical: 6, backgroundColor: activePane === 'right' ? '#6366f1' : 'transparent'}}>
            <Text style={{color: 'white', fontSize: 11}}>O'ng panel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (showSplit) {
    return (
      <View style={{flex: 1, flexDirection: 'row'}}>
        <View style={{flex: 1, borderRightWidth: 1, borderRightColor: '#1e293b'}}>
          <Pane pages={state.pages} boardMode={state.leftBoardMode} notebookStyle={state.notebookStyle} strokesByPage={state.strokesByPage} zoom={state.zoom} />
        </View>
        <View style={{flex: 1}}>
          <Pane pages={state.pages} boardMode={state.rightBoardMode} notebookStyle={state.notebookStyle} strokesByPage={state.rightStrokesByPage} zoom={state.rightZoom} />
        </View>
      </View>
    );
  }

  return (
    <Pane pages={state.pages} boardMode={state.boardMode} notebookStyle={state.notebookStyle} strokesByPage={state.strokesByPage} zoom={state.zoom} />
  );
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && git add src/components/classroom/ClassroomBoard.tsx
git commit -m "feat: add classroom board with split-screen (orientation-driven) and free-move toggle"
```

---

### Task 9: Roster + mic control components

**Files:**
- Create: `apps/mobile/src/components/classroom/ClassroomRoster.tsx`
- Create: `apps/mobile/src/components/classroom/ClassroomMicControl.tsx`

**Interfaces:**
- Consumes: `CsParticipant` (Task 2), `useClassroomVoice`'s return shape (Task 5, passed in as props — these components don't call the hook themselves).
- Produces: `ClassroomRoster` component with props `{visible: boolean; onClose: () => void; participants: CsParticipant[]; activeSpeakerIds: Set<string>}`. `ClassroomMicControl` component with props `{micEnabled: boolean; voiceAvailable: boolean; onToggle: () => void}` — both consumed by Task 11 (`ClassroomScreen`).

- [ ] **Step 1: Implement `ClassroomRoster`**

Bottom sheet listing participants, matching the mobile app's existing bottom-sheet pattern (see `apps/mobile/src/components/CourseLeaderboardSheet.tsx` from Phase 1 for the established `Modal` + slide-up pattern).

```tsx
import React from 'react';
import {FlatList, Modal, Pressable, Text, View} from 'react-native';
import {Volume2, X} from 'lucide-react-native';
import type {CsParticipant} from '../../types/classroom';

const STATUS_LABELS: Record<CsParticipant['status'], string> = {
  present: 'Keldi',
  late: 'Kech keldi',
  absent: "Yo'q",
};

export function ClassroomRoster({
  visible,
  onClose,
  participants,
  activeSpeakerIds,
}: {
  visible: boolean;
  onClose: () => void;
  participants: CsParticipant[];
  activeSpeakerIds: Set<string>;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)'}}>
        <View style={{maxHeight: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 20}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
            <Text style={{fontSize: 18, fontWeight: '700'}}>Ishtirokchilar ({participants.length})</Text>
            <Pressable onPress={onClose} style={{height: 32, width: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9'}}>
              <X size={16} color="#64748b" />
            </Pressable>
          </View>
          <FlatList
            data={participants}
            keyExtractor={p => p.userId}
            renderItem={({item}) => (
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8}}>
                <View style={{height: 8, width: 8, borderRadius: 4, backgroundColor: item.online ? '#10b981' : '#cbd5e1'}} />
                <Text style={{flex: 1, fontSize: 14, fontWeight: '600'}}>{item.name}</Text>
                {activeSpeakerIds.has(item.userId) && <Volume2 size={16} color="#6366f1" />}
                <Text style={{fontSize: 11, color: '#94a3b8'}}>{STATUS_LABELS[item.status]}</Text>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Implement `ClassroomMicControl`**

```tsx
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Mic, MicOff} from 'lucide-react-native';

export function ClassroomMicControl({
  micEnabled,
  voiceAvailable,
  onToggle,
}: {
  micEnabled: boolean;
  voiceAvailable: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={!voiceAvailable}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        opacity: voiceAvailable ? 1 : 0.4,
        backgroundColor: micEnabled ? '#111827' : '#fee2e2',
      }}>
      {micEnabled ? <Mic size={18} color="white" /> : <MicOff size={18} color="#ef4444" />}
      <Text style={{fontSize: 13, fontWeight: '700', color: micEnabled ? 'white' : '#ef4444'}}>
        {micEnabled ? 'Mikrofon yoniq' : "Mikrofon o'chiq"}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && git add src/components/classroom/ClassroomRoster.tsx src/components/classroom/ClassroomMicControl.tsx
git commit -m "feat: add classroom roster sheet and mic toggle control"
```

---

### Task 10: Replay logic + audio-driven transport

**Files:**
- Create: `apps/mobile/src/hooks/useClassroomReplay.ts`
- Create: `apps/mobile/src/components/classroom/ClassroomReplayTransport.tsx`
- Test: `apps/mobile/__tests__/classroomReplay.test.ts`

**Interfaces:**
- Consumes: all `apply*` reducers (Task 2), `ClassReplayEvent`/`ClassroomState`/`CLASSROOM_INITIAL_STATE` (Task 2), `Video` from `react-native-video` (existing).
- Produces: `computeStateAt(events: ClassReplayEvent[], timeMs: number): ClassroomState` — pure function, testable. `useClassroomReplay(events: ClassReplayEvent[]): {state: ClassroomState; currentTimeMs: number; seek: (ms: number) => void; playing: boolean; togglePlay: () => void}`. `ClassroomReplayTransport` component — all consumed by Task 12 (`ClassroomReplayScreen`).

- [ ] **Step 1: Write the failing test for `computeStateAt`**

Create `apps/mobile/__tests__/classroomReplay.test.ts`:

```typescript
import {computeStateAt} from '../src/hooks/useClassroomReplay';
import type {ClassReplayEvent} from '../src/types/classroom';

function stroke(id: string) {
  return {id, tool: 'pen' as const, color: '#000', width: 4, points: [0.1, 0.1, 0.2, 0.2]};
}

describe('computeStateAt', () => {
  const events: ClassReplayEvent[] = [
    {type: 'pdf:set', payload: {pdfName: 'lesson.pdf', pages: ['a', 'b'], currentPage: 1}, atMs: 0},
    {type: 'stroke:add', payload: {page: 1, stroke: stroke('s1')}, atMs: 1000},
    {type: 'stroke:add', payload: {page: 1, stroke: stroke('s2')}, atMs: 2000},
    {type: 'page:set', payload: {page: 2}, atMs: 3000},
  ];

  it('returns initial state before any event', () => {
    const result = computeStateAt(events, -1);
    expect(result.pdfName).toBeNull();
    expect(result.currentPage).toBe(1);
  });

  it('applies only events up to and including the given time', () => {
    const result = computeStateAt(events, 1500);
    expect(result.pdfName).toBe('lesson.pdf');
    expect(result.strokesByPage[1]).toHaveLength(1);
    expect(result.strokesByPage[1][0].id).toBe('s1');
  });

  it('applies all events at or before the exact final timestamp', () => {
    const result = computeStateAt(events, 3000);
    expect(result.strokesByPage[1]).toHaveLength(2);
    expect(result.currentPage).toBe(2);
  });

  it('applies all events when timeMs exceeds the last event', () => {
    const result = computeStateAt(events, 999999);
    expect(result.strokesByPage[1]).toHaveLength(2);
    expect(result.currentPage).toBe(2);
  });

  it('ignores unrecognized event types without throwing', () => {
    const withUnknown: ClassReplayEvent[] = [...events, {type: 'unknown:event', payload: {}, atMs: 4000}];
    expect(() => computeStateAt(withUnknown, 5000)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/mobile && npx jest __tests__/classroomReplay.test.ts
```
Expected: FAIL — `Cannot find module '../src/hooks/useClassroomReplay'`.

- [ ] **Step 3: Implement `computeStateAt` and the hook**

Create `apps/mobile/src/hooks/useClassroomReplay.ts`. `computeStateAt` replays every event from the start up to `timeMs` through the same reducers as the live session — same pattern as web's `useClassroomReplay.ts`, deliberately recomputing from scratch on each call rather than maintaining incremental state (cheap given typical event counts, matches the web implementation's explicit YAGNI-on-compaction choice documented in its source comments).

```typescript
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  applyBoardSet,
  applyPageClear,
  applyPageSet,
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
import type {ClassReplayEvent, ClassroomState} from '../types/classroom';

const REDUCERS: Record<string, (s: ClassroomState, payload: any) => ClassroomState> = {
  'pdf:set': applyPdfSet,
  'board:set': applyBoardSet,
  'page:set': applyPageSet,
  'stroke:add': applyStrokeAdd,
  'stroke:update': applyStrokeUpdate,
  'stroke:textUpdate': applyStrokeTextUpdate,
  'stroke:shapeUpdate': applyStrokeShapeUpdate,
  'stroke:reorder': applyStrokeReorder,
  'stroke:undo': applyStrokeUndo,
  'stroke:split': applyStrokeSplit,
  'page:clear': applyPageClear,
};

export function computeStateAt(events: ClassReplayEvent[], timeMs: number): ClassroomState {
  let state = CLASSROOM_INITIAL_STATE;
  for (const event of events) {
    if (event.atMs > timeMs) break;
    const reducer = REDUCERS[event.type];
    if (reducer) state = reducer(state, event.payload);
  }
  return {...state, joined: true};
}

export function useClassroomReplay(events: ClassReplayEvent[]) {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const startTimeMsRef = useRef<number>(0);

  const lastEventMs = events.length > 0 ? events[events.length - 1].atMs : 0;

  useEffect(() => {
    if (!playing) return;
    startRef.current = Date.now();
    startTimeMsRef.current = currentTimeMs;
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const next = startTimeMsRef.current + elapsed;
      if (next >= lastEventMs) {
        setCurrentTimeMs(lastEventMs);
        setPlaying(false);
        return;
      }
      setCurrentTimeMs(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const seek = useCallback((ms: number) => {
    setCurrentTimeMs(Math.max(0, Math.min(ms, lastEventMs)));
  }, [lastEventMs]);

  const togglePlay = useCallback(() => setPlaying(p => !p), []);

  const state = computeStateAt(events, currentTimeMs);

  return {state, currentTimeMs, seek, playing, togglePlay, lastEventMs};
}
```

Note: this JS-`requestAnimationFrame`-based clock is the fallback path for when no recording audio exists (`recordingStatus !== 'ready'`), matching web's behavior. When a recording IS available, `ClassroomReplayTransport` (Step 4 below) drives the clock instead via the audio player's playback position — Task 12 (`ClassroomReplayScreen`) is responsible for choosing which clock source to use and calling `seek()` accordingly; this hook's own internal RAF loop is only active while nothing else is driving `seek()`.

- [ ] **Step 4: Implement `ClassroomReplayTransport`**

Play/pause + scrubber, using `react-native-video` in audio-only mode when a recording exists.

```tsx
import React, {useRef} from 'react';
import {Pressable, Text, View} from 'react-native';
import Video, {type VideoRef} from 'react-native-video';
import {Pause, Play} from 'lucide-react-native';

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ClassroomReplayTransport({
  recordingUrl,
  recordingStartedAtMs,
  currentTimeMs,
  lastEventMs,
  playing,
  onTogglePlay,
  onSeek,
  onAudioPositionMs,
}: {
  recordingUrl: string | null;
  recordingStartedAtMs: number | null;
  currentTimeMs: number;
  lastEventMs: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (ms: number) => void;
  onAudioPositionMs?: (ms: number) => void;
}) {
  const videoRef = useRef<VideoRef>(null);
  const offset = recordingStartedAtMs ?? 0;

  return (
    <View style={{padding: 16, backgroundColor: '#0f172a'}}>
      {recordingUrl && (
        <Video
          ref={videoRef}
          source={{uri: recordingUrl}}
          audioOnly
          paused={!playing}
          onProgress={e => onAudioPositionMs?.(e.currentTime * 1000 + offset)}
          style={{width: 0, height: 0}}
        />
      )}
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
        <Pressable onPress={onTogglePlay} style={{height: 40, width: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6366f1'}}>
          {playing ? <Pause size={18} color="white" /> : <Play size={18} color="white" />}
        </Pressable>
        <Text style={{color: 'white', fontSize: 12, fontVariant: ['tabular-nums']}}>
          {formatTime(currentTimeMs)} / {formatTime(lastEventMs)}
        </Text>
      </View>
    </View>
  );
}
```

Note: `<Video audioOnly>` sizing to `0x0` is a workaround since `react-native-video` is primarily built for visible playback — verify in Task 12's manual check that audio-only mode actually produces sound without requiring visible dimensions; if `react-native-video`'s actual API doesn't support a zero-size audio-only mode cleanly, check its docs for the correct pattern (some versions need a non-zero but hidden `style` instead) and adapt, noting the change in your report.

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
cd apps/mobile && npx jest __tests__/classroomReplay.test.ts
```
Expected: PASS, 5 tests passed.

- [ ] **Step 6: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors. If `react-native-video`'s actual exported types differ (e.g. `audioOnly` prop name, `onProgress` payload shape, `VideoRef` type name), adjust to match — check `node_modules/react-native-video/src/types/video.ts` if errors appear.

- [ ] **Step 7: Commit**

```bash
cd apps/mobile && git add src/hooks/useClassroomReplay.ts src/components/classroom/ClassroomReplayTransport.tsx __tests__/classroomReplay.test.ts
git commit -m "feat: add replay state computation and audio-driven transport controls"
```

---

### Task 11: ClassroomScreen (live classroom)

**Files:**
- Create: `apps/mobile/src/screens/ClassroomScreen.tsx`
- Modify: `apps/mobile/src/navigation/types.ts`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `useClassroomSession` (Task 4), `useClassroomVoice` (Task 5), `ClassroomBoard` (Task 8), `ClassroomRoster`/`ClassroomMicControl` (Task 9), `useAuthStore` (existing).
- Produces: `ClassroomScreen` registered as the `Classroom` route, taking `{sessionId: string}` params — this is the navigation target Task 13 wires up from `CourseScreen`/`LiveClassBanner`.

- [ ] **Step 1: Add the navigation route type**

Modify `apps/mobile/src/navigation/types.ts` — read the current file first (Phase 1 already modified it; confirm its exact current contents before editing) and add:

```typescript
Classroom: {sessionId: string};
ClassroomReplay: {sessionId: string};
```

to the `RootStackParamList` type (alongside the existing `Login`, `Main`, `Course`, `Web`, `Chat` entries).

- [ ] **Step 2: Implement the screen**

Handles: guest-name entry for free/unauthenticated sessions (mobile users are always authenticated per Phase 1's student-only login — but a session could still be a "free" one a logged-in student joins, in which case no guest form is needed; the guest-name form path only matters if mobile ever supports deep-linking an unauthenticated user into a `/classroom/free/:id`-style link, which is out of scope for this phase's navigation wiring — mobile always has a token from `useAuthStore` since there's no unauthenticated entry point into this screen), join error states, and the ended state.

```tsx
import React, {useMemo} from 'react';
import {Alert, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/types';
import {useClassroomSession} from '../hooks/useClassroomSession';
import {useClassroomVoice} from '../hooks/useClassroomVoice';
import {ClassroomBoard} from '../components/classroom/ClassroomBoard';
import {ClassroomRoster} from '../components/classroom/ClassroomRoster';
import {ClassroomMicControl} from '../components/classroom/ClassroomMicControl';
import {Loading, Screen} from '../components/Ui';
import {useAuthStore} from '../store/authStore';

const ERROR_MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND: 'Dars topilmadi',
  NOT_ENROLLED: 'Siz bu kursga yozilmagansiz',
  UNAUTHORIZED: "Kirish huquqingiz yo'q",
  GUEST_NAME_REQUIRED: 'Ism kiritish talab qilinadi',
};

type Props = NativeStackScreenProps<RootStackParamList, 'Classroom'>;

export function ClassroomScreen({route, navigation}: Props) {
  const {sessionId} = route.params;
  const {state} = useClassroomSession(sessionId);
  const user = useAuthStore(s => s.user);
  const voiceSessionId = state.joined && !state.ended && user ? sessionId : undefined;
  const voice = useClassroomVoice(voiceSessionId);
  const [rosterOpen, setRosterOpen] = React.useState(false);

  const errorMessage = useMemo(() => (state.error ? ERROR_MESSAGES[state.error] ?? 'Xatolik yuz berdi' : null), [state.error]);

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
      <ClassroomBoard state={state} />
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12}}>
        {user && (
          <ClassroomMicControl
            micEnabled={voice.micEnabled}
            voiceAvailable={voice.voiceAvailable}
            onToggle={() => void voice.toggleMic()}
          />
        )}
        <Text onPress={() => setRosterOpen(true)} style={{color: 'white', fontSize: 12, fontWeight: '600'}}>
          {state.participants.length} ishtirokchi
        </Text>
      </View>
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

- [ ] **Step 3: Register the route**

Modify `apps/mobile/src/navigation/RootNavigator.tsx` — read the current file first (Phase 1's Task 9 already rewrote this file; confirm its exact current structure before editing). Add a new `Stack.Screen` entry for `Classroom` inside the authenticated (`token` truthy) branch, alongside the existing `Course`/`Web`/`Chat` screens:

```tsx
<Stack.Screen
  name="Classroom"
  component={ClassroomScreen}
  options={{title: 'Jonli dars', headerShown: false}}
/>
```

and add the corresponding import (`import {ClassroomScreen} from '../screens/ClassroomScreen';`) at the top of the file.

- [ ] **Step 4: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd apps/mobile && git add src/screens/ClassroomScreen.tsx src/navigation/types.ts src/navigation/RootNavigator.tsx
git commit -m "feat: add live classroom screen with join/error/ended states"
```

---

### Task 12: ClassroomReplayScreen

**Files:**
- Create: `apps/mobile/src/screens/ClassroomReplayScreen.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `apiClassReplay` (Task 3), `useClassroomReplay` (Task 10), `ClassroomBoard` (Task 8), `ClassroomReplayTransport` (Task 10).
- Produces: `ClassroomReplayScreen` registered as the `ClassroomReplay` route.

- [ ] **Step 1: Implement the screen**

```tsx
import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/types';
import type {ClassReplayData} from '../types/classroom';
import {apiClassReplay} from '../api/classroom';
import {useClassroomReplay} from '../hooks/useClassroomReplay';
import {ClassroomBoard} from '../components/classroom/ClassroomBoard';
import {ClassroomReplayTransport} from '../components/classroom/ClassroomReplayTransport';
import {Loading, Screen} from '../components/Ui';
import {getApiErrorMessage} from '../lib/errors';

type Props = NativeStackScreenProps<RootStackParamList, 'ClassroomReplay'>;

export function ClassroomReplayScreen({route}: Props) {
  const {sessionId} = route.params;
  const [data, setData] = useState<ClassReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClassReplay(sessionId)
      .then(result => {
        if (active) setData(result);
      })
      .catch(err => {
        if (active) setError(getApiErrorMessage(err, "Yozuvni yuklab bo'lmadi"));
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const replay = useClassroomReplay(data?.historyEvents ?? []);
  const hasRecording = data?.recordingStatus === 'ready' && Boolean(data.recordingUrl);

  if (error) {
    return (
      <Screen>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}}>
          <Text style={{fontSize: 14, fontWeight: '700', textAlign: 'center'}}>{error}</Text>
        </View>
      </Screen>
    );
  }

  if (!data) return <Loading />;

  return (
    <View style={{flex: 1, backgroundColor: '#0f172a'}}>
      <ClassroomBoard
        state={{
          ...replay.state,
          pdfName: data.pdfName,
          pages: data.pdfPages,
        }}
      />
      <ClassroomReplayTransport
        recordingUrl={hasRecording ? data.recordingUrl : null}
        recordingStartedAtMs={data.recordingStartedAtMs}
        currentTimeMs={replay.currentTimeMs}
        lastEventMs={replay.lastEventMs}
        playing={replay.playing}
        onTogglePlay={replay.togglePlay}
        onSeek={replay.seek}
        onAudioPositionMs={hasRecording ? replay.seek : undefined}
      />
    </View>
  );
}
```

Note: when `hasRecording` is true, `onAudioPositionMs` is wired directly to `replay.seek`, meaning the audio player's own progress events drive the reducer-computed state (matching web's "audio becomes the time source" design) — this means `useClassroomReplay`'s internal RAF-based clock (Task 10) is effectively superseded whenever audio is playing, since `seek()` calls arriving from `onProgress` overwrite `currentTimeMs` continuously. Verify in manual testing (Task 13) that this doesn't fight with the RAF loop when both could theoretically run — if you observe stuttering or clock fighting, gate the RAF `useEffect` in `useClassroomReplay` on an `hasExternalClock` flag passed in, and note the fix in your report.

- [ ] **Step 2: Register the route**

Add to `apps/mobile/src/navigation/RootNavigator.tsx` (same authenticated branch as Task 11's `Classroom` route):

```tsx
<Stack.Screen
  name="ClassroomReplay"
  component={ClassroomReplayScreen}
  options={{title: 'Dars yozuvi', headerShown: false}}
/>
```

plus the corresponding import.

- [ ] **Step 3: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && git add src/screens/ClassroomReplayScreen.tsx src/navigation/RootNavigator.tsx
git commit -m "feat: add classroom replay screen with audio-driven scrubbing"
```

---

### Task 13: Wire up navigation targets (CourseScreen, LiveClassBanner)

**Files:**
- Modify: `apps/mobile/src/screens/CourseScreen.tsx`
- Modify: `apps/mobile/src/components/LiveClassBanner.tsx`

**Interfaces:**
- Consumes: the `Classroom`/`ClassroomReplay` routes (Task 11/12).

Per Phase 1's design doc (resolved decision #2/#3), `CourseScreen.tsx`'s `openLiveClassReplay` and `LiveClassBanner`'s live-session tap currently navigate to the `Web` fallback route as a placeholder, specifically because this Classroom phase hadn't landed yet. This task replaces those placeholders with the real native destinations now that they exist.

- [ ] **Step 1: Update `CourseScreen.tsx`**

Read the current file first (Phase 1's Task 8 wrote it). Find the `openLiveClassReplay` function (currently navigates to `Web` with a `classroom-history/:sessionId/replay` path) and change it to:

```typescript
function openLiveClassReplay(classSessionId: string) {
  navigation.navigate('ClassroomReplay', {sessionId: classSessionId});
}
```

Also find `startPractice`/`viewSubmission` — these remain pointed at `Web` (they're Test-taking phase concerns, not Classroom), do not change them.

- [ ] **Step 2: Update `LiveClassBanner.tsx`**

Read the current file first (Phase 1's Task 9 wrote it). Find the `onPress` handler that currently navigates to `Web` with a `/classroom/:id` path, and change it to:

```typescript
onPress={() =>
  navigation.navigate('Classroom', {sessionId: session.id})
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && git add src/screens/CourseScreen.tsx src/components/LiveClassBanner.tsx
git commit -m "feat: point classroom/replay navigation targets at native screens"
```

---

### Task 14: Full manual regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck and test suite**

Run:
```bash
cd apps/mobile && npx tsc --noEmit && npx jest
```
Expected: zero type errors, all Jest suites pass (including the 18 new classroom tests: 13 reducer + 5 replay, plus all pre-existing Phase 1 tests).

- [ ] **Step 2: Run lint**

Run:
```bash
cd apps/mobile && npm run lint
```
Expected: no new errors (warnings acceptable if matching pre-existing patterns).

- [ ] **Step 3: Launch the app via the `run` skill and walk the full classroom flow**

This requires a real backend session with an active teacher-hosted class to join against (a teacher needs to start a class from the web app first) — coordinate with the user for this if a test class isn't already available. Walk through:
1. From Courses → open a course with a `live_class` content block or an active-session banner → tap into the live classroom.
2. Confirm the PDF/notebook page renders with the teacher's live strokes appearing in real time as the teacher draws (pen, highlighter, arrow, rectangle/ellipse, text) — verify pen/highlighter/arrow at minimum; note if hachure-fill shapes or rotated text look visually degraded (expected per Task 6's documented scope reduction).
3. Pinch-zoom and pan; confirm zoom stays within `[1, 4]`. Tap away from synced position, confirm the "Ustozga qaytish" (return to sync) button appears and works.
4. If the teacher enables split-screen: rotate the device to landscape, confirm both panes render side-by-side; rotate back to portrait, confirm the pane-switch UI appears and works.
5. Confirm the participant roster opens, shows online/offline dots and status labels, and shows a speaking indicator when the teacher talks (if voice is configured server-side).
6. Toggle the mic on/off; confirm the teacher can see the state change on their end (if testable) and that a server-side force-mute (if the teacher does this) reflects back to the mic button.
7. Background the app (home button / app switcher) while connected — confirm voice audio continues playing; foreground again — confirm the board resyncs (new strokes since backgrounding appear).
8. Have the teacher end the class — confirm the "Dars yakunlandi" screen appears.
9. Navigate to a `classroom-history` replay for a past session — confirm pages/strokes render progressively as you scrub or play, confirm audio plays in sync if a recording exists, confirm play/pause and the time display work.
10. Test a join failure path if feasible (e.g. a session ID for a course the test account isn't enrolled in) — confirm the `NOT_ENROLLED` error message displays correctly.

Expected: every step above works as described; note and fix any regression found before considering Phase 6 done.

- [ ] **Step 4: Final commit if any fixes were needed during manual pass**

If Step 3 surfaced fixes, make them, then:
```bash
cd apps/mobile && git add -A
git commit -m "fix: address issues found in phase 6 manual regression pass"
```

If no fixes were needed, skip this step.

---

## Self-Review Notes

- **Spec coverage:** ported reducers/types ✅ (Task 2), REST + socket clients ✅ (Task 3), session hook with AppState re-join ✅ (Task 4), LiveKit voice with no device picker ✅ (Task 5), Skia stroke rendering ✅ (Task 6), zoom/pan gesture layer ✅ (Task 7), orientation-driven split-screen ✅ (Task 8), roster + mic UI ✅ (Task 9), replay computation + audio-driven transport ✅ (Task 10), live screen with join/error/ended states ✅ (Task 11), replay screen ✅ (Task 12), navigation wiring replacing the `Web` placeholders ✅ (Task 13), manual verification ✅ (Task 14).
- **Known, intentionally documented scope reductions** (flagged inline in Task 6, not oversights): hachure/cross-hatch shape fills render as solid fills; text rotation is not applied; dashed/dotted stroke styles render as solid. These affect visual fidelity of teacher-drawn shapes/text only, not the core "see the teacher's strokes and follow along" experience. If Task 14's manual pass finds these matter in practice, they're incremental additions to `ClassroomStrokeCanvas.tsx`, not architectural changes.
- **Type consistency check:** `ClassroomState`, `CsStroke`, `CsSnapshot`, `CsParticipant`, `CsScrollPosition` are defined once in Task 2's `src/types/classroom.ts` and referenced identically (same names, same shapes) by every later task — verified no task redefines or diverges from these.
- **`hostActions` correctly never appears anywhere in this plan** — confirms the student-only scope boundary from the spec's Global Constraints is honored throughout, not just stated once.
