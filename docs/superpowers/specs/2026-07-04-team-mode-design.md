# Team Mode — Design Spec

**Status:** Approved by user, pending implementation plan
**Depends on:** existing Live Quiz feature (`apps/backend/src/live/`, `apps/frontend/src/pages/Live*Page.tsx`)
**Out of scope for this spec:** voice chat (separate future spec, LiveKit self-hosted on a dedicated Hetzner server)

## Problem

Individual Live Quiz supports one PIN → one player → one score. Teachers want a **team competition mode** for large classes (40-70 students total, split into 2-3 teams of 20-35 students each). Every team member should be able to participate (suggest answers, watch progress), but only one designated "captain" per team submits the team's official answer. Teams compete against each other on a shared leaderboard, using the same scoring formula as individual mode.

## Scope boundaries

- All 10 existing question types must work (single, multi, truefalse, slider, droppin, matching, fillblank, open, arrange, reorder) — wider than individual Live Quiz's 3-type restriction.
- Suggestion mechanic (member proposes an answer, captain sees suggestion counts) applies **only** to single/multi/truefalse — these have discrete options a member can tap. For the other 7 types there is no suggestion UI; members simply watch while the captain enters the answer (via voice coordination outside the app).
- No voice chat in this spec. Coordination between captain and members happens outside the app (in person, or a future voice-chat feature).
- No hard cap on team size (up to ~35 confirmed acceptable).

## Data Model

Extends the existing in-memory `LiveSession` (`apps/backend/src/live/live.types.ts`) — individual mode is untouched; team mode is an additive layer gated by a new `mode` field.

```typescript
export type LiveGameMode = 'individual' | 'team';

export interface LiveTeam {
  id: string;                                   // "team-1", "team-2", ...
  name: string;                                  // "Guruh 1"
  captainUserId: string | null;
  memberUserIds: Set<string>;                    // includes the captain
  score: number;
  answers: Map<string, PlayerAnswer>;            // questionId -> captain's submitted answer
  suggestions: Map<string, Map<string, number>>; // questionId -> optionId -> suggestion count (single/multi/truefalse only)
}

// LiveSession gains:
export interface LiveSession {
  // ...all existing fields unchanged...
  mode: LiveGameMode;                            // default 'individual' for backward compatibility
  teams: Map<string, LiveTeam> | null;           // null in individual mode
  unassignedUserIds: Set<string> | null;         // lobby-phase: joined but not yet placed in a team
}
```

`players: Map<userId, LivePlayer>` (existing) continues to track every connected socket (captain and members alike) — reconnect/disconnect logic is fully reused. `LiveTeam` is a thin grouping/scoring layer on top.

## Flow

### 1. Session creation (unchanged REST, one new field)

`POST /api/v1/live/sessions` body gains `mode: 'individual' | 'team'` (default `'individual'`). Team mode has no question-type restriction — the full test's questions are all included, not filtered to single/multi/truefalse like individual mode does.

### 2. Lobby → Team Assignment (new phase, team mode only)

New session status: `'team_assign'`, inserted between `'lobby'` and `'question'`.

- Players join exactly like today (`player:join`) and land in `unassignedUserIds`.
- Host-only events:
  - `host:createTeam(name)` → creates a `LiveTeam`
  - `host:assignPlayer(userId, teamId)` → moves the player from `unassignedUserIds` (or their previous team) into `teamId`'s `memberUserIds`
  - `host:setCaptain(teamId, userId)` → sets `captainUserId` (must already be a member of that team)
- Every mutation broadcasts `team:update` with the full team roster + unassigned list, so the host UI and every player's lobby screen stay in sync (players see "You are in Guruh 1" / "Waiting to be assigned").
- `host:start` transitions `'team_assign'` → `'question'`. Validation before allowing start:
  - At least 2 teams exist
  - Every team has a `captainUserId` set
  - (Teams with 0 members are simply not possible — assigning a captain requires membership — but a team with only the captain and no other members is allowed, surfaced as a non-blocking warning in the host UI, not an error)
  - If validation fails, `host:start` returns `{ ok: false, code: 'TEAM_NOT_READY', teams: [...] }` listing which teams are missing a captain, so the host UI can highlight them.

### 3. Question phase

`question:start` broadcasts to everyone in the room (captains and members) — identical payload to individual mode (never includes correct answers).

**single / multi / truefalse:**
- Any non-captain member may call `member:suggest(questionId, optionId)` (toggle — calling again with the same id un-suggests). Each call updates `team.suggestions.get(questionId)`, a `Map<optionId, count>`.
- The **captain only** (not other members) receives `team:suggestionUpdate({ optionId: count, ... })` after every change — other teams' suggestions are never visible to anyone outside that team.
- The captain submits the team's answer via `captain:answer(questionId, selectedOptionIds)` — same shape as individual mode's `player:answer`. This is the only event that finalizes a team's answer for the question.

**All other 7 types (slider, droppin, matching, fillblank, open, arrange, reorder):**
- No suggestion events exist for these types. Members' UI shows the question read-only with a "Sardoringiz javob bermoqda..." indicator.
- Captain enters the answer directly via the same `captain:answer(questionId, ...)` event, payload shaped per type exactly like individual mode's `player:answer` already handles it (reuses `evaluateObjectiveAnswer` / slider tolerance / droppin radius / matching pairs logic from `delivery.service.ts` conventions already ported into `live.service.ts`'s per-type evaluation).

**Reveal timing (team mode):** a question reveals when every team's captain has answered, or the timer expires — same "early reveal" pattern as individual mode's `maybeRevealEarly`, but counting captains instead of all players. Non-captain members and disconnected/uncaptained teams do not block reveal (a team stuck without a captain effectively times out for that question, scoring 0 — see disconnect handling below).

### 4. Scoring

Identical formula to individual mode: `round(500 + 500 × (remaining_ms / max_ms))` for a correct answer, `0` otherwise. Written to `team.score`, not to any individual player's score.

### 5. Captain disconnect handling

- On `handleDisconnect`, if the disconnected socket belongs to a team's current captain: broadcast `team:captainDisconnected(teamId)` to the host only.
- The team is marked captain-less (`captainUserId = null`) but membership is untouched (the disconnected user remains a `memberUserId` in case they reconnect and are simply not the captain anymore).
- While captain-less, `captain:answer` for that team is rejected (`NOT_CAPTAIN`); the team simply scores 0 for any question answered during this window (same as running out the clock).
- The host resolves this via `host:setCaptain(teamId, newUserId)` — same event used during initial assignment — playable mid-game, not just in the `team_assign` phase. This requires `setCaptain` to remain callable during `'question'`/`'reveal'` status too (not gated to `team_assign` only).

### 6. End of game — persistence

One `submissions` row per **team** (not per member): `studentName` = team name (e.g. "Guruh 1"), `userId` = the *final* captain's user id (for traceability; if it changed mid-game only the last captain is recorded), `score` = count of correctly-answered questions, `total` = question count, `mode: 'live'`. The team's `answers` (keyed by the captain's submitted answers per question) are written to the `answers` table exactly like an individual submission's answers — so this shows up in the teacher's existing Submissions/results UI with no changes needed there.

## UI Changes

### LiveHostPage — new "Team Assignment" screen (between lobby and question dashboard, team mode only)

- Left column: unassigned joined players (name chips)
- Right side: 2-3 team columns, each showing member chips; host taps a player then taps a team column to assign (or drags — implementation detail, tap-to-assign is the simpler baseline)
- Each team column has a "Sardor" selector (dropdown or tap-a-member-to-promote) constrained to that team's current members
- "Boshlash" button disabled with an inline reason (e.g. "Guruh 2'da sardor tanlanmagan") until validation passes
- During question/reveal phases, add a small per-team disconnect banner when `team:captainDisconnected` fires, with a quick "Sardor tayinlash" action inline

### LivePlayPage — role-aware rendering

- On join, the ack's state payload includes the player's team id and whether they are the captain (`isCaptain: boolean`, `teamName: string`).
- **Captain view:** identical to today's individual play page, plus for single/multi/truefalse a small count badge next to each option showing `team:suggestionUpdate` counts.
- **Member view (single/multi/truefalse):** same question rendering, but each option has a secondary "Men shuni o'ylayman" toggle button instead of an immediate-submit tap; tapping calls `member:suggest`. No "waiting for reveal" lock — members can change their suggestion freely until reveal.
- **Member view (other 7 types):** question text/media shown read-only; a centered message "Sardoringiz javob bermoqda..." replaces the input area entirely.
- **Lobby / team-assign phase (all players):** shows "Guruh: (kutilmoqda)" until assigned, then "Guruh 1 — siz sardorsiz" or "Guruh 1 a'zosisiz" once the host assigns.

## Testing Notes

- Backend: extend `live.service.spec.ts` with team-mode scenarios (assign/reassign, captain promote mid-question-disconnect, suggestion counting, early reveal on all-captains-answered, persistence writes one row per team).
- No changes required to `TestResultPage`/`SubmissionsPage`/`StudentHistoryPage` — team submissions surface there automatically since they use the same `submissions`/`answers` tables and shapes.

## Non-goals (explicitly deferred)

- Voice chat between team members (separate spec, LiveKit self-hosted, dedicated Hetzner server — infra sizing driven by 20-35 concurrent speakers per room across 2-3 rooms).
- Automatic/algorithmic team balancing.
- Member-side voting to elect a captain.
- Suggestion UI for non-option-based question types.
