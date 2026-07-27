# Classroom Split-Panel Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the classroom board's split-screen layout be resized via a draggable divider — the teacher's resize is synced live to all students; a student in free-move mode can independently resize on their own screen only.

**Architecture:** Add `splitRatio` to the in-memory classroom session (backend), following the exact pattern already used for `zoom` (session field → socket event → history event → broadcast). On the frontend, thread `splitRatio` through `useClassroomSession` the same way `zoom` is threaded, then update `ClassroomPdfViewer` to use it as the two panes' `flex-basis` (instead of a hardcoded 50/50) and add a draggable divider between them.

**Tech Stack:** NestJS, Socket.IO, React, TypeScript, Jest.

## Global Constraints

- Split ratio is clamped to `[0.2, 0.8]` everywhere it's set (backend service, frontend drag handler) — never allow a pane to shrink to zero or explode past 80%.
- No changes to zoom, scroll, or stroke sync logic — this only adds one new synced number (`splitRatio`) following the existing `zoom` pattern.
- No changes to the single (non-split) layout — the divider and ratio only apply when `displayLayout === "split"`.
- No persistence beyond the in-memory session (matches `zoom`/`scroll` — not stored in Postgres, only in the live session and its history-event replay log).
- All new user-facing behavior only appears in the split layout; nothing here changes copy/strings (no new UI text is introduced by this feature).

---

## File Structure

- Modify `apps/backend/src/classroom/classroom.types.ts`: add `splitRatio` to `ClassroomSession` and `ClassroomSnapshot`.
- Modify `apps/backend/src/classroom/classroom.logic.ts`: populate `splitRatio` in `buildSnapshot`.
- Modify `apps/backend/src/classroom/classroom.service.ts`: add `setSplitRatio` method.
- Modify `apps/backend/src/classroom/classroom.service.spec.ts`: add tests for `setSplitRatio`.
- Modify `apps/backend/src/classroom/classroom.gateway.ts`: add `host:setSplitRatio` handler.
- Modify `apps/frontend/src/api/classroom.ts`: add `splitRatio` to `CsSnapshot`.
- Modify `apps/frontend/src/hooks/useClassroomSession.ts`: add `splitRatio` state, socket listener, and `setSplitRatio` host action.
- Modify `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`: add `hostSplitRatio`/`onSetSplitRatio` props, local free-move split state, pane `flex-basis`, and the draggable divider.
- Modify `apps/frontend/src/pages/ClassroomHostPage.tsx` and `apps/frontend/src/pages/ClassroomStudentPage.tsx`: pass the new props through.

---

## Task 1: Backend Session State and Snapshot

**Files:**
- Modify: `apps/backend/src/classroom/classroom.types.ts`
- Modify: `apps/backend/src/classroom/classroom.logic.ts`
- Test: `apps/backend/src/classroom/classroom.logic.spec.ts`

**Interfaces:**
- Consumes: none
- Produces: `ClassroomSession.splitRatio?: number`, `ClassroomSnapshot.splitRatio: number` — consumed by Task 2 (`classroom.service.ts`).

- [ ] **Step 1: Write a failing test for the snapshot default**

Read `apps/backend/src/classroom/classroom.logic.spec.ts` first to see its existing session-fixture pattern (look for how other tests construct a minimal `ClassroomSession` and call `buildSnapshot`). Add a test near the existing snapshot-related tests:

```ts
it('snapshot defaults splitRatio to 0.5 when not set on the session', () => {
  const session = makeSession(); // use this file's existing session-fixture helper
  const snap = buildSnapshot(session);
  expect(snap.splitRatio).toBe(0.5);
});

it('snapshot reflects a custom splitRatio set on the session', () => {
  const session = makeSession();
  session.splitRatio = 0.65;
  const snap = buildSnapshot(session);
  expect(snap.splitRatio).toBe(0.65);
});
```

(Replace `makeSession()` with whatever this spec file's actual fixture-construction helper is named — read the file to find it before writing this step for real.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: FAIL — `snap.splitRatio` is `undefined`, not `0.5`/`0.65` (the field doesn't exist yet).

- [ ] **Step 3: Add `splitRatio` to the types**

In `apps/backend/src/classroom/classroom.types.ts`, add to the `ClassroomSession` interface, right after the existing `rightZoom?: number;` line:

```ts
  // Split panelning chap qismi umumiy kenglikka nisbatan ulushi (0.2-0.8
  // oralig'ida cheklangan). Kech kirgan o'quvchiga snapshot orqali,
  // hozir ulanganlarga broadcast orqali yetkaziladi — xuddi zoom kabi.
  splitRatio?: number;
```

Add to the `ClassroomSnapshot` interface, right after the existing `rightZoom: number;` line:

```ts
  splitRatio: number;
```

- [ ] **Step 4: Populate it in `buildSnapshot`**

In `apps/backend/src/classroom/classroom.logic.ts`, find the `buildSnapshot` function's return object (it currently has `zoom: session.zoom,` and `rightZoom: session.rightZoom ?? session.zoom,` near the top of the returned object). Add, right after `rightZoom: session.rightZoom ?? session.zoom,`:

```ts
    splitRatio: session.splitRatio ?? 0.5,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: PASS (all tests including the 2 new ones)

- [ ] **Step 6: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/classroom/classroom.types.ts apps/backend/src/classroom/classroom.logic.ts apps/backend/src/classroom/classroom.logic.spec.ts
git commit -m "feat(classroom): add splitRatio to session state and snapshot"
```

---

## Task 2: Backend Service Method and Gateway Handler

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts`
- Modify: `apps/backend/src/classroom/classroom.service.spec.ts`
- Modify: `apps/backend/src/classroom/classroom.gateway.ts`

**Interfaces:**
- Consumes: `ClassroomSession.splitRatio` (Task 1)
- Produces: `ClassroomService.setSplitRatio(sessionId: string, userId: string, ratio: number): void`, socket event `host:setSplitRatio` (request) and `splitRatio:set` (broadcast, payload `{ ratio: number }`) — consumed by Task 3 (frontend `useClassroomSession.ts`).

- [ ] **Step 1: Write failing tests for `setSplitRatio`**

Read `apps/backend/src/classroom/classroom.service.spec.ts`'s existing `setZoom` tests (search for `service.setZoom`) to match its exact style, then add tests near them, inside the same `describe` block that has access to the `withPdf()` helper:

```ts
it('host split kenglikni ozgartirsa splitRatio:set broadcast va tarixga yoziladi', async () => {
  const { service, events, sessionId } = await withPdf();
  service.setSplitRatio(sessionId, 'teacher-1', 0.65);
  expect(events.at(-1)).toMatchObject({ event: 'splitRatio:set', payload: { ratio: 0.65 } });
  expect(service.getHistoryEventsForTests(sessionId).map((event) => event.type)).toContain('splitRatio:set');
});

it('splitRatio 0.2 dan 0.8 gacha chegaralanadi', async () => {
  const { service, sessionId } = await withPdf();
  service.setSplitRatio(sessionId, 'teacher-1', 0.05);
  expect(service.getHistoryEventsForTests(sessionId).at(-1)).toMatchObject({ payload: { ratio: 0.2 } });
  service.setSplitRatio(sessionId, 'teacher-1', 0.95);
  expect(service.getHistoryEventsForTests(sessionId).at(-1)).toMatchObject({ payload: { ratio: 0.8 } });
});

it('host bolmagan foydalanuvchi splitRatio ozgartira olmaydi', async () => {
  const { service, sessionId } = await withPdf();
  expect(() => service.setSplitRatio(sessionId, 'stu-1', 0.65)).toThrow();
});

it('kech kirgan ustoz snapshot orqali saqlangan splitRatio ni oladi', async () => {
  const { service, sessionId } = await withPdf();
  service.setSplitRatio(sessionId, 'teacher-1', 0.7);
  const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
  expect(snapshot.splitRatio).toBe(0.7);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: FAIL — `service.setSplitRatio` is not a function.

- [ ] **Step 3: Implement `setSplitRatio` in the service**

In `apps/backend/src/classroom/classroom.service.ts`, find the existing `setZoom` method (search for `setZoom(sessionId: string, userId: string, zoom: number`) and add a new method right after it, following the exact same shape:

```ts
  // Split panel kengligi — ustozning belgilagan nisbati (chap panel
  // ulushi). Kech kirganlarga snapshot orqali, hozir ulanganlarga
  // broadcast orqali yetkaziladi.
  setSplitRatio(sessionId: string, userId: string, ratio: number): void {
    const s = this.requireHost(sessionId, userId);
    const clamped = Math.min(0.8, Math.max(0.2, ratio));
    s.splitRatio = clamped;
    const payload = { ratio: clamped };
    this.recordHistoryEvent(s, 'splitRatio:set', payload);
    this.broadcaster.toRoom(s.id, 'splitRatio:set', payload);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: PASS (all tests including the 4 new ones)

- [ ] **Step 5: Add the gateway handler**

In `apps/backend/src/classroom/classroom.gateway.ts`, find the existing `host:setZoom` handler (search for `@SubscribeMessage('host:setZoom')`) and add a new handler right after it, following the exact same shape:

```ts
  @SubscribeMessage('host:setSplitRatio')
  setSplitRatio(@MessageBody() body: BaseBody & { ratio: number }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setSplitRatio(body.sessionId, user.sub, body.ratio);
    });
  }
```

- [ ] **Step 6: Verify backend builds and full suite passes**

Run: `npm run build --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: build exit `0`; all test suites pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.service.spec.ts apps/backend/src/classroom/classroom.gateway.ts
git commit -m "feat(classroom): add setSplitRatio service method and socket handler"
```

---

## Task 3: Frontend Session Hook

**Files:**
- Modify: `apps/frontend/src/api/classroom.ts`
- Modify: `apps/frontend/src/hooks/useClassroomSession.ts`

**Interfaces:**
- Consumes: `host:setSplitRatio` emit, `splitRatio:set` socket event, `CsSnapshot.splitRatio` (Task 2's broadcast shape)
- Produces: `ClassroomState.splitRatio: number`, `hostActions.setSplitRatio(ratio: number): void` — consumed by Task 4 (`ClassroomPdfViewer.tsx` via the host/student pages).

- [ ] **Step 1: Add `splitRatio` to `CsSnapshot`**

In `apps/frontend/src/api/classroom.ts`, find the `CsSnapshot` interface (search for `export interface CsSnapshot`) and add, right after the existing `rightZoom?: number;` line:

```ts
  splitRatio: number;
```

- [ ] **Step 2: Add `splitRatio` to `ClassroomState` and its default**

In `apps/frontend/src/hooks/useClassroomSession.ts`, find the `ClassroomState` interface (search for `export interface ClassroomState`) and add, right after the existing `rightZoom: number;` line:

```ts
  splitRatio: number;
```

Find the `INITIAL` constant (search for `const INITIAL: ClassroomState`) and add `splitRatio: 0.5,` to it, right after `rightZoom: 1,`.

- [ ] **Step 3: Populate `splitRatio` when joining**

In the same file, find the `setState({...})` call inside the `join()` function's success callback (search for `zoom: snap.zoom ?? 1,`). Add, right after the existing `rightZoom: snap.rightZoom ?? snap.zoom ?? 1,` line:

```ts
            splitRatio: snap.splitRatio ?? 0.5,
```

- [ ] **Step 4: Add the socket listener**

In the same file, find the existing `socket.on("zoom:set", ...)` listener registration and add, right after it:

```ts
    socket.on("splitRatio:set", (p: { ratio: number }) => setState((s) => ({ ...s, splitRatio: p.ratio })));
```

Find the matching cleanup block (the `return () => { socket.off(...) ... }` inside the same effect) and add, right after the existing `socket.off("zoom:set");` line:

```ts
      socket.off("splitRatio:set");
```

- [ ] **Step 5: Add the host action**

In the same file, find the `hostActions` object's `setZoom` entry (search for `setZoom: (zoom: number, pane`) and add, right after it:

```ts
    setSplitRatio: (ratio: number) => emitHost("host:setSplitRatio", { ratio }),
```

- [ ] **Step 6: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/api/classroom.ts apps/frontend/src/hooks/useClassroomSession.ts
git commit -m "feat(classroom): thread splitRatio through useClassroomSession"
```

---

## Task 4: ClassroomPdfViewer Draggable Divider

**Files:**
- Modify: `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`

**Interfaces:**
- Consumes: `hostSplitRatio: number` prop, `onSetSplitRatio?: (ratio: number) => void` prop (Task 3's `hostActions.setSplitRatio`, passed down by Task 5's page wiring)
- Produces: pane widths driven by an effective split ratio instead of a hardcoded 50/50; a draggable divider between the two split panes.

This is the largest task — it touches one file in several places. Read the whole `ClassroomPdfViewer.tsx` split-layout section (roughly lines 2740-3190) before starting, so the new code composes correctly with the existing `synced`/`displayLayout`/`freeToMove` state.

- [ ] **Step 1: Add the two new props to the `Props` interface**

Find the `Props` interface (search for `interface Props {`). Add, right after the existing `rightHostZoom?: number;` line:

```ts
  // Split panel chap qismining umumiy kenglikka nisbati (0.2-0.8). Ustoz
  // uchun boshlang'ich qiymat, keyin local boshqariladi (onSetSplitRatio
  // orqali serverga yuboriladi). Berilmasa 0.5 (teng) ishlatiladi.
  hostSplitRatio?: number;
  onSetSplitRatio?: (ratio: number) => void;
```

- [ ] **Step 2: Destructure the new props with a default**

Find the function signature's destructuring (search for `export function ClassroomPdfViewer({`). In the line that currently reads:

```ts
  hostScroll, rightHostScroll = null, onScrollChange, onPaneScrollChange, rightHostZoom = hostZoom, onPaneZoomChange, tool, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange, shapeStyle, onShapeStyleChange, onUpdateShapeStroke, onPaneUpdateShapeStroke, onReorderStroke, onPaneReorderStroke, onStrokeComplete, onMoveStroke, onPaneMoveStroke, onPaneStrokeComplete, onPointerMove,
```

change it to also destructure the two new props (append at the end of that same line, before the trailing comma stays as-is):

```ts
  hostScroll, rightHostScroll = null, onScrollChange, onPaneScrollChange, rightHostZoom = hostZoom, onPaneZoomChange, tool, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange, shapeStyle, onShapeStyleChange, onUpdateShapeStroke, onPaneUpdateShapeStroke, onReorderStroke, onPaneReorderStroke, onStrokeComplete, onMoveStroke, onPaneMoveStroke, onPaneStrokeComplete, onPointerMove, hostSplitRatio = 0.5, onSetSplitRatio,
```

- [ ] **Step 3: Add local split-ratio state and the effective ratio**

Find the existing `const [synced, setSynced] = useState(!noSync);` line (inside the component body). Add, right after it:

```ts
  // Split panel kengligi: ustoz uchun hostSplitRatio to'g'ridan-to'g'ri
  // serverdan boshqariladi (onSetSplitRatio orqali). O'quvchi sinxron
  // (synced) bo'lsa ham hostSplitRatio'ga qarab ko'radi. O'quvchi erkin
  // harakatlanish (move) rejimida bo'lsa, localSplitRatio'ni mustaqil
  // sudraydi — bu qiymat serverga hech qachon yuborilmaydi.
  const [localSplitRatio, setLocalSplitRatio] = useState(hostSplitRatio);
  const effectiveSplitRatio = isHost || synced ? hostSplitRatio : localSplitRatio;
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
```

Find the existing effect that resets `displayMode`/`displayLayout` when synced (search for `if (isHost || synced) {\n      setDisplayMode(boardMode); setDisplayLayout(boardLayout);`). Add a sibling effect right after that `useEffect` block closes, to keep `localSplitRatio` following the host whenever the student re-syncs:

```ts
  useEffect(() => {
    if (isHost || synced) setLocalSplitRatio(hostSplitRatio);
  }, [isHost, synced, hostSplitRatio]);
```

- [ ] **Step 4: Add the drag handlers**

Add this function near the other handler functions in the component body (a good spot is right after the `effectiveSplitRatio`/`splitContainerRef` declarations from Step 3):

```ts
  const canDragSplit = isHost || !synced;

  const handleSplitPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canDragSplit) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setIsDraggingSplit(true);
  };

  const handleSplitPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const raw = (event.clientX - rect.left) / rect.width;
    const clamped = Math.min(0.8, Math.max(0.2, raw));
    if (isHost) onSetSplitRatio?.(clamped);
    else setLocalSplitRatio(clamped);
  };

  const handleSplitPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit) return;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    setIsDraggingSplit(false);
  };
```

- [ ] **Step 5: Attach `splitContainerRef` to the split container**

Find the split/monolith container div (search for `className={\`w-full h-full overscroll-contain`). Its `ref` callback currently only sets `scrollRef.current`/`setZoomNode` when `displayLayout !== "split"`. Change the `ref` callback to also assign `splitContainerRef.current` unconditionally, since we need this container's width in split mode too:

Find:

```tsx
              ref={(element) => {
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
```

Replace with:

```tsx
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
```

- [ ] **Step 6: Replace the hardcoded 50/50 `flex` with the effective ratio, and insert the divider**

Find the pane's inline `style` object in split mode (search for `// Split panelning o'zi doim 50/50 qoladi. Zoom faqat`). The block currently reads:

```tsx
              style={displayLayout === "split"
                ? {
                    // Split panelning o'zi doim 50/50 qoladi. Zoom faqat
                    // ichki kontentga beriladi, aks holda chap panel zoomida
                    // butun split layout kengayib ketadi.
                    flex: "1 1 0%",
                    touchAction: freeToMove ? "pan-x pan-y" : "none",
```

Replace the `flex: "1 1 0%",` line with:

```tsx
                    // Split panellar hostSplitRatio (yoki move rejimida
                    // localSplitRatio)ga mos ravishda kenglashadi/torayadi —
                    // grow/shrink 0 qilib, faqat flex-basis orqali aniq
                    // nisbatni belgilaymiz.
                    flex: `0 0 ${(paneIndex === 0 ? effectiveSplitRatio : 1 - effectiveSplitRatio) * 100}%`,
```

Now find the closing of the `.map((paneMode, paneIndex) => (` block for panes — the divider needs to render between pane 0 and pane 1. Locate this exact structure (the pane's outer `<div>` closes, then the `.map()` closes):

```tsx
              </div>
            </div>
          ))}
        </div>
      </div>
```

Change the `.map()` call to render the divider as a sibling right after pane 0's closing `</div>` (but only in split mode, and only between the two panes — not after pane 1). Find the `.map()` opening:

```tsx
          {(displayLayout === "split" ? [leftMode, rightMode] : [displayMode]).map((paneMode, paneIndex) => (
```

Change the render to use an explicit `React.Fragment` (not the `<>` shorthand — the shorthand cannot take a `key`, and each iteration of a `.map()` needs one on its outermost returned element) so each iteration can optionally emit the divider after itself. First, move the `key` from the inner pane `<div>` to the new wrapping `Fragment`. Find:

```tsx
          {(displayLayout === "split" ? [leftMode, rightMode] : [displayMode]).map((paneMode, paneIndex) => (
            <div
              key={`${paneMode}-${paneIndex}`}
```

Replace with:

```tsx
          {(displayLayout === "split" ? [leftMode, rightMode] : [displayMode]).map((paneMode, paneIndex) => (
            <Fragment key={`${paneMode}-${paneIndex}`}>
            <div
```

Then update the file's first line (the `react` import), which currently reads:

```ts
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
```

Change it to:

```ts
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
```

And change the end of that same mapped block from:

```tsx
              </div>
            </div>
          ))}
        </div>
      </div>
```

to:

```tsx
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
                className={`h-full shrink-0 transition-all ${canDragSplit ? "w-1.5 cursor-col-resize bg-gray-200/70 hover:w-2 hover:bg-indigo-300" : "w-px cursor-default bg-gray-200/70"}`}
              />
            )}
            </Fragment>
          ))}
        </div>
      </div>
```

- [ ] **Step 7: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 8: Manual verification in the browser**

Run `npm run dev:backend` and `npm run dev:frontend`. As the teacher, open a classroom session, switch to split layout, and drag the new divider between the two panes — confirm the panes resize smoothly and stay within roughly 20%/80% bounds. Open the same session as a student in a second browser/tab: confirm the student's panes resize to match the teacher's drag in real time. Toggle the student's sync off (free-move) and drag the divider on the student's side — confirm only the student's own view changes, and the teacher's view is unaffected. Toggle sync back on and confirm the student's split snaps back to match the teacher's current ratio.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx
git commit -m "feat(classroom): add draggable split-panel divider"
```

---

## Task 5: Wire Props Through Host and Student Pages

**Files:**
- Modify: `apps/frontend/src/pages/ClassroomHostPage.tsx`
- Modify: `apps/frontend/src/pages/ClassroomStudentPage.tsx`

**Interfaces:**
- Consumes: `hostActions.setSplitRatio` and `state.splitRatio` (Task 3), `hostSplitRatio`/`onSetSplitRatio` props (Task 4)

- [ ] **Step 1: Pass the props on the host page**

In `apps/frontend/src/pages/ClassroomHostPage.tsx`, find the `<ClassroomPdfViewer` usage (search for `hostZoom={state.zoom}`) and add, right after that line:

```tsx
          hostSplitRatio={state.splitRatio}
          onSetSplitRatio={hostActions.setSplitRatio}
```

- [ ] **Step 2: Pass the prop on the student page**

In `apps/frontend/src/pages/ClassroomStudentPage.tsx`, find the `<ClassroomPdfViewer` usage (search for `hostZoom={state.zoom}`) and add, right after that line:

```tsx
          hostSplitRatio={state.splitRatio}
```

(No `onSetSplitRatio` here — students never emit to the server; `ClassroomPdfViewer`'s own internal `synced` state already governs whether they can drag locally.)

- [ ] **Step 3: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/ClassroomHostPage.tsx apps/frontend/src/pages/ClassroomStudentPage.tsx
git commit -m "feat(classroom): pass splitRatio props into host and student pages"
```

---

## Verification

Run the full check before considering the feature done:

```bash
npm run test --workspace=apps/backend
npm run build --workspace=apps/backend
npm run build --workspace=apps/frontend
```

Expected: backend tests pass, both builds exit `0`.

Manual end-to-end check (already covered in Task 4 Step 8, repeat here as a final pass):
- Teacher drags the split divider → students see the same ratio live.
- Student in free-move mode drags the divider → only their own screen changes.
- Student re-enables sync → their split snaps back to the teacher's current ratio.
- Non-split (single) layout is completely unaffected — no divider, no ratio logic engaged.
- Existing zoom/scroll/stroke sync in split mode still works exactly as before (unaffected by this change).
