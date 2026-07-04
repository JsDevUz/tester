# Live Session History — Design Spec

## Problem

`LiveCreatePage` currently only shows a "create new live session" form. Live sessions live entirely in `LiveService`'s in-memory `Map` and vanish once finished (60s cleanup) or on server restart. Teachers have no way to see past sessions or resume one they navigated away from (e.g. accidentally closed the host tab), and the creation form takes up the whole page even though creating a session is a rare action compared to checking history.

## Scope

- New `live_sessions` DB table to persist session metadata (not gameplay state — that stays in-memory in `LiveService` as today).
- `LiveCreatePage` becomes a history list; "create new" moves into a modal.
- Resuming an active session reconnects via the existing `LiveHostPage`/socket flow — no changes to gameplay logic.
- Out of scope: winner/top-score display, participant counts, any change to how live gameplay itself works.

## Data Model

New table `live_sessions` in `apps/backend/src/db/schema.ts`:

```typescript
export const liveSessions = pgTable('live_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
  adminId: uuid('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pin: varchar('pin', { length: 6 }).notNull(),
  mode: text('mode').notNull(), // 'individual' | 'team'
  questionTimeSec: integer('question_time_sec').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'finished'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});
```

This is a metadata/audit record only. It does not replace or duplicate the in-memory `LiveSession` gameplay state in `live.service.ts`, and it does not replace the existing `submissions`-table persistence of individual/team results (`persistResults`/`persistTeamResults`) — those still write final scores per player/team exactly as they do today. `live_sessions` exists purely so the create-session page can list "sessions I've run" and know which pin is still joinable.

## Backend Changes

**`LiveService.createSession()`**: after generating the pin and building the in-memory session (unchanged), insert one row into `liveSessions` with `status: 'active'`.

**`LiveService.finish()`** (already the single place that ends a session, called both when the game completes naturally and when the host clicks "Sessiyani tugatish"): after finishing in-memory bookkeeping, update the matching `live_sessions` row to `status: 'finished', finishedAt: now()`.

**`host:join` gateway handler / `LiveService.hostJoin()`**: when the in-memory `Map` has no session for the given pin (today this throws `NOT_FOUND`), check `live_sessions` for a row with that pin and `status: 'active'`. If found, update it to `status: 'finished', finishedAt: now()` before returning the `NOT_FOUND` error — this self-heals rows left "active" by a server restart, so the next time the teacher loads the history list, the row correctly shows as finished rather than falsely claiming to be resumable.

**New endpoint** `GET /api/v1/live/sessions?limit=20&offset=0` (teacher/super only, same guard as the existing `POST /live/sessions`): returns the calling admin's own sessions, most recent first, joined with the test name:

```typescript
interface LiveSessionHistoryItem {
  id: string;
  pin: string;
  testName: string;
  mode: 'individual' | 'team';
  status: 'active' | 'finished';
  createdAt: string;
  finishedAt: string | null;
}
```

## Frontend Changes

**`LiveCreatePage`** restructured:
- Header row: title + "Yangi live yaratish" button (opens modal)
- Body: the history list, paginated 20 at a time with a "Ko'proq yuklash" button at the bottom (matches the existing load-more pattern in `StudentHistoryPage.tsx`)
- Each row shows: test name, relative/absolute created date, a mode badge (Yakka / Jamoaviy), and a status badge (Faol / Tugagan)
- Clicking an **active** row navigates to `/live/host/:pin` (resumes via the existing host page/socket flow — no new resume logic needed there beyond what already exists, since `host:join` already re-attaches to an in-memory session if one exists)
- Clicking a **finished** row navigates to `/tests/:testId/submissions` (existing Submissions page)
- Empty state: "Hali live sessiya yaratilmagan" message when the list is empty

**New `NewLiveSessionModal` component**: contains exactly the form that's on `LiveCreatePage` today (test search/select, time-per-question buttons, mode toggle, submit button with the same `NO_LIVE_QUESTIONS` error handling). On successful creation, navigates to `/live/host/:pin` same as today. Opened/closed via local state on `LiveCreatePage`; no route change.

## Error Handling

- History list fetch failure: show existing empty-state-style message, no crash.
- Clicking an active row whose session has actually gone stale server-side (self-healed to `finished` per the backend section above, but the client's cached list hasn't refreshed yet): `LiveHostPage`'s existing "Sessiya topilmadi yoki tugagan." error phase already handles this — no change needed there.

## Testing Notes

- Backend: unit test that `createSession` writes a `live_sessions` row, that `finish()` updates it to `finished`, and that `hostJoin()` self-heals a stale `active` row to `finished` when the in-memory session is missing.
- Frontend: no new automated tests expected (this codebase's frontend has no test suite); verify manually per the plan's manual-verification task.
