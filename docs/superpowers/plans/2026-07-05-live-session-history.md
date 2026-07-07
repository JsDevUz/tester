# Live Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted `live_sessions` metadata table so `LiveCreatePage` can show a teacher's past and active live sessions, resume an active one, and move the creation form into a modal.

**Architecture:** A new Drizzle table (`liveSessions`) tracks session metadata (pin, test, mode, status, timestamps) written by `LiveService` at the same points where sessions are already created and finished — the in-memory gameplay state in `LiveService`'s `Map` is untouched. A new REST endpoint lists a teacher's own sessions. The frontend restructures `LiveCreatePage` into a paginated history list with a "Yangi live yaratish" button that opens a modal containing the existing creation form unchanged.

**Tech Stack:** NestJS 11, Drizzle ORM (PostgreSQL), Jest, React 18, React Router, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-07-05-live-session-history-design.md`

## Global Constraints

- `live_sessions` is a metadata/audit table only — it must never be read by or influence the in-memory `LiveService.sessions` Map gameplay logic (state machine, scoring, broadcasts). It exists solely so the history list can render past/active sessions.
- `mode` column values are exactly `'individual'` or `'team'` (matches `LiveGameMode` already used elsewhere in `live.types.ts`).
- `status` column values are exactly `'active'` or `'finished'`.
- The self-heal behavior (stale `active` row with no matching in-memory session becomes `finished`) happens inside `LiveService.hostJoin()`, at the exact point that method currently throws `NOT_FOUND` for a missing pin.
- New REST endpoint `GET /api/v1/live/sessions` is teacher/super only (same `@Roles('teacher', 'super')` guard as the existing `LiveController`), returns only the calling admin's own sessions (`WHERE admin_id = req.admin.id`), most recent first, paginated via `limit`/`offset` query params (default `limit=20, offset=0`), joined with `tests.name` as `testName`.
- Frontend: the existing creation form's exact fields, validation, error handling, and submit behavior (`apiCreateLiveSession`, `NO_LIVE_QUESTIONS` error message, navigate to `/live/host/:pin` on success) must be preserved verbatim inside the new modal — this is a relocation, not a rewrite.
- History list pagination is a "Ko'proq yuklash" button (not infinite-scroll/IntersectionObserver) fetching 20 rows at a time, following the state-shape pattern (`loading`, `loadingMore`, `hasMore`, `offsetRef`) already used in `apps/frontend/src/pages/StudentHistoryPage.tsx`.
- Backend tests: `npm test --workspace=apps/backend`. Frontend build check: `npm run build --workspace=apps/frontend` (no automated frontend test suite exists in this repo).

---

## File Structure

```
apps/backend/src/db/schema.ts                    — MODIFIED: add `liveSessions` table + relation to `tests`
apps/backend/drizzle/migrations/                 — NEW migration file (auto-generated via drizzle-kit)
apps/backend/src/live/live.service.ts             — MODIFIED: createSession/finish/hostJoin write/update liveSessions rows; new listSessionHistory method
apps/backend/src/live/live.service.spec.ts        — MODIFIED: new tests for the above
apps/backend/src/live/live.controller.ts          — MODIFIED: new GET /live/sessions endpoint

apps/frontend/src/api/live.ts                     — MODIFIED: new apiListLiveSessions function + LiveSessionHistoryItem type
apps/frontend/src/components/NewLiveSessionModal.tsx  — NEW: extracted creation form as a modal component
apps/frontend/src/pages/LiveCreatePage.tsx         — MODIFIED: rewritten as history list + "Yangi live yaratish" button opening the modal
```

---

### Task 1: `liveSessions` DB table + migration

**Files:**

- Modify: `apps/backend/src/db/schema.ts`
- Create: (auto-generated) `apps/backend/drizzle/migrations/00XX_<name>.sql` via drizzle-kit

**Interfaces:**

- Produces (Task 2 consumes): Drizzle table export `liveSessions` with columns `id, testId, adminId, pin, mode, questionTimeSec, status, createdAt, finishedAt`, importable as `import { liveSessions } from '../db/schema'`.

- [ ] **Step 1: Add the table definition**

Open `apps/backend/src/db/schema.ts` and find the existing `tests` table definition (search for `export const tests = pgTable`). Immediately after the `questions` table definition (search for `export const questions = pgTable`, and insert after its closing `});`), add:

```typescript
export const liveSessions = pgTable("live_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  testId: uuid("test_id")
    .notNull()
    .references(() => tests.id, { onDelete: "cascade" }),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pin: varchar("pin", { length: 6 }).notNull(),
  mode: text("mode").notNull(),
  questionTimeSec: integer("question_time_sec").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
```

This uses `uuid`, `varchar`, `text`, `integer`, `timestamp` — all already imported at the top of `schema.ts` (verify the import line at the top of the file includes all of these; it already does, since `tests` and `questions` use the same set).

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate --workspace=apps/backend`
Expected: a new file appears under `apps/backend/drizzle/migrations/` (e.g. `0011_<generated-name>.sql`) containing a `CREATE TABLE "live_sessions" (...)` statement with foreign keys to `tests(id)` and `users(id)`.

- [ ] **Step 3: Apply the migration to your local dev database**

Run: `npm run db:migrate --workspace=apps/backend`
Expected: migration applies without error (requires a running local Postgres pointed at by `DATABASE_URL` in `apps/backend/.env` — if you don't have one running locally, skip this step and note it in your report; the migration will run in CI/deploy instead).

- [ ] **Step 4: Build check**

Run: `npm run build --workspace=apps/backend`
Expected: compiles cleanly (this only validates the TypeScript table definition, not the DB connection).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/
git commit -m "feat(live): add live_sessions metadata table"
```

---

### Task 2: `LiveService` writes/reads `live_sessions` rows (TDD)

**Files:**

- Modify: `apps/backend/src/live/live.service.ts`
- Modify: `apps/backend/src/live/live.service.spec.ts`

**Interfaces:**

- Consumes: Task 1's `liveSessions` table from `../db/schema`
- Produces (Task 3 controller consumes):
  ```typescript
  async listSessionHistory(adminId: string, limit: number, offset: number): Promise<Array<{
    id: string; pin: string; testName: string; mode: string; status: string;
    createdAt: Date; finishedAt: Date | null; testId: string;
  }>>
  ```
  (Also modifies existing `createSession`, `finish`, `hostJoin` — no signature changes to those, only added side effects.)

This task makes `LiveService` write a `live_sessions` row on session creation, update it to `finished` when the session ends, self-heal a stale `active` row when a host tries to rejoin a session no longer in memory, and expose a method to list a teacher's session history.

- [ ] **Step 1: Write the failing tests**

Read `apps/backend/src/live/live.service.spec.ts` in full first to match its existing `jest.mock('../db', ...)` / fake-broadcaster setup style exactly (the file mocks `db` at the top — find that mock and extend it rather than introducing a second, conflicting one). Add:

```typescript
describe("LiveService — live_sessions persistence", () => {
  it('createSession inserts a live_sessions row with status "active"', async () => {
    const insertedRows: any[] = [];
    (db.insert as jest.Mock).mockImplementation((table: any) => ({
      values: (vals: any) => {
        insertedRows.push(vals);
        return { returning: async () => [{ id: "row-1", ...vals }] };
      },
    }));
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({
      id: "test1",
      name: "Matematika",
      questions: [
        {
          id: "q1",
          text: "Q",
          type: "single",
          imageUrl: null,
          correctAnswer: null,
          options: [{ id: "o1", text: "A", isCorrect: true, orderIndex: 0 }],
        },
      ],
    });

    const service = new LiveService();
    service.setBroadcaster(makeFakeBroadcaster().b);
    await service.createSession("admin1", "test1", 20, "individual");

    const sessionRow = insertedRows.find(
      (r) => r.pin !== undefined && r.status === "active",
    );
    expect(sessionRow).toBeDefined();
    expect(sessionRow.testId).toBe("test1");
    expect(sessionRow.adminId).toBe("admin1");
    expect(sessionRow.mode).toBe("individual");
    expect(sessionRow.questionTimeSec).toBe(20);
  });

  it('finish() updates the live_sessions row to status "finished" with a finishedAt timestamp', async () => {
    const updateCalls: any[] = [];
    (db.update as jest.Mock).mockImplementation((table: any) => ({
      set: (vals: any) => {
        updateCalls.push(vals);
        return { where: async () => {} };
      },
    }));
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: () => ({ returning: async () => [{ id: "row-1" }] }),
    }));

    const service = new LiveService();
    const { b } = makeFakeBroadcaster();
    service.setBroadcaster(b);
    jest.spyOn(service as any, "persistResults").mockResolvedValue(undefined);
    const pin = service.initSession(
      "admin1",
      "test1",
      "Matematika",
      makeQuestions(),
      10,
      "individual",
    );
    service.hostJoin(pin, "admin1", "hs");
    service.playerJoin(pin, { id: "u1", name: "Ali" }, "s1");
    await (service as any).finish((service as any).sessions.get(pin));

    const finishUpdate = updateCalls.find((u) => u.status === "finished");
    expect(finishUpdate).toBeDefined();
    expect(finishUpdate.finishedAt).toBeInstanceOf(Date);
  });

  it("hostJoin self-heals a stale active live_sessions row to finished when no in-memory session exists for the pin", async () => {
    const updateCalls: any[] = [];
    (db.query as any).liveSessions = {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: "row-1", pin: "999999", status: "active" }),
    };
    (db.update as jest.Mock).mockImplementation((table: any) => ({
      set: (vals: any) => {
        updateCalls.push(vals);
        return { where: async () => {} };
      },
    }));

    const service = new LiveService();
    service.setBroadcaster(makeFakeBroadcaster().b);
    await expect(service.hostJoin("999999", "admin1", "hs")).rejects.toThrow();

    expect(updateCalls.some((u) => u.status === "finished")).toBe(true);
  });

  it("listSessionHistory returns sessions for the given admin, most recent first, with testName joined", async () => {
    const rows = [
      {
        id: "row-2",
        pin: "222222",
        mode: "team",
        status: "finished",
        createdAt: new Date("2026-01-02"),
        finishedAt: new Date("2026-01-02"),
        testId: "test1",
        test: { name: "Fizika" },
      },
      {
        id: "row-1",
        pin: "111111",
        mode: "individual",
        status: "active",
        createdAt: new Date("2026-01-01"),
        finishedAt: null,
        testId: "test2",
        test: { name: "Matematika" },
      },
    ];
    (db.query as any).liveSessions = {
      findMany: jest.fn().mockResolvedValue(rows),
    };

    const service = new LiveService();
    const result = await service.listSessionHistory("admin1", 20, 0);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "row-2",
      pin: "222222",
      testName: "Fizika",
      mode: "team",
      status: "finished",
    });
    expect(result[1]).toMatchObject({
      id: "row-1",
      pin: "111111",
      testName: "Matematika",
      mode: "individual",
      status: "active",
    });
  });
});
```

(These tests rely on `db.query.liveSessions` and `db.update`/`db.insert` being mockable jest functions — check at the top of `live.service.spec.ts` how `db` is currently imported/mocked; if `jest.mock('../db', ...)` doesn't already provide `db.query.liveSessions` and `db.update` as jest mock functions, extend that mock block to add them, matching the existing mock's style for `db.query.tests` / `db.insert`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=apps/backend -- live.service`
Expected: FAIL — `service.listSessionHistory is not a function`, and the `live_sessions` insert/update assertions find no matching calls (since `createSession`/`finish`/`hostJoin` don't touch that table yet).

- [ ] **Step 3: Import `liveSessions` and update `createSession`**

In `apps/backend/src/live/live.service.ts`, update the import line:

```typescript
import { tests, submissions, answers, liveSessions } from "../db/schema";
```

In `createSession`, after the `const pin = this.initSession(...)` line and before `return { pin };`, add:

```typescript
await db.insert(liveSessions).values({
  testId: test.id,
  adminId,
  pin,
  mode,
  questionTimeSec,
  status: "active",
});
```

So the full method tail reads:

```typescript
const pin = this.initSession(
  adminId,
  test.id,
  test.name,
  liveQuestions,
  questionTimeSec,
  mode,
);
await db.insert(liveSessions).values({
  testId: test.id,
  adminId,
  pin,
  mode,
  questionTimeSec,
  status: "active",
});
return { pin };
```

- [ ] **Step 4: Update `finish()` to mark the row finished**

In `apps/backend/src/live/live.service.ts`'s `finish()` method, after the existing `if (s.currentIdx >= 0) { ... }` block and before the `setTimeout(() => this.sessions.delete(s.pin), SESSION_CLEANUP_MS);` line, add:

```typescript
await db
  .update(liveSessions)
  .set({ status: "finished", finishedAt: new Date() })
  .where(and(eq(liveSessions.pin, s.pin), eq(liveSessions.status, "active")));
```

(`and`/`eq` are already imported at the top of the file from `drizzle-orm`.) The full `finish()` method should now read:

```typescript
  private async finish(s: LiveSession) {
    if (s.status === 'finished') return;
    s.status = 'finished';
    if (s.questionTimer) clearTimeout(s.questionTimer);
    if (s.revealTimer) clearTimeout(s.revealTimer);
    if (s.hostDisconnectTimer) clearTimeout(s.hostDisconnectTimer);

    const leaderboard = s.mode === 'team' && s.teams
      ? [...s.teams.values()].sort((a, b) => b.score - a.score).map((t, i) => ({ userId: t.id, name: t.name, score: t.score, rank: i + 1 }))
      : buildLeaderboard([...s.players.values()]);

    this.broadcaster.toRoom(s.pin, 'game:finished', { leaderboard });
    if (s.currentIdx >= 0) {
      if (s.mode === 'team') await this.persistTeamResults(s);
      else await this.persistResults(s);
    }
    await db.update(liveSessions)
      .set({ status: 'finished', finishedAt: new Date() })
      .where(and(eq(liveSessions.pin, s.pin), eq(liveSessions.status, 'active')));
    setTimeout(() => this.sessions.delete(s.pin), SESSION_CLEANUP_MS);
  }
```

- [ ] **Step 5: Update `hostJoin()` to self-heal a stale row**

Replace the `hostJoin` method:

```typescript
  async hostJoin(pin: string, adminId: string, socketId: string) {
    const s = this.sessions.get(pin);
    if (!s) {
      const staleRow = await db.query.liveSessions.findFirst({
        where: and(eq(liveSessions.pin, pin), eq(liveSessions.status, 'active')),
      });
      if (staleRow) {
        await db.update(liveSessions)
          .set({ status: 'finished', finishedAt: new Date() })
          .where(eq(liveSessions.id, staleRow.id));
      }
      throw new Error('NOT_FOUND');
    }
    if (s.hostAdminId !== adminId) throw new Error('NOT_HOST');
    s.hostSocketId = socketId;
    if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }
    return { state: this.buildState(s, null) };
  }
```

Note this changes `hostJoin` from synchronous to `async` (it now awaits a DB call in the not-found branch). Check every call site of `hostJoin` in `apps/backend/src/live/live.gateway.ts` (search for `.hostJoin(`) — since the gateway's existing `@SubscribeMessage('host:join')` handler already wraps the call and returns a value/promise via its ack callback pattern, confirm whether it already `await`s or returns the result properly; if the handler calls `this.liveService.hostJoin(...)` without awaiting inside an `async` handler function, add `await` (read the handler in `live.gateway.ts` first to see its exact current shape before editing — do not assume, since Task 3/4 wiring elsewhere in this codebase used both sync and async patterns for different methods).

- [ ] **Step 6: Add `listSessionHistory`**

Add this method to `LiveService` (place it near `listTests`, since both are read-only REST-facing queries):

```typescript
  async listSessionHistory(adminId: string, limit: number, offset: number) {
    const rows = await db.query.liveSessions.findMany({
      where: eq(liveSessions.adminId, adminId),
      orderBy: (ls, { desc }) => [desc(ls.createdAt)],
      limit,
      offset,
      with: { test: true },
    });
    return rows.map((r: any) => ({
      id: r.id,
      pin: r.pin,
      testId: r.testId,
      testName: r.test?.name ?? '',
      mode: r.mode,
      status: r.status,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
    }));
  }
```

This relies on a Drizzle relation between `liveSessions` and `tests` named `test` being queryable via `with: { test: true }`. Check `apps/backend/src/db/schema.ts` for how existing relations are declared (search for `relations(` — e.g. `submissionsRelations` or similar for the `submissions` table, which also has a `testId` foreign key). Add an equivalent relation for `liveSessions` in the same file, near the other `relations(...)` blocks:

```typescript
export const liveSessionsRelations = relations(liveSessions, ({ one }) => ({
  test: one(tests, { fields: [liveSessions.testId], references: [tests.id] }),
}));
```

(`relations` is already imported from `drizzle-orm` at the top of `schema.ts` — verify by checking the existing relation blocks' import.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test --workspace=apps/backend -- live.service`
Expected: PASS — all new tests plus every pre-existing test in this file (individual mode, team mode, disconnect handling, etc. — none of that logic was touched, only additive DB calls were inserted at specific points).

- [ ] **Step 8: Run the full backend suite**

Run: `npm test --workspace=apps/backend`
Expected: PASS — all suites green.

- [ ] **Step 9: Build check**

Run: `npm run build --workspace=apps/backend`
Expected: clean build (this catches the `hostJoin` async signature change if any caller wasn't updated).

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/src/live/live.service.ts apps/backend/src/live/live.service.spec.ts apps/backend/src/live/live.gateway.ts
git commit -m "feat(live): persist session metadata, self-heal stale rows, add history query"
```

---

### Task 3: REST endpoint for session history

**Files:**

- Modify: `apps/backend/src/live/live.controller.ts`

**Interfaces:**

- Consumes: Task 2's `LiveService.listSessionHistory(adminId, limit, offset)`
- Produces (Task 4 frontend consumes): `GET /api/v1/live/sessions?limit=20&offset=0` → `LiveSessionHistoryItem[]` (JSON array, teacher/super only)

- [ ] **Step 1: Add the endpoint**

In `apps/backend/src/live/live.controller.ts`, add the `Query` import and a new `@Get('sessions')` handler. Update the import line:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
```

Add the handler to the `LiveController` class, alongside the existing `listTests`/`create` methods:

```typescript
  @Get('sessions')
  listSessions(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    const o = Math.max(0, parseInt(offset ?? '0', 10) || 0);
    return this.liveService.listSessionHistory(req.admin.id, l, o);
  }
```

(This route must be declared before or independent of the existing `@Post('sessions')` — NestJS matches by HTTP method + path, so a `GET /live/sessions` and `POST /live/sessions` on the same path string coexist without conflict; no ordering concern here, but place this `@Get('sessions')` method visually near `@Post('sessions')` for readability.)

- [ ] **Step 2: Build check**

Run: `npm run build --workspace=apps/backend`
Expected: clean build.

- [ ] **Step 3: Run full backend suite**

Run: `npm test --workspace=apps/backend`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/live/live.controller.ts
git commit -m "feat(live): add GET /live/sessions history endpoint"
```

---

### Task 4: Frontend — API client + `NewLiveSessionModal` extraction

**Files:**

- Modify: `apps/frontend/src/api/live.ts`
- Create: `apps/frontend/src/components/NewLiveSessionModal.tsx`

**Interfaces:**

- Consumes: Task 3's `GET /live/sessions` endpoint
- Produces (Task 5 consumes):

  ```typescript
  export interface LiveSessionHistoryItem {
    id: string;
    pin: string;
    testId: string;
    testName: string;
    mode: "individual" | "team";
    status: "active" | "finished";
    createdAt: string;
    finishedAt: string | null;
  }
  export async function apiListLiveSessions(
    limit: number,
    offset: number,
  ): Promise<LiveSessionHistoryItem[]>;
  ```

  `NewLiveSessionModal` component: `<NewLiveSessionModal onClose={() => void} />` — self-contained, navigates to `/live/host/:pin` on success (same as today), calls `onClose` when the user dismisses it without creating a session.

- [ ] **Step 1: Add the API function and type**

Append to `apps/frontend/src/api/live.ts`:

```typescript
export interface LiveSessionHistoryItem {
  id: string;
  pin: string;
  testId: string;
  testName: string;
  mode: "individual" | "team";
  status: "active" | "finished";
  createdAt: string;
  finishedAt: string | null;
}

export async function apiListLiveSessions(
  limit: number,
  offset: number,
): Promise<LiveSessionHistoryItem[]> {
  const res = await client.get("/live/sessions", { params: { limit, offset } });
  return res.data;
}
```

- [ ] **Step 2: Extract the creation form into a modal component**

Read `apps/frontend/src/pages/LiveCreatePage.tsx` in full (already shown above in this plan's context-gathering — reproduced here for the implementer's convenience) and create `apps/frontend/src/components/NewLiveSessionModal.tsx` containing the exact same form logic, wrapped in a modal shell. The form's internal state/handlers (`tests`, `query`, `selectedId`, `timeSec`, `mode`, `creating`, `error`, `handleCreate`) are unchanged from the current page — only the outer JSX wrapper changes from a full page to a modal overlay, and an `onClose` prop is added:

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Radio, ChevronRight, X } from 'lucide-react';
import { apiLiveTests, apiCreateLiveSession, type LiveTestItem } from '../api/live';

const TIMES = [10, 20, 30, 60];

export function NewLiveSessionModal({ onClose, initialTestId }: { onClose: () => void; initialTestId?: string | null }) {
  const navigate = useNavigate();
  const [tests, setTests] = useState<LiveTestItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialTestId ?? null);
  const [timeSec, setTimeSec] = useState(20);
  const [mode, setMode] = useState<'individual' | 'team'>('individual');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { apiLiveTests().then(setTests); }, []);

  const filtered = tests.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));
  const selected = tests.find((t) => t.id === selectedId) ?? null;

  async function handleCreate() {
    if (!selectedId || creating) return;
    setCreating(true);
    setError(null);
    try {
      const { pin } = await apiCreateLiveSession(selectedId, timeSec, mode);
      navigate(`/live/host/${pin}`);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(msg === 'NO_LIVE_QUESTIONS'
        ? "Bu testda live uchun mos savol yo'q (yagona / ko'p tanlov / to'g'ri-noto'g'ri kerak)."
        : "Xato yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-2">
            <Radio size={20} className="text-indigo-500" />
            <h2 className="text-lg font-bold text-gray-800">Live o'yin yaratish</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6">
          {/* Test tanlash */}
          <p className="text-sm font-semibold text-gray-700 mb-2 mt-3">Test tanlang</p>
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Test nomini qidiring..."
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-10 pr-4 py-3 text-sm outline-none focus:border-indigo-400 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5 mb-6 max-h-56 overflow-y-auto">
            {filtered.map((t) => (
              <button key={t.id} onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                  selectedId === t.id
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'bg-white border-gray-100 text-gray-700 hover:border-indigo-200'
                }`}>
                <span className="text-sm font-medium truncate">{t.name}</span>
                <span className={`text-xs shrink-0 ${selectedId === t.id ? 'text-white/70' : 'text-gray-400'}`}>
                  {t.liveQuestionCount} savol
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Test topilmadi</p>}
          </div>

          {/* Vaqt tanlash */}
          <p className="text-sm font-semibold text-gray-700 mb-2">Har savolga vaqt</p>
          <div className="flex gap-2 mb-6">
            {TIMES.map((t) => (
              <button key={t} onClick={() => setTimeSec(t)}
                className={`flex-1 py-3 rounded-2xl border font-semibold text-sm transition-all ${
                  timeSec === t
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'bg-white border-gray-100 text-gray-600 hover:border-indigo-200'
                }`}>
                {t}s
              </button>
            ))}
          </div>

          {/* Rejim tanlash */}
          <p className="text-sm font-semibold text-gray-700 mb-2">O'yin rejimi</p>
          <div className="flex gap-2 mb-6">
            <button onClick={() => setMode('individual')}
              className={`flex-1 py-3 rounded-2xl border font-semibold text-sm transition-all ${
                mode === 'individual'
                  ? 'bg-indigo-500 border-indigo-500 text-white'
                  : 'bg-white border-gray-100 text-gray-600 hover:border-indigo-200'
              }`}>
              Yakka
            </button>
            <button onClick={() => setMode('team')}
              className={`flex-1 py-3 rounded-2xl border font-semibold text-sm transition-all ${
                mode === 'team'
                  ? 'bg-indigo-500 border-indigo-500 text-white'
                  : 'bg-white border-gray-100 text-gray-600 hover:border-indigo-200'
              }`}>
              Jamoaviy
            </button>
          </div>

          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

          <button onClick={handleCreate} disabled={!selected || creating}
            className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base flex items-center justify-center gap-2 hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-lg shadow-indigo-100">
            {creating ? 'Yaratilmoqda...' : <><span>Sessiya yaratish</span><ChevronRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build check**

Run: `npm run build --workspace=apps/frontend`
Expected: clean build (the modal isn't used anywhere yet, but must compile standalone).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/live.ts apps/frontend/src/components/NewLiveSessionModal.tsx
git commit -m "feat(live): extract live-session creation form into a modal component"
```

---

### Task 5: Frontend — `LiveCreatePage` becomes a history list

**Files:**

- Modify: `apps/frontend/src/pages/LiveCreatePage.tsx`

**Interfaces:**

- Consumes: Task 4's `apiListLiveSessions`, `LiveSessionHistoryItem`, `NewLiveSessionModal`

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `apps/frontend/src/pages/LiveCreatePage.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Radio, Plus, ChevronRight, Users2, User, Inbox } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { NewLiveSessionModal } from '../components/NewLiveSessionModal';
import { apiListLiveSessions, type LiveSessionHistoryItem } from '../api/live';

const LIMIT = 20;

export function LiveCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<LiveSessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showModal, setShowModal] = useState(!!searchParams.get('testId'));
  const offsetRef = useRef(0);

  async function loadMore(reset = false) {
    if (reset) {
      offsetRef.current = 0;
      setSessions([]);
      setHasMore(true);
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const rows = await apiListLiveSessions(LIMIT, offsetRef.current);
      setSessions((prev) => reset ? rows : [...prev, ...rows]);
      offsetRef.current += rows.length;
      if (rows.length < LIMIT) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => { loadMore(true); }, []);

  function handleRowClick(s: LiveSessionHistoryItem) {
    if (s.status === 'active') navigate(`/live/host/${s.pin}`);
    else navigate(`/tests/${s.testId}/submissions`);
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Radio size={20} className="text-indigo-500" />
              <h2 className="text-lg font-bold text-gray-800">Live musobaqalar</h2>
            </div>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-sm bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100">
              <Plus size={16} /> Yangi live yaratish
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 rounded-full border border-indigo-200 border-t-indigo-500 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Inbox size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Hali live sessiya yaratilmagan.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sessions.map((s) => (
                <button key={s.id} onClick={() => handleRowClick(s)}
                  className="w-full bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    s.mode === 'team' ? 'bg-purple-50' : 'bg-blue-50'
                  }`}>
                    {s.mode === 'team' ? <Users2 size={16} className="text-purple-500" /> : <User size={16} className="text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.testName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(s.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-lg shrink-0 ${
                    s.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {s.status === 'active' ? 'Faol' : 'Tugagan'}
                  </span>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              ))}

              {hasMore && (
                <button onClick={() => loadMore(false)} disabled={loadingMore}
                  className="mt-2 py-3 text-sm font-medium text-indigo-500 hover:text-indigo-600 disabled:opacity-50 transition-colors">
                  {loadingMore ? 'Yuklanmoqda...' : 'Ko\'proq yuklash'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <NewLiveSessionModal
          initialTestId={searchParams.get('testId')}
          onClose={() => setShowModal(false)}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build --workspace=apps/frontend`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/LiveCreatePage.tsx
git commit -m "feat(live): LiveCreatePage becomes a paginated session history list with create-modal"
```

---

### Task 6: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start dev servers**

Run: `npm run dev:backend` (one terminal) and `npm run dev:frontend` (another terminal)

- [ ] **Step 2: Full backend suite one more time**

Run: `npm test --workspace=apps/backend`
Expected: all pass (final confirmation before manual testing).

- [ ] **Step 3: Manual smoke test — history list and modal**

1. Log in as a teacher, go to `/live` — verify it now shows a history list (empty state if no sessions yet) instead of the old full-page form.
2. Click "Yangi live yaratish" — verify the modal opens with the same test-search/time/mode form as before.
3. Create a session — verify it navigates to `/live/host/:pin` as before (host lobby/team-assign screen loads normally).
4. Navigate back to `/live` (e.g. via the sidebar) — verify the just-created session now appears at the top of the list with status "Faol".
5. Click that "Faol" row — verify it navigates to `/live/host/:pin` and resumes/re-joins the still-live session (since it's still in memory).
6. On the host page, click "Sessiyani tugatish" (or let the game finish naturally) — navigate back to `/live` — verify the session's status badge now shows "Tugagan".
7. Click the now-"Tugagan" row — verify it navigates to `/tests/:testId/submissions` (the existing Natijalar page for that test).
8. Create 20+ sessions total (or verify with existing data) and confirm the "Ko'proq yuklash" button appears and loads more rows on click.

Expected: all steps behave as described, no console errors.

- [ ] **Step 4: Manual smoke test — stale session self-heal**

1. Create a live session, note its pin, but do NOT click "Boshlash" (leave it in lobby/team-assign).
2. Restart the backend dev server (simulating a crash/redeploy) — this wipes `LiveService`'s in-memory `Map`.
3. Go to `/live`, find that session (still shows "Faol" since the DB row wasn't touched by the restart).
4. Click it — verify `LiveHostPage` shows its "Sessiya topilmadi yoki tugagan." error phase (since `host:join` now throws `NOT_FOUND` and the frontend already handles that error phase).
5. Go back to `/live` and refresh the list — verify that session's status badge now shows "Tugagan" (proving the self-heal in `hostJoin` updated the DB row before throwing).

Expected: works exactly as described — no crash, no permanently-stuck "Faol" session that can never be resumed or cleared.
