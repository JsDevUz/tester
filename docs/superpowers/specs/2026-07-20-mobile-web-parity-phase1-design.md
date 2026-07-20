# Mobile ↔ Web Parity — Phase 1: Courses, Course Detail, Profile, Login

## Context

`apps/mobile` is a React Native (bare CLI, **no Expo**) student-only app that mirrors `apps/frontend` (React web, all roles). It was previously built by another AI pass and diverged significantly from the web app in both visuals and functionality. The user wants full 1:1 parity with web, screen by screen, starting with the highest-traffic screens.

This is a large effort, so it is split into ordered phases. **Phase 1** (this doc) covers: navigation shell, Login, Courses list (+ leaderboard), Course/Lesson detail (+ Practice), and Profile. Later phases (separate specs): History, Messenger, Test-taking, Live quiz, Classroom (LiveKit + PDF).

**Hard constraint confirmed by user: no WebView anywhere.** `WebScreen.tsx` and `react-native-webview` are removed entirely as screens are converted — every screen becomes real React Native UI backed by the same REST API the web app uses (`apps/backend`, shared, no backend changes needed for Phase 1).

**No Expo.** Any native capability (video playback, image picking, FLAG_SECURE) must use a bare-RN-CLI-compatible library with autolinking, not an Expo module.

## Current State (mobile, before this phase)

- `RootNavigator.tsx`: stack with `Login`, `Main` (5-tab bottom nav: Courses/History/Messenger/Live/Profile), `Course`, `Web` (WebView, to be deleted), `Chat`.
- `CoursesScreen`, `CourseScreen`, `ProfileScreen`, `LoginScreen`: minimal native implementations, missing most web functionality (see Gap Analysis).
- `types/api.ts`: `Course`, `CourseDetail`, `Lesson` types are simplified stand-ins for the real API shapes and need to be replaced with the actual shapes from `apps/frontend/src/api/groups.ts` and `apps/frontend/src/api/auth.ts`.
- Offline caching (`lib/storage.ts` `cached()` helper) and `NetworkProvider` already exist and should be preserved/reused — this is mobile-appropriate behavior the web doesn't need, not a deviation from parity.

## Gap Analysis (web → mobile)

### Navigation
- Web bottom nav has **4** items (Kurslar, Tarix, Xabarlar, Jonli musobaqalar); Profile is not a tab — it's opened as a modal/sheet from a 5th button that doesn't navigate.
- Mobile currently has **5** real tabs including a dedicated `Profile` screen.
- **Change:** mobile tab bar becomes 4 navigational tabs + a 5th "Profil" tab-bar button that opens a modal (not a stack screen), matching web's `StudentShell` pattern.
- Web shows a persistent "jonli dars ketmoqda" (live class in progress) banner above content on every page when a session is active, polled every 60s. Mobile should replicate this banner (native equivalent, e.g. rendered above the tab navigator content).

### Login (`LoginScreen.tsx` vs `LoginPage.tsx`)
- Mobile has password mode and Telegram-code mode. Missing: **forgot-password flow** — code verification (`apiVerifyPasswordResetCode`) then new-password form (`loginWithPasswordReset`), 2-step, same 6-digit code UI as Telegram login.
- Web auto-submits the code once 6 digits are entered (no explicit submit button, `sr-only` submit). Mobile should match this auto-submit UX for both the login-code and reset-code flows.
- Add `verifyPasswordResetCode` and `loginWithPasswordReset` actions to mobile `authStore.ts`, calling the same backend endpoints as web's `authStore.ts`.

### Courses list (`CoursesScreen.tsx` vs `MyCoursesPage.tsx`)
- Card content mostly matches (title, group, stars, student count, progress bar) but needs visual alignment (rounded-3xl card, stars badge styled as pill, icon tile).
- **Missing entirely: Leaderboard.** Web has a "Peshqadamlar" button per card that opens a bottom-sheet-style modal (`CourseLeaderboardModal`) showing:
  - Top-3 podium (ranked visually, avatars, gold/silver/bronze styling)
  - Remaining ranked list with avatar, name, lessons completed, stars, current-student highlight
  - Loading / error / empty states
  - Backed by `GET /my/courses/:id/leaderboard` (`apiGetMyCourseLeaderboard` — types already exist in web's `api/groups.ts`, need mobile equivalent).
- Mobile `types/api.ts` `Course` type needs the extra fields present in web's `ApiMyCourse` (`selectedPlanName`, `latestPaymentStatus`) even if not all are displayed yet, to keep the type accurate to the API.

### Course / Lesson detail (`CourseScreen.tsx` vs `MyCoursesPage.tsx`'s `StudentCourseReader` + `LessonReader` + `PracticeScreen`)
This is the largest gap. Web's course reader has three sub-views mobile must replicate as three native view-states within `CourseScreen` (or split into sub-components):

1. **Lesson list / TOC** (module-grouped, locked/unlocked)
   - Modules render as labeled groups (`Modul N` fallback title).
   - Lessons **lock progressively**: a lesson is locked if its global index exceeds `maxUnlockedIndex`, computed from consecutive completed lessons from the start. Locked lessons are non-interactive, dimmed, show a lock icon.
   - Each lesson row shows: icon (video camera if has video block, book otherwise, lock if locked), title, module label, video duration badge (if video block has `durationSec`), "Amaliyot" badge (if `practiceBlocks.length > 0`), total stars badge (`practiceBlocks` maxScore sum + `completionScore`), and a trailing state icon (lock / checkmark / chevron).
   - Progress header: `X / Y` completed count + progress bar.
   - Course-level stars total (`courseStars.earned / courseStars.max`) in header.
   - Missing: locking logic (mobile currently allows navigating any lesson freely).

2. **Lesson reader**
   - Sticky header: module title (small) + lesson title (large).
   - Messenger CTA banner: tapping calls `apiGetOrCreatePracticeChatForCourse(courseId)` then navigates to Messenger/Chat for that course's curator. Mobile currently has no equivalent — needs this action wired into Phase 1 (chat screen navigation itself is Phase 3, but the API call + navigation target should exist as soon as Messenger is built; for Phase 1, stub the destination or navigate to the Messenger tab with a filter param if Messenger isn't built yet — **needs a call**, see Open Question below).
   - Content blocks, in order, each type rendered distinctly:
     - `editor`: rich HTML block — **cannot use `dangerouslySetInnerHTML` in RN**. Needs an HTML-to-native renderer (e.g. `react-native-render-html`) to approximate web's rich text/embedded images. Images inside are tappable → lightbox.
     - `video`: if `embedUrl` present, embed (iframe on web — on mobile this likely means opening in an in-app browser or a simple WebView-for-embed-only exception; **but user said no WebView at all** — see Open Question). If no `embedUrl`, HLS video via `HlsVideoPlayer` equivalent — **mobile: `react-native-video`**, with watermark overlay (reuse pattern from web's `HlsVideoPlayer`) and **Android-only `FLAG_SECURE`** applied at the video screen/activity level (confirmed by user; iOS has no equivalent, accepted gap).
     - `image`: tappable, opens full-screen lightbox (pinch-zoom via `react-native-gesture-handler`/reanimated, already a dependency).
     - `file`: row with extension badge, filename, "download" affordance (open in native browser / share sheet since RN has no direct download-to-Files without an extra library — use `Linking.openURL` as mobile already does today for files).
     - `live_class`: tile linking to the classroom replay screen (`/classroom-history/:sessionId/replay` on web) — Phase 1 can navigate to a placeholder/Web fallback removed; replay screen itself is out of scope until the Classroom phase. For Phase 1, tapping this tile can deep-link out or show "tez orada" (coming soon) since full replay is a later phase — **Open Question**.
   - Prev/Next footer buttons. "Next" behavior: if lesson has practice blocks → opens Practice view; else marks lesson complete via `POST /lessons/:id/complete` and advances. Last lesson button reads "Yakunlash".
   - `passThresholdEnabled` gating: if enabled and student hasn't met `passThresholdPercent` via `combinedPracticePercent`, block advancing with an inline error message.
   - Anti-capture: web blocks copy/context-menu/devtools/print-screen (desktop-only concepts). Per user decision, mobile scope is limited to **Android `FLAG_SECURE`** on video/lesson screens; no other JS-level capture blocking is meaningful on native.

3. **Practice view** (`PracticeScreen.tsx` equivalent)
   - Header "Amaliy qism" + stars summary card (practice score + completion score, each `earned/max`).
   - Pass-threshold card (if enabled): shows required % and current combined %.
   - Per-practice-block card, 3 types:
     - `test`: shows past submission attempts (score/total, date, "Ochish" → view submission, which is test-result viewing, part of the Test-taking phase — for Phase 1 this can navigate to a "coming soon" or be stubbed pending that phase), "Qayta o'tish" button to start test (navigates into TestTaker — **out of scope for Phase 1**, stub navigation target), attempts-remaining counter, disabled state when attempts exhausted.
     - `image`: **new capability for mobile** — image submission upload flow. Shows up to 5 uploaded images with graded/pending status and score; upload via native image picker (**`react-native-image-picker`**, RN-CLI compatible, not Expo) → `apiUploadMedia` equivalent (multipart upload to `practice-submissions`) → `apiSubmitPracticeImage`; delete un-graded submissions.
     - `oral`: static informational card — no submission UI, just "kutilmoqda" state and grade display if graded.
   - "Darsga qaytish" back button, "Keyingi darsga o'tish" button (disabled unless `canComplete`).

### Profile (`ProfileScreen.tsx` vs `SettingsModal.tsx` + `EditProfileSection.tsx`)
- Mobile currently: full-screen `Profile` tab with avatar placeholder, name, phone, logout button only.
- Web: modal/bottom-sheet with two visible sections (student never sees "Adminlar" — `isSuperAdmin` gated, excluded from mobile entirely):
  - **Profile section** (`EditProfileSection`): avatar (tap to change via image picker → `apiUploadMedia(file, 'avatars')` → `apiUpdateProfile({avatarUrl})`), editable name field with save (only enabled when changed), current/new password change form.
  - **General section**: Dark Mode toggle. *(Open question: does mobile have a dark theme system today? If not, this phase should at minimum stub the toggle or confirm scope — see Open Questions.)*
  - Logout button, always visible in the sidebar/list.
- **Change:** `ProfileScreen.tsx` becomes a modal component (e.g. `ProfileSheet.tsx`) triggered from the tab bar's 5th button rather than a routed screen, matching web's interaction model. On phones (small screens), web collapses to a single-pane, section-list-first, drill-in-to-detail UX (`showDetailOnMobile`) — mobile should adopt this same drill-in pattern natively since it's already designed mobile-first on web.

## Data Layer Changes

- Replace mobile's simplified `types/api.ts` entries (`Course`, `CourseDetail`, `Lesson`) with types matching web's `ApiMyCourse`, `ApiMyCourseDetail`, `ApiMyModule`, `ApiMyLesson`, `ApiMyPracticeBlock`, `ApiMyImageSubmission`, `ApiMyPracticeSubmission`, `ApiMyCourseLeaderboard(Entry)`.
- Add mobile API functions mirroring: `apiGetMyCourseLeaderboard`, `apiMarkLessonComplete` (already exists), `apiGetOrCreatePracticeChatForCourse`, `apiUpdateProfile`, `apiUploadMedia`, `apiVerifyPasswordResetCode`, `apiSubmitPracticeImage`, `apiDeletePracticeImageSubmission`.
- Keep existing `cached()` offline-read-through wrapper for list/detail GETs; writes (complete lesson, submit image, update profile) require `online` and should reuse the existing `useNetwork()` guard pattern already used elsewhere in the mobile app.

## New Native Dependencies (bare RN CLI only, no Expo)

- `react-native-video` — HLS playback.
- `react-native-image-picker` — avatar and practice-image uploads.
- `react-native-render-html` (or equivalent) — rendering `editor` content blocks' HTML.
- Android `FLAG_SECURE`: set via `WindowManager.LayoutParams.FLAG_SECURE` in the native Android activity/fragment for lesson-video screens (small native module or existing community package if one exists; otherwise a minimal custom native module).
- Pinch-zoom lightbox: build on existing `react-native-gesture-handler` + `react-native-reanimated` (already present), no new dependency needed.

## Resolved Decisions

1. **Video `embedUrl` case**: scoped exception — a content block with `embedUrl` renders in an embedded `WebView` sized like the web `<iframe>` (aspect-video, contained to that block only). This is content-embedding, not the page-wrapper pattern being removed elsewhere; `react-native-webview` (already a mobile dependency) stays installed for this single purpose only. No other screen uses WebView.
2. **Messenger deep-link from lesson banner**: tapping "curator bilan suhbatlashish" calls `apiGetOrCreatePracticeChatForCourse` and navigates into the existing (pre-parity) `MessengerScreen`/`ChatScreen` — fully functional now, visually upgraded when Phase 3 lands.
3. **`live_class` block tile and test/practice submission viewing**: same treatment as #2 — link into whatever screen currently handles that destination (existing native screens, or the will-be-removed `WebScreen`/`Web` route only if no native destination exists yet for that specific target). Once the corresponding later phase ships, the destination screen upgrades automatically since the link target doesn't change.
4. **Dark mode**: out of scope for Phase 1. The Profile sheet's General section is omitted (or shows only what's needed for students) until a theme system is built in a later pass.

## Out of Scope (this phase)

- Test-taking UI (`TestTaker`) — Phase 4.
- Live quiz (`LivePlayPage`) — Phase 5.
- Classroom / LiveKit voice / PDF viewer — Phase 6.
- History and Messenger screens — Phases 2–3 (referenced here only as navigation targets).
- Backend changes — none needed; all required endpoints already exist and are shared with web.
