# Mobile ↔ Web Parity — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/mobile`'s Login, Courses list, Course/Lesson detail, Practice, and Profile screens to full visual and functional parity with `apps/frontend`'s equivalent student pages, replacing the generic native stand-ins that currently exist.

**Architecture:** Each web page's behavior is ported into the corresponding mobile screen using the same backend endpoints (`apps/backend`, no backend changes). Mobile keeps its existing offline-cache-through pattern (`cached()`) for reads and `useNetwork()` guards for writes — patterns web doesn't need but mobile already has and should keep. `WebScreen`/`Web` route is deleted from all Phase-1 navigation paths; the only WebView usage that remains is a scoped inline embed for lesson video blocks with `embedUrl`.

**Tech Stack:** React Native 0.86 (bare CLi, **no Expo**), TypeScript, NativeWind (Tailwind-in-RN), Zustand, `@react-navigation`, `react-native-video` (new), `react-native-image-picker` (new), `react-native-render-html` (new), `react-native-webview` (existing, scoped to embed blocks only), `react-native-gesture-handler` + `react-native-reanimated` (existing, used for lightbox zoom), Jest (unit tests for pure logic only — this codebase has no component-test culture; screens are verified manually).

## Global Constraints

- No Expo, anything. Only bare-RN-CLI-compatible libraries with autolinking.
- No WebView except one scoped exception: content blocks of type `video` with a non-null `embedUrl` render inline via `WebView` sized like web's `aspect-video` iframe. No other screen may use WebView; `WebScreen.tsx` and the `Web` stack route are deleted once nothing references them.
- Anti-capture scope: Android-only `FLAG_SECURE` on the lesson/video screen. No iOS equivalent, no JS-level copy/context-menu blocking (meaningless on native).
- Dark mode: out of scope. Profile sheet's General section is omitted this phase.
- Reuse existing endpoints only — see exact paths/signatures embedded in each task below, copied verbatim from `apps/frontend/src/api/*.ts`.
- Follow existing mobile code style: dense single-line component bodies (see `apps/mobile/src/components/Ui.tsx`, `apps/mobile/src/screens/*.tsx`) — match this house style in new/modified files rather than reformatting to multi-line.
- Test strategy: Jest unit tests for pure functions only (lesson-lock computation, phone masking, etc.). No React Testing Library / component rendering tests — this matches the codebase's existing single-smoke-test culture. Screens are verified via the `run` skill (simulator) at designated checkpoints.

---

## File Structure

**New files:**
- `apps/mobile/src/lib/phone.ts` — phone mask/format helpers (ported from web's `utils/phone.ts` + `LoginPage`'s `maskUzPhone`)
- `apps/mobile/src/lib/lessons.ts` — pure lesson-locking/progress/star calculation helpers extracted for testability
- `apps/mobile/src/api/auth.ts` — `apiUpdateProfile`, `apiChangePassword`, `apiVerifyPasswordResetCode`, `apiCompletePasswordReset`, `apiUploadMedia`
- `apps/mobile/src/api/groups.ts` — `apiGetMyCourses`, `apiGetMyCourseDetail`, `apiGetMyCourseLeaderboard`, `apiMarkLessonComplete`
- `apps/mobile/src/api/practiceMessenger.ts` — `apiGetOrCreatePracticeChatForCourse`
- `apps/mobile/src/api/practiceBlocks.ts` — `apiSubmitPracticeImage`, `apiDeletePracticeImageSubmission`
- `apps/mobile/src/components/CourseLeaderboardSheet.tsx` — leaderboard bottom sheet
- `apps/mobile/src/components/LessonBlock.tsx` — content block renderer (editor/video/image/file/live_class)
- `apps/mobile/src/components/HlsVideoPlayer.tsx` — HLS video with watermark, Android `FLAG_SECURE`
- `apps/mobile/src/components/ImageLightbox.tsx` — pinch-zoom fullscreen image viewer
- `apps/mobile/src/components/PracticeScreen.tsx` — practice-block view (test/image/oral)
- `apps/mobile/src/components/ProfileSheet.tsx` — profile bottom sheet (replaces `ProfileScreen` as a routed screen)
- `apps/mobile/src/components/LiveClassBanner.tsx` — persistent "jonli dars ketmoqda" banner
- `android/app/src/main/java/.../SecureScreenModule.java` (or `.kt`) + JS wrapper `apps/mobile/src/lib/secureScreen.ts` — Android `FLAG_SECURE` native module

**Modified files:**
- `apps/mobile/src/types/api.ts` — replace `Course`, `CourseDetail`, `Lesson` with accurate shapes
- `apps/mobile/src/screens/LoginScreen.tsx` — add forgot-password flow, auto-submit codes
- `apps/mobile/src/screens/CoursesScreen.tsx` — visual parity + leaderboard button
- `apps/mobile/src/screens/CourseScreen.tsx` — split into TOC / LessonReader / Practice states with locking, rewritten using new components
- `apps/mobile/src/navigation/RootNavigator.tsx` — remove `Profile` tab + `Web` route, add Profile-sheet trigger
- `apps/mobile/src/navigation/types.ts` — update param lists
- `apps/mobile/src/store/authStore.ts` — add `verifyPasswordResetCode`, `completePasswordReset`
- `apps/mobile/package.json` — add `react-native-video`, `react-native-image-picker`, `react-native-render-html`

**Deleted files:**
- `apps/mobile/src/screens/WebScreen.tsx`
- `apps/mobile/src/screens/ProfileScreen.tsx` (replaced by `ProfileSheet.tsx`, not routed)

---

### Task 1: Native dependencies install

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/ios/Podfile.lock` (regenerated by pod install)

**Interfaces:**
- Produces: `react-native-video` (default export `Video` component), `react-native-image-picker` (`launchImageLibrary` function), `react-native-render-html` (default export `RenderHtml` component) available for later tasks to import.

- [ ] **Step 1: Install packages**

Run:
```bash
cd apps/mobile && npm install react-native-video react-native-image-picker react-native-render-html
```
Expected: package.json `dependencies` gains all three; no peer-dependency errors printed.

- [ ] **Step 2: Install iOS pods**

Run:
```bash
cd apps/mobile/ios && pod install
```
Expected: `Pod installation complete!` with `RNVideo`, `react-native-image-picker` pods listed as installed.

- [ ] **Step 3: Verify Android autolinking picks up the new packages**

Run:
```bash
cd apps/mobile/android && ./gradlew :app:dependencies --configuration debugRuntimeClasspath | grep -i "react-native-video\|image-picker\|render-html"
```
Expected: entries for `react-native-video` and `react-native-image-picker` appear (render-html is pure-JS, won't show here — that's fine).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/ios/Podfile.lock
git commit -m "chore(mobile): add react-native-video, image-picker, render-html dependencies"
```

---

### Task 2: Android FLAG_SECURE native module

**Files:**
- Create: `apps/mobile/android/app/src/main/java/com/mobile/SecureScreenModule.kt`
- Create: `apps/mobile/android/app/src/main/java/com/mobile/SecureScreenPackage.kt`
- Modify: `apps/mobile/android/app/src/main/java/com/mobile/MainApplication.kt` (register package)
- Create: `apps/mobile/src/lib/secureScreen.ts`

**Interfaces:**
- Produces: `apps/mobile/src/lib/secureScreen.ts` exports `enableSecureScreen(): void` and `disableSecureScreen(): void` — no-ops on iOS (guarded by `Platform.OS === 'android'`), used by `HlsVideoPlayer.tsx` (Task 6).

First, find the actual package name used by the Android project:

- [ ] **Step 1: Confirm the Android package path**

Run:
```bash
find /Users/macbookpro/Documents/JsDev/portfolio/tester/apps/mobile/android/app/src/main/java -name "MainApplication.kt" -o -name "MainApplication.java"
```
Expected: one file path printed, e.g. `.../java/com/mobile/MainApplication.kt`. Use that exact package (replace `com.mobile` below if different) for every file in this task.

- [ ] **Step 2: Write the native module**

Create `apps/mobile/android/app/src/main/java/com/mobile/SecureScreenModule.kt`:

```kotlin
package com.mobile

import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SecureScreenModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SecureScreen"

    @ReactMethod
    fun enable() {
        currentActivity?.runOnUiThread {
            currentActivity?.window?.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
        }
    }

    @ReactMethod
    fun disable() {
        currentActivity?.runOnUiThread {
            currentActivity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
```

- [ ] **Step 3: Write the package registrar**

Create `apps/mobile/android/app/src/main/java/com/mobile/SecureScreenPackage.kt`:

```kotlin
package com.mobile

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SecureScreenPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(SecureScreenModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
```

- [ ] **Step 4: Register the package in MainApplication**

Open `apps/mobile/android/app/src/main/java/com/mobile/MainApplication.kt` and find the `getPackages()` override (it calls `PackageList(this).packages` and then usually `apply { add(...) }` for manual packages). Add `add(SecureScreenPackage())` to that list, e.g.:

```kotlin
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(SecureScreenPackage())
    }
```

- [ ] **Step 5: Write the JS wrapper**

Create `apps/mobile/src/lib/secureScreen.ts`:

```typescript
import {NativeModules, Platform} from 'react-native';

const {SecureScreen} = NativeModules as {
  SecureScreen?: {enable(): void; disable(): void};
};

export function enableSecureScreen(): void {
  if (Platform.OS === 'android') SecureScreen?.enable();
}

export function disableSecureScreen(): void {
  if (Platform.OS === 'android') SecureScreen?.disable();
}
```

- [ ] **Step 6: Build Android to verify the module registers without crashing**

Run:
```bash
cd apps/mobile && npm run android
```
Expected: app builds and launches in the emulator/device without a red-screen native module error. (Functional verification of the flag itself happens in Task 6's manual check, once a screen calls `enableSecureScreen()`.)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/android/app/src/main/java/com/mobile/SecureScreenModule.kt apps/mobile/android/app/src/main/java/com/mobile/SecureScreenPackage.kt apps/mobile/android/app/src/main/java/com/mobile/MainApplication.kt apps/mobile/src/lib/secureScreen.ts
git commit -m "feat(mobile): add Android FLAG_SECURE native module for video screens"
```

---

### Task 3: API types and client functions

**Files:**
- Modify: `apps/mobile/src/types/api.ts`
- Create: `apps/mobile/src/api/auth.ts`
- Create: `apps/mobile/src/api/groups.ts`
- Create: `apps/mobile/src/api/practiceMessenger.ts`
- Create: `apps/mobile/src/api/practiceBlocks.ts`
- Test: `apps/mobile/__tests__/lessons.test.ts`
- Create: `apps/mobile/src/lib/lessons.ts`

**Interfaces:**
- Consumes: `apps/mobile/src/lib/api.ts`'s `api` (axios instance, already exists — has base URL + auth header interceptor).
- Produces (all consumed by later tasks):
  - `types/api.ts`: `ApiMyCourse`, `ApiMyCourseDetail`, `ApiMyModule`, `ApiMyLesson`, `ApiMyPracticeBlock`, `ApiMyImageSubmission`, `ApiMyPracticeSubmission`, `ApiMyCourseLeaderboard`, `ApiMyCourseLeaderboardEntry`, `ApiContentBlock`, `Admin`.
  - `api/auth.ts`: `apiUpdateProfile(input: {name?: string; avatarUrl?: string}): Promise<Admin>`, `apiChangePassword(currentPassword: string, newPassword: string): Promise<{ok: true}>`, `apiVerifyPasswordResetCode(code: string): Promise<{resetToken: string}>`, `apiCompletePasswordReset(input: {resetToken: string; newPassword: string; confirmPassword: string}): Promise<{access_token: string; admin: Admin}>`, `apiUploadMedia(asset: {uri: string; type: string; name: string}, folder: 'lessons'|'questions'|'payments'|'practice-submissions'|'avatars'): Promise<{url: string; type: 'image'|'audio'|'file'}>`.
  - `api/groups.ts`: `apiGetMyCourses(): Promise<ApiMyCourse[]>`, `apiGetMyCourseDetail(courseId: string): Promise<ApiMyCourseDetail>`, `apiGetMyCourseLeaderboard(courseId: string): Promise<ApiMyCourseLeaderboard>`, `apiMarkLessonComplete(lessonId: string): Promise<{completedAt: string}>`.
  - `api/practiceMessenger.ts`: `apiGetOrCreatePracticeChatForCourse(courseId: string): Promise<{chatId: string}>`.
  - `api/practiceBlocks.ts`: `apiSubmitPracticeImage(practiceBlockId: string, imageUrl: string): Promise<ApiMyImageSubmission>`, `apiDeletePracticeImageSubmission(id: string): Promise<void>`.
  - `lib/lessons.ts`: `computeMaxUnlockedIndex(lessons: {completed: boolean}[]): number`, `isLessonPassing(lesson: {practiceBlocks: {type: string; submissions: unknown[]}[]; passThresholdEnabled: boolean; combinedPracticePercent: number | null; passThresholdPercent: number | null}): boolean`, `computeCourseStars(lessons: {lesson: {practiceBlocks: {maxScore: number | null; earnedScore: number | null}[]; completionScore: number | null; completed: boolean}}[]): {earned: number; max: number}`.

- [ ] **Step 1: Replace mobile's `types/api.ts`**

Replace the full contents of `apps/mobile/src/types/api.ts`:

```typescript
export type Admin = {
  id: string;
  name: string;
  role: 'student' | 'teacher' | 'super' | 'curator';
  phone?: string | null;
  avatarUrl?: string | null;
};
export type User = Admin;

export type Submission = {
  id: string;
  testId: string;
  testName?: string;
  submittedAt: string | null;
  score: number | null;
  total: number | null;
};

export type ApiMyCourse = {
  courseId: string;
  courseTitle: string;
  groupName: string;
  selectedPlanName: string | null;
  latestPaymentStatus: 'pending' | 'partial' | 'paid' | 'debt' | null;
  hasAccess: boolean;
  starsEarned: number;
  starsMax: number;
  studentCount: number;
  lessonsCompleted: number;
  lessonsTotal: number;
  progressPercent: number;
};

export type ApiMyCourseLeaderboardEntry = {
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  starsEarned: number;
  lessonsCompleted: number;
  lessonsTotal: number;
  isCurrentStudent: boolean;
  rank: number;
};

export type ApiMyCourseLeaderboard = {
  courseTitle: string;
  entries: ApiMyCourseLeaderboardEntry[];
};

export type ApiContentBlock = {
  id: string;
  type: 'editor' | 'video' | 'image' | 'file' | 'live_class';
  html?: string | null;
  embedUrl?: string | null;
  previewUrl?: string | null;
  label?: string | null;
  fileName?: string | null;
  durationSec?: number | null;
  processingStatus?: string | null;
  classSessionId?: string | null;
  [key: string]: unknown;
};

export type ApiMyPracticeSubmission = {
  id: string;
  submittedAt: string;
  score: number;
  total: number;
};

export type ApiMyImageSubmission = {
  id: string;
  imageUrl: string;
  submittedAt: string;
  score: number | null;
  graded: boolean;
};

export type ApiMyPracticeBlock = {
  id: string;
  type: 'test' | 'image' | 'oral';
  testId: string | null;
  testSlug: string | null;
  testName: string | null;
  description: string;
  maxScore: number | null;
  earnedScore: number | null;
  submissions: ApiMyPracticeSubmission[];
  attemptsRemaining: number | null;
  imageSubmissions: ApiMyImageSubmission[];
  oralGrade: {score: number; gradedAt: string} | null;
};

export type ApiMyLesson = {
  id: string;
  moduleId: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  createdAt: string;
  blocks: ApiContentBlock[];
  practiceBlocks: ApiMyPracticeBlock[];
  passThresholdEnabled: boolean;
  passThresholdPercent: number | null;
  completionScore: number | null;
  completed: boolean;
  combinedPracticePercent: number | null;
};

export type ApiMyModule = {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
  createdAt: string;
  lessons: ApiMyLesson[];
};

export type ApiMyCourseDetail = {
  id: string;
  title: string;
  curatorName: string | null;
  modules: ApiMyModule[];
};

export type ChatPreview = {
  id: string;
  courseTitle: string;
  groupName: string;
  curator: {id: string; name: string; avatarUrl: string | null};
  lastMessage: {content: string; createdAt: string} | null;
};
export type ChatMessage = {
  id: string;
  sender: {id: string; name: string};
  type: string;
  content: string;
  createdAt: string;
  deletedAt: string | null;
};
export type ActiveClass = {
  id: string;
  courseId: string;
  courseName: string;
  startedAt: number;
};
```

- [ ] **Step 2: Create `apps/mobile/src/api/auth.ts`**

```typescript
import {api} from '../lib/api';
import type {Admin} from '../types/api';

export async function apiUpdateProfile(input: {
  name?: string;
  avatarUrl?: string;
}): Promise<Admin> {
  const res = await api.patch('/auth/me', input);
  return res.data;
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ok: true}> {
  const res = await api.patch('/auth/me/password', {
    currentPassword,
    newPassword,
  });
  return res.data;
}

export async function apiVerifyPasswordResetCode(
  code: string,
): Promise<{resetToken: string}> {
  const res = await api.post('/auth/password/reset/verify-code', {code});
  return res.data;
}

export async function apiCompletePasswordReset(input: {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{access_token: string; admin: Admin}> {
  const res = await api.post('/auth/password/reset/complete', input);
  return res.data;
}

export async function apiUploadMedia(
  asset: {uri: string; type: string; name: string},
  folder: 'lessons' | 'questions' | 'payments' | 'practice-submissions' | 'avatars',
): Promise<{url: string; type: 'image' | 'audio' | 'file'}> {
  const form = new FormData();
  // React Native FormData accepts {uri, type, name} directly as a file part.
  form.append('file', asset as unknown as Blob);
  form.append('folder', folder);
  const res = await api.post('/upload', form, {
    headers: {'Content-Type': 'multipart/form-data'},
  });
  return res.data;
}
```

- [ ] **Step 3: Create `apps/mobile/src/api/groups.ts`**

```typescript
import {api} from '../lib/api';
import type {ApiMyCourse, ApiMyCourseDetail, ApiMyCourseLeaderboard} from '../types/api';

export async function apiGetMyCourses(): Promise<ApiMyCourse[]> {
  const res = await api.get('/my/courses');
  return res.data;
}

export async function apiGetMyCourseDetail(courseId: string): Promise<ApiMyCourseDetail> {
  const res = await api.get(`/my/courses/${courseId}`);
  return res.data;
}

export async function apiGetMyCourseLeaderboard(
  courseId: string,
): Promise<ApiMyCourseLeaderboard> {
  const res = await api.get(`/my/courses/${courseId}/leaderboard`);
  return res.data;
}

export async function apiMarkLessonComplete(
  lessonId: string,
): Promise<{completedAt: string}> {
  const res = await api.post(`/lessons/${lessonId}/complete`);
  return res.data;
}
```

- [ ] **Step 4: Create `apps/mobile/src/api/practiceMessenger.ts`**

```typescript
import {api} from '../lib/api';

export async function apiGetOrCreatePracticeChatForCourse(
  courseId: string,
): Promise<{chatId: string}> {
  const res = await api.post(`/practice-messenger/courses/${courseId}/chat`);
  return res.data;
}
```

- [ ] **Step 5: Create `apps/mobile/src/api/practiceBlocks.ts`**

```typescript
import {api} from '../lib/api';
import type {ApiMyImageSubmission} from '../types/api';

export async function apiSubmitPracticeImage(
  practiceBlockId: string,
  imageUrl: string,
): Promise<ApiMyImageSubmission> {
  const res = await api.post(`/practice-blocks/${practiceBlockId}/image-submissions`, {
    imageUrl,
  });
  return res.data;
}

export async function apiDeletePracticeImageSubmission(id: string): Promise<void> {
  await api.delete(`/image-submissions/${id}`);
}
```

- [ ] **Step 6: Write the failing test for lesson-locking logic**

Create `apps/mobile/__tests__/lessons.test.ts`:

```typescript
import {computeMaxUnlockedIndex, isLessonPassing, computeCourseStars} from '../src/lib/lessons';

describe('computeMaxUnlockedIndex', () => {
  it('unlocks only the first lesson when nothing is completed', () => {
    expect(computeMaxUnlockedIndex([{completed: false}, {completed: false}])).toBe(0);
  });

  it('unlocks up to one past the last consecutive completed lesson', () => {
    expect(
      computeMaxUnlockedIndex([{completed: true}, {completed: true}, {completed: false}]),
    ).toBe(2);
  });

  it('stops at the first incomplete lesson even if later ones are complete', () => {
    expect(
      computeMaxUnlockedIndex([{completed: true}, {completed: false}, {completed: true}]),
    ).toBe(1);
  });

  it('returns -1 for an empty lesson list', () => {
    expect(computeMaxUnlockedIndex([])).toBe(-1);
  });

  it('unlocks everything when all lessons are completed', () => {
    expect(
      computeMaxUnlockedIndex([{completed: true}, {completed: true}]),
    ).toBe(1);
  });
});

describe('isLessonPassing', () => {
  it('fails when a test practice block has no submissions yet', () => {
    expect(
      isLessonPassing({
        practiceBlocks: [{type: 'test', submissions: []}],
        passThresholdEnabled: true,
        combinedPracticePercent: 90,
        passThresholdPercent: 50,
      }),
    ).toBe(false);
  });

  it('passes when threshold is disabled regardless of score', () => {
    expect(
      isLessonPassing({
        practiceBlocks: [],
        passThresholdEnabled: false,
        combinedPracticePercent: null,
        passThresholdPercent: null,
      }),
    ).toBe(true);
  });

  it('fails when combined percent is below the threshold', () => {
    expect(
      isLessonPassing({
        practiceBlocks: [{type: 'test', submissions: [{}]}],
        passThresholdEnabled: true,
        combinedPracticePercent: 40,
        passThresholdPercent: 50,
      }),
    ).toBe(false);
  });

  it('passes when combined percent meets the threshold', () => {
    expect(
      isLessonPassing({
        practiceBlocks: [{type: 'test', submissions: [{}]}],
        passThresholdEnabled: true,
        combinedPracticePercent: 50,
        passThresholdPercent: 50,
      }),
    ).toBe(true);
  });
});

describe('computeCourseStars', () => {
  it('sums earned and max across practice blocks and completion scores', () => {
    const result = computeCourseStars([
      {
        lesson: {
          practiceBlocks: [{maxScore: 5, earnedScore: 3}],
          completionScore: 2,
          completed: true,
        },
      },
      {
        lesson: {
          practiceBlocks: [{maxScore: 4, earnedScore: null}],
          completionScore: 1,
          completed: false,
        },
      },
    ]);
    expect(result).toEqual({earned: 5, max: 12});
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run:
```bash
cd apps/mobile && npx jest __tests__/lessons.test.ts
```
Expected: FAIL — `Cannot find module '../src/lib/lessons'`.

- [ ] **Step 8: Implement `apps/mobile/src/lib/lessons.ts`**

```typescript
type CompletableLesson = {completed: boolean};

export function computeMaxUnlockedIndex(lessons: CompletableLesson[]): number {
  if (lessons.length === 0) return -1;
  let idx = 0;
  for (let i = 0; i < lessons.length - 1; i++) {
    if (!lessons[i].completed) break;
    idx = i + 1;
  }
  return idx;
}

type PassableLesson = {
  practiceBlocks: {type: string; submissions: unknown[]}[];
  passThresholdEnabled: boolean;
  combinedPracticePercent: number | null;
  passThresholdPercent: number | null;
};

export function isLessonPassing(lesson: PassableLesson): boolean {
  const allTestsAttempted = lesson.practiceBlocks
    .filter(block => block.type === 'test')
    .every(block => block.submissions.length > 0);
  if (!allTestsAttempted) return false;
  if (!lesson.passThresholdEnabled) return true;
  if (lesson.combinedPracticePercent === null) return false;
  return lesson.combinedPracticePercent >= (lesson.passThresholdPercent ?? 0);
}

type StarredLessonEntry = {
  lesson: {
    practiceBlocks: {maxScore: number | null; earnedScore: number | null}[];
    completionScore: number | null;
    completed: boolean;
  };
};

export function computeCourseStars(entries: StarredLessonEntry[]): {
  earned: number;
  max: number;
} {
  let earned = 0;
  let max = 0;
  for (const {lesson} of entries) {
    for (const block of lesson.practiceBlocks) {
      max += block.maxScore ?? 0;
      earned += block.earnedScore ?? 0;
    }
    if (lesson.completionScore !== null) {
      max += lesson.completionScore;
      if (lesson.completed) earned += lesson.completionScore;
    }
  }
  return {earned, max};
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run:
```bash
cd apps/mobile && npx jest __tests__/lessons.test.ts
```
Expected: PASS, 9 tests passed.

- [ ] **Step 10: Typecheck the whole mobile app**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors referencing the new/modified files (pre-existing unrelated errors, if any, are out of scope for this task).

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/types/api.ts apps/mobile/src/api/auth.ts apps/mobile/src/api/groups.ts apps/mobile/src/api/practiceMessenger.ts apps/mobile/src/api/practiceBlocks.ts apps/mobile/src/lib/lessons.ts apps/mobile/__tests__/lessons.test.ts
git commit -m "feat(mobile): add accurate API types, client functions, and lesson-progress helpers"
```

---

### Task 4: Login screen — forgot-password flow + auto-submit

**Files:**
- Modify: `apps/mobile/src/screens/LoginScreen.tsx`
- Modify: `apps/mobile/src/store/authStore.ts`
- Create: `apps/mobile/src/lib/phone.ts`
- Test: `apps/mobile/__tests__/phone.test.ts`

**Interfaces:**
- Consumes: `apiVerifyPasswordResetCode`, `apiCompletePasswordReset` from `apps/mobile/src/api/auth.ts` (Task 3).
- Produces: `authStore` gains `verifyPasswordResetCode(code: string): Promise<{resetToken: string}>` and `completePasswordReset(resetToken: string, newPassword: string, confirmPassword: string): Promise<void>`. `lib/phone.ts` exports `maskUzPhone(value: string): string`.

- [ ] **Step 1: Write the failing test for phone masking**

Create `apps/mobile/__tests__/phone.test.ts`:

```typescript
import {maskUzPhone} from '../src/lib/phone';

describe('maskUzPhone', () => {
  it('formats raw digits into +998 XX XXX XX XX', () => {
    expect(maskUzPhone('998901234567')).toBe('+998 90 123 45 67');
  });

  it('strips non-digit characters before formatting', () => {
    expect(maskUzPhone('+998 (90) 123-45-67')).toBe('+998 90 123 45 67');
  });

  it('caps input at 9 significant digits after the country code', () => {
    expect(maskUzPhone('9989012345671234')).toBe('+998 90 123 45 67');
  });

  it('handles partial input', () => {
    expect(maskUzPhone('99890')).toBe('+998 90');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/mobile && npx jest __tests__/phone.test.ts
```
Expected: FAIL — `Cannot find module '../src/lib/phone'`.

- [ ] **Step 3: Implement `apps/mobile/src/lib/phone.ts`**

Ported from `apps/frontend/src/pages/LoginPage.tsx`'s `maskUzPhone`:

```typescript
export function maskUzPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('998')) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 5),
    digits.slice(5, 7),
    digits.slice(7, 9),
  ].filter(Boolean);
  return `+998${parts.length ? ` ${parts.join(' ')}` : ' '}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/mobile && npx jest __tests__/phone.test.ts
```
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Add password-reset actions to `authStore.ts`**

Read the current full contents of `apps/mobile/src/store/authStore.ts` (shown in full in Task/context above — single-line style), then replace it with:

```typescript
import {create} from 'zustand';
import {api} from '../lib/api';
import {apiCompletePasswordReset, apiVerifyPasswordResetCode} from '../api/auth';
import {storage} from '../lib/storage';
import type {User} from '../types/api';
type AuthState={token:string|null;user:User|null;hydrated:boolean;hydrate:()=>Promise<void>;login:(phone:string,password:string)=>Promise<void>;loginCode:(code:string)=>Promise<void>;verifyPasswordResetCode:(code:string)=>Promise<{resetToken:string}>;completePasswordReset:(resetToken:string,newPassword:string,confirmPassword:string)=>Promise<void>;logout:()=>Promise<void>};
export const useAuthStore=create<AuthState>(set=>({
  token:null,user:null,hydrated:false,
  hydrate:async()=>{const session=await storage.get<{token:string;user:User}>('session');set({token:session?.token??null,user:session?.user??null,hydrated:true});if(session?.token)api.get('/auth/me').then(r=>{const next={token:session.token,user:r.data as User};set(next);void storage.set('session',next);}).catch(()=>undefined);},
  login:async(phone,password)=>{const{data}=await api.post('/auth/login',{phone,password});if(data.admin.role!=='student')throw new Error("Bu ilova faqat o'quvchilar uchun");const session={token:data.access_token,user:data.admin};await storage.set('session',session);set(session);},
  loginCode:async code=>{const{data}=await api.post('/auth/telegram/verify',{code});if(data.admin.role!=='student')throw new Error("Bu ilova faqat o'quvchilar uchun");const session={token:data.access_token,user:data.admin};await storage.set('session',session);set(session);},
  verifyPasswordResetCode:async code=>apiVerifyPasswordResetCode(code),
  completePasswordReset:async(resetToken,newPassword,confirmPassword)=>{const data=await apiCompletePasswordReset({resetToken,newPassword,confirmPassword});if(data.admin.role!=='student')throw new Error("Bu ilova faqat o'quvchilar uchun");const session={token:data.access_token,user:data.admin};await storage.set('session',session);set(session);},
  logout:async()=>{await storage.remove('session');set({token:null,user:null});},
}));
```

- [ ] **Step 6: Rewrite `LoginScreen.tsx` with forgot-password flow**

Replace the full contents of `apps/mobile/src/screens/LoginScreen.tsx`:

```tsx
import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Button} from '../components/Ui';
import {getApiErrorMessage} from '../lib/errors';
import {maskUzPhone} from '../lib/phone';
import {useNetwork} from '../providers/NetworkProvider';
import {useAuthStore} from '../store/authStore';

const CODE_LENGTH = 6;

function CodeInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={text => onChange(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
      keyboardType="number-pad"
      maxLength={CODE_LENGTH}
      autoFocus={autoFocus}
      placeholder="6 xonali kod"
      className="mb-4 h-14 rounded-2xl border border-slate-200 px-4 text-center text-xl tracking-widest text-ink"
    />
  );
}

export function LoginScreen() {
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [phone, setPhone] = useState('+998 ');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<'code' | 'password'>('code');
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const login = useAuthStore(state => state.login);
  const loginCode = useAuthStore(state => state.loginCode);
  const verifyPasswordResetCode = useAuthStore(state => state.verifyPasswordResetCode);
  const completePasswordReset = useAuthStore(state => state.completePasswordReset);
  const {online} = useNetwork();
  const submittedCodeRef = useRef('');
  const submittedResetCodeRef = useRef('');

  useEffect(() => {
    if (mode !== 'code' || code.length !== CODE_LENGTH || loading) return;
    if (submittedCodeRef.current === code) return;
    submittedCodeRef.current = code;
    void submit();
  }, [code, mode]);

  useEffect(() => {
    if (!forgotMode || forgotStep !== 'code' || resetCode.length !== CODE_LENGTH || loading)
      return;
    if (submittedResetCodeRef.current === resetCode) return;
    submittedResetCodeRef.current = resetCode;
    void submitResetCode();
  }, [resetCode, forgotMode, forgotStep]);

  async function submit() {
    if (!online) {
      Alert.alert('Internet kerak', 'Kirish faqat online holatda ishlaydi.');
      return;
    }
    if (mode === 'code' && code.length !== CODE_LENGTH) {
      Alert.alert('Kod to‘liq emas', 'Telegram bot yuborgan 6 xonali kodni kiriting.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'password') await login(phone, password);
      else await loginCode(code);
    } catch (error) {
      setCode('');
      submittedCodeRef.current = '';
      Alert.alert(
        'Kirish amalga oshmadi',
        getApiErrorMessage(error, "Ma'lumotlarni tekshirib, qayta urinib ko'ring."),
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitResetCode() {
    if (!online) {
      Alert.alert('Internet kerak', 'Bu amal faqat online holatda ishlaydi.');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPasswordResetCode(resetCode);
      setResetToken(result.resetToken);
      setForgotStep('password');
    } catch (error) {
      setResetCode('');
      submittedResetCodeRef.current = '';
      Alert.alert(
        'Kod noto‘g‘ri',
        getApiErrorMessage(error, 'Kod noto‘g‘ri yoki muddati tugagan'),
      );
    } finally {
      setLoading(false);
    }
  }

  async function completeReset() {
    if (resetPassword.length < 8) {
      Alert.alert('Parol qisqa', "Parol kamida 8 ta belgidan iborat bo'lishi kerak.");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      Alert.alert('Mos kelmadi', 'Parollar mos kelmadi.');
      return;
    }
    setLoading(true);
    try {
      await completePasswordReset(resetToken, resetPassword, resetPasswordConfirm);
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Parolni yangilab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  }

  function backToLogin() {
    setForgotMode(false);
    setForgotStep('code');
    setResetCode('');
    setResetToken('');
    setResetPassword('');
    setResetPasswordConfirm('');
    submittedResetCodeRef.current = '';
  }

  function switchMode() {
    setMode(current => (current === 'password' ? 'code' : 'password'));
    setCode('');
    submittedCodeRef.current = '';
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 justify-center bg-white px-6">
      <View className="mb-10">
        <Text className="text-4xl font-black text-ink">BirKod</Text>
        <Text className="mt-2 text-base text-slate-400">O'quvchi mobil ilovasi</Text>
      </View>

      {!online ? (
        <Text className="mb-4 rounded-xl bg-amber-100 p-3 text-sm text-amber-800">
          Birinchi kirish uchun internet kerak.
        </Text>
      ) : null}

      {forgotMode ? (
        forgotStep === 'code' ? (
          <>
            <Text className="mb-4 text-center text-sm leading-5 text-slate-500">
              Telegram botdan yangi 6 xonali kod oling.
            </Text>
            <CodeInput value={resetCode} onChange={setResetCode} autoFocus />
          </>
        ) : (
          <>
            <TextInput
              value={resetPassword}
              onChangeText={setResetPassword}
              secureTextEntry
              placeholder="Yangi parol"
              autoFocus
              className="mb-3 h-14 rounded-2xl border border-slate-200 px-4 text-base text-ink"
            />
            <TextInput
              value={resetPasswordConfirm}
              onChangeText={setResetPasswordConfirm}
              secureTextEntry
              placeholder="Yangi parolni tasdiqlang"
              className="mb-4 h-14 rounded-2xl border border-slate-200 px-4 text-base text-ink"
            />
            <Button title="Parolni saqlash va kirish" loading={loading} onPress={completeReset} />
          </>
        )
      ) : mode === 'password' ? (
        <>
          <TextInput
            value={phone}
            onChangeText={text => setPhone(maskUzPhone(text))}
            keyboardType="phone-pad"
            placeholder="Telefon"
            className="mb-3 h-14 rounded-2xl border border-slate-200 px-4 text-base text-ink"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Parol"
            className="mb-4 h-14 rounded-2xl border border-slate-200 px-4 text-base text-ink"
          />
          <Button title="Kirish" loading={loading} onPress={submit} />
        </>
      ) : (
        <>
          <Text className="mb-4 text-center text-sm leading-5 text-slate-500">
            Telegram botdan yangi 6 xonali kod oling. Kod 5 daqiqa amal qiladi.
          </Text>
          <CodeInput value={code} onChange={setCode} />
        </>
      )}

      {!forgotMode && (
        <>
          <Pressable onPress={switchMode} className="mt-5 p-3">
            <Text className="text-center font-semibold text-brand">
              {mode === 'password'
                ? 'Telegram kodi bilan kirish'
                : 'Telefon va parol bilan kirish'}
            </Text>
          </Pressable>
          {mode === 'password' && (
            <Pressable onPress={() => setForgotMode(true)} className="p-3">
              <Text className="text-center text-xs font-semibold text-slate-400">
                Parolni unutdim
              </Text>
            </Pressable>
          )}
        </>
      )}
      {forgotMode && (
        <Pressable onPress={backToLogin} className="mt-5 p-3">
          <Text className="text-center font-semibold text-brand">Login bilan kirish</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 7: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors in `LoginScreen.tsx` or `authStore.ts`.

- [ ] **Step 8: Manual verification checkpoint**

Run the app (see Task 10 for the full `run` skill checkpoint) and manually verify: password login works, Telegram-code login auto-submits at 6 digits, "Parolni unutdim" → code entry → auto-verifies → new password form → submits and logs in.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/screens/LoginScreen.tsx apps/mobile/src/store/authStore.ts apps/mobile/src/lib/phone.ts apps/mobile/__tests__/phone.test.ts
git commit -m "feat(mobile): add forgot-password flow and auto-submit codes to login"
```

---

### Task 5: Courses list + leaderboard sheet

**Files:**
- Modify: `apps/mobile/src/screens/CoursesScreen.tsx`
- Create: `apps/mobile/src/components/CourseLeaderboardSheet.tsx`

**Interfaces:**
- Consumes: `apiGetMyCourses` (Task 3), `apiGetMyCourseLeaderboard` (Task 3), `ApiMyCourse`/`ApiMyCourseLeaderboard`/`ApiMyCourseLeaderboardEntry` (Task 3), `cached` (existing `lib/storage.ts`).
- Produces: `CourseLeaderboardSheet` component with props `{course: ApiMyCourse; onClose: () => void}`, used only within `CoursesScreen.tsx` in this task (no other consumers this phase).

- [ ] **Step 1: Create the leaderboard sheet**

Create `apps/mobile/src/components/CourseLeaderboardSheet.tsx`:

```tsx
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Modal, Pressable, Text, View} from 'react-native';
import {Star, Trophy, X} from 'lucide-react-native';
import {api} from '../lib/api';
import {getApiErrorMessage} from '../lib/errors';
import type {ApiMyCourse, ApiMyCourseLeaderboard, ApiMyCourseLeaderboardEntry} from '../types/api';

async function fetchLeaderboard(courseId: string): Promise<ApiMyCourseLeaderboard> {
  const res = await api.get(`/my/courses/${courseId}/leaderboard`);
  return res.data;
}

function RankAvatar({entry, size}: {entry: ApiMyCourseLeaderboardEntry; size: number}) {
  const initials = (entry.studentName || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();
  return (
    <View
      style={{width: size, height: size, borderRadius: size / 2}}
      className="items-center justify-center bg-white/20">
      <Text className="font-bold text-white">{initials}</Text>
    </View>
  );
}

export function CourseLeaderboardSheet({
  course,
  onClose,
}: {
  course: ApiMyCourse;
  onClose: () => void;
}) {
  const [data, setData] = useState<ApiMyCourseLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchLeaderboard(course.courseId)
      .then(result => {
        if (active) setData(result);
      })
      .catch(err => {
        if (active) setError(getApiErrorMessage(err, 'Reytingni yuklab bo‘lmadi.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [course.courseId]);

  const topThree = data?.entries.slice(0, 3) ?? [];
  const remaining = data?.entries.slice(3) ?? [];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[85%] rounded-t-3xl bg-indigo-600 p-5">
          <View className="mb-4 flex-row items-start justify-between">
            <View>
              <Text className="text-xs font-medium text-white/70">{course.courseTitle}</Text>
              <Text className="mt-1 flex-row items-center text-xl font-bold text-white">
                Peshqadamlar
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-xl bg-white/10">
              <X size={18} color="white" />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color="white" className="py-16" />
          ) : error ? (
            <Text className="py-16 text-center text-sm text-red-100">{error}</Text>
          ) : data?.entries.length === 0 ? (
            <Text className="py-16 text-center text-sm text-white/75">
              Hali reyting uchun o'quvchilar yo'q.
            </Text>
          ) : (
            <FlatList
              data={remaining}
              keyExtractor={item => item.studentId}
              ListHeaderComponent={
                <View className="mb-4 flex-row items-end justify-center gap-2">
                  {[topThree[1], topThree[0], topThree[2]].filter(Boolean).map(entry => (
                    <View key={entry!.studentId} className="w-24 items-center">
                      <View className="relative mb-2">
                        <RankAvatar entry={entry!} size={48} />
                        <View className="absolute -bottom-1 -right-1 h-5 w-5 items-center justify-center rounded-full bg-white">
                          <Text className="text-[10px] font-bold text-gray-800">
                            {entry!.rank}
                          </Text>
                        </View>
                      </View>
                      <Text
                        numberOfLines={1}
                        className="w-full text-center text-xs font-semibold text-white">
                        {entry!.studentName}
                      </Text>
                      <View className="mt-1 flex-row items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
                        <Star size={11} color="#fde68a" fill="#fde68a" />
                        <Text className="text-[11px] font-bold text-amber-100">
                          {entry!.starsEarned}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              }
              renderItem={({item}) => (
                <View
                  className={`mb-2 flex-row items-center gap-2 rounded-xl px-3 py-2.5 ${
                    item.isCurrentStudent ? 'bg-white/25' : 'bg-white/15'
                  }`}>
                  <Text className="w-6 text-center text-sm font-bold text-white/80">
                    {item.rank}
                  </Text>
                  <RankAvatar entry={item} size={32} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-semibold text-white">
                      {item.studentName}
                      {item.isCurrentStudent ? ' (Siz)' : ''}
                    </Text>
                    <Text className="text-[11px] text-white/70">
                      {item.lessonsCompleted}/{item.lessonsTotal} dars
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1 rounded-full bg-amber-400/90 px-2 py-1">
                    <Star size={12} color="#78350f" fill="#78350f" />
                    <Text className="text-xs font-bold text-amber-950">{item.starsEarned}</Text>
                  </View>
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

- [ ] **Step 2: Rewrite `CoursesScreen.tsx` with leaderboard trigger**

Replace the full contents of `apps/mobile/src/screens/CoursesScreen.tsx`:

```tsx
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, RefreshControl, Text, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {BookOpen, Star, Trophy, Users} from 'lucide-react-native';
import {api} from '../lib/api';
import {cached} from '../lib/storage';
import type {ApiMyCourse} from '../types/api';
import type {RootStackParamList} from '../navigation/types';
import {Empty, Header, Loading, OfflineBanner, Screen, StaleNote} from '../components/Ui';
import {CourseLeaderboardSheet} from '../components/CourseLeaderboardSheet';

async function fetchMyCourses(): Promise<ApiMyCourse[]> {
  const res = await api.get('/my/courses');
  return res.data;
}

export function CoursesScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [data, setData] = useState<ApiMyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [leaderboardCourse, setLeaderboardCourse] = useState<ApiMyCourse | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await cached('courses', fetchMyCourses);
      setData(r.data);
      setStale(r.stale);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      <OfflineBanner />
      <Header title="Mening kurslarim" />
      <StaleNote stale={stale} />
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data}
          keyExtractor={x => x.courseId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={<Empty text="Hali hech qanday kursga qo'shilmagansiz" />}
          contentContainerClassName="px-4 pb-6"
          renderItem={({item}) => (
            <View className="mt-3 rounded-3xl bg-white p-5">
              <Pressable
                onPress={() =>
                  navigation.navigate('Course', {courseId: item.courseId, title: item.courseTitle})
                }>
                <View className="flex-row justify-between">
                  <View className="mr-3 flex-1">
                    {item.starsMax > 0 && (
                      <View className="mb-2 flex-row items-center gap-1 self-start rounded-full bg-gray-900 px-2 py-1">
                        <Star size={12} color="white" fill="white" />
                        <Text className="text-xs font-bold text-white">
                          {item.starsEarned} / {item.starsMax}
                        </Text>
                      </View>
                    )}
                    <Text className="text-lg font-extrabold text-ink">{item.courseTitle}</Text>
                    <Text className="mt-1 text-sm text-slate-400">{item.groupName}</Text>
                  </View>
                  <View className="h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
                    <BookOpen size={24} color="#6366f1" />
                  </View>
                </View>
                <View className="mt-6 flex-row gap-4">
                  <Text className="text-xs font-semibold text-slate-600">
                    <Star size={13} color="#f59e0b" /> {item.starsEarned}/{item.starsMax}
                  </Text>
                  <Text className="text-xs font-semibold text-slate-600">
                    <Users size={13} color="#64748b" /> {item.studentCount}
                  </Text>
                </View>
                <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <View
                    className="h-full rounded-full bg-brand"
                    style={{width: `${item.progressPercent}%`}}
                  />
                </View>
                <Text className="mt-2 text-xs text-slate-400">
                  {item.lessonsCompleted}/{item.lessonsTotal} dars · {item.progressPercent}%
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLeaderboardCourse(item)}
                className="mt-3 flex-row items-center gap-1.5 self-start rounded-lg bg-slate-50 px-2.5 py-1.5">
                <Trophy size={14} color="#f59e0b" />
                <Text className="text-xs font-semibold text-slate-700">Peshqadamlar</Text>
              </Pressable>
            </View>
          )}
        />
      )}
      {leaderboardCourse && (
        <CourseLeaderboardSheet
          course={leaderboardCourse}
          onClose={() => setLeaderboardCourse(null)}
        />
      )}
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors in `CoursesScreen.tsx` or `CourseLeaderboardSheet.tsx`.

- [ ] **Step 4: Manual verification checkpoint**

Run the app, log in as a student with at least one course, verify: course cards render with stars/students/progress, tapping "Peshqadamlar" opens the sheet with podium + ranked list, closing works.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/CoursesScreen.tsx apps/mobile/src/components/CourseLeaderboardSheet.tsx
git commit -m "feat(mobile): add course leaderboard and align courses list with web design"
```

---

### Task 6: HLS video player + lightbox + content block renderer

**Files:**
- Create: `apps/mobile/src/components/HlsVideoPlayer.tsx`
- Create: `apps/mobile/src/components/ImageLightbox.tsx`
- Create: `apps/mobile/src/components/LessonBlock.tsx`

**Interfaces:**
- Consumes: `Video` from `react-native-video` (Task 1), `enableSecureScreen`/`disableSecureScreen` from `apps/mobile/src/lib/secureScreen.ts` (Task 2), `RenderHtml` from `react-native-render-html` (Task 1), `ApiContentBlock` (Task 3), `useNetwork` (existing).
- Produces: `HlsVideoPlayer` component with props `{url: string; watermarkText?: string}`. `ImageLightbox` component with props `{uri: string; onClose: () => void}`. `LessonBlock` component with props `{block: ApiContentBlock; onOpenLiveClassReplay: (classSessionId: string) => void}` — consumed by `CourseScreen.tsx` in Task 7.

- [ ] **Step 1: Create the HLS video player**

Create `apps/mobile/src/components/HlsVideoPlayer.tsx`:

```tsx
import React, {useEffect} from 'react';
import {Text, View} from 'react-native';
import Video from 'react-native-video';
import {disableSecureScreen, enableSecureScreen} from '../lib/secureScreen';

export function HlsVideoPlayer({url, watermarkText}: {url: string; watermarkText?: string}) {
  useEffect(() => {
    enableSecureScreen();
    return () => disableSecureScreen();
  }, []);

  return (
    <View className="mt-3 aspect-video w-full overflow-hidden rounded-2xl bg-black">
      <Video
        source={{uri: url}}
        style={{flex: 1}}
        controls
        resizeMode="contain"
      />
      {watermarkText ? (
        <View pointerEvents="none" className="absolute bottom-3 right-3 rounded-md bg-black/40 px-2 py-1">
          <Text className="text-xs font-semibold text-white/80">{watermarkText}</Text>
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Create the image lightbox**

Create `apps/mobile/src/components/ImageLightbox.tsx`:

```tsx
import React from 'react';
import {Modal, Pressable, useWindowDimensions} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {X} from 'lucide-react-native';
import {View} from 'react-native';

export function ImageLightbox({uri, onClose}: {uri: string; onClose: () => void}) {
  const {width, height} = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 4));
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

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withSpring(scale.value > 1 ? 1 : 2);
      savedScale.value = scale.value > 1 ? 1 : 2;
      if (scale.value === 1) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const style = useAnimatedStyle(() => ({
    transform: [
      {translateX: translateX.value},
      {translateY: translateY.value},
      {scale: scale.value},
    ],
  }));

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black">
        <Pressable
          onPress={onClose}
          className="absolute right-5 top-12 z-10 h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <X size={22} color="white" />
        </Pressable>
        <GestureDetector gesture={composed}>
          <Animated.Image
            source={{uri}}
            style={[{width, height: height * 0.8}, style]}
            resizeMode="contain"
          />
        </GestureDetector>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 3: Create the content block renderer**

Create `apps/mobile/src/components/LessonBlock.tsx`:

```tsx
import React, {useState} from 'react';
import {Linking, Pressable, Text, useWindowDimensions, View} from 'react-native';
import RenderHtml from 'react-native-render-html';
import {WebView} from 'react-native-webview';
import {ChevronRight, Download, FileText, Image as ImageIcon, Radio} from 'lucide-react-native';
import type {ApiContentBlock} from '../types/api';
import {HlsVideoPlayer} from './HlsVideoPlayer';
import {ImageLightbox} from './ImageLightbox';

export function LessonBlock({
  block,
  onOpenLiveClassReplay,
}: {
  block: ApiContentBlock;
  onOpenLiveClassReplay: (classSessionId: string) => void;
}) {
  const {width} = useWindowDimensions();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  if (block.type === 'editor' && block.html) {
    return (
      <>
        <RenderHtml
          contentWidth={width - 32}
          source={{html: block.html}}
          renderersProps={{
            img: {
              enableExperimentalPercentWidth: true,
            },
          }}
        />
        {lightboxUri && <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />}
      </>
    );
  }

  if (block.type === 'video') {
    if (block.embedUrl) {
      return (
        <View className="mt-3 aspect-video w-full overflow-hidden rounded-2xl bg-black">
          <WebView source={{uri: block.embedUrl}} allowsInlineMediaPlayback />
        </View>
      );
    }
    if (block.previewUrl) {
      return <HlsVideoPlayer url={block.previewUrl} watermarkText={block.label ?? undefined} />;
    }
    return null;
  }

  if (block.type === 'image' && block.previewUrl) {
    return (
      <>
        <Pressable onPress={() => setLightboxUri(block.previewUrl!)} className="mt-3">
          <Animated_Image_Fallback uri={block.previewUrl} />
          {block.label ? (
            <Text className="mt-2 text-xs font-semibold text-slate-400">{block.label}</Text>
          ) : null}
        </Pressable>
        {lightboxUri && <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />}
      </>
    );
  }

  if (block.type === 'file' && block.previewUrl) {
    const ext = (block.fileName ?? block.label ?? 'FILE').split('.').pop()?.toUpperCase() ?? 'FILE';
    return (
      <Pressable
        onPress={() => void Linking.openURL(block.previewUrl!)}
        className="mt-3 flex-row items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-slate-900">
          <Text className="text-[11px] font-black text-white">{ext.slice(0, 4)}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-bold text-ink">
            {block.label || block.fileName || 'Fayl'}
          </Text>
          <Text className="text-xs font-semibold text-slate-400">Yuklab olish</Text>
        </View>
        <Download size={18} color="#94a3b8" />
      </Pressable>
    );
  }

  if (block.type === 'live_class' && block.classSessionId) {
    return (
      <Pressable
        onPress={() => onOpenLiveClassReplay(block.classSessionId!)}
        className="mt-3 flex-row items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
          <Radio size={18} color="white" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-ink">Jonli dars</Text>
          <Text className="text-xs font-semibold text-slate-400">Yozuvni ko'rish</Text>
        </View>
        <ChevronRight size={18} color="#94a3b8" />
      </Pressable>
    );
  }

  return (
    <View className="mt-3 flex-row items-center gap-2 rounded-xl bg-slate-50 px-4 py-4">
      {block.type === 'image' ? (
        <ImageIcon size={18} color="#94a3b8" />
      ) : (
        <FileText size={18} color="#94a3b8" />
      )}
      <Text className="text-sm font-semibold text-slate-400">Kontent ochilmadi</Text>
    </View>
  );
}

function Animated_Image_Fallback({uri}: {uri: string}) {
  const {Image} = require('react-native');
  return <Image source={{uri}} className="h-52 w-full rounded-2xl bg-slate-100" resizeMode="contain" />;
}
```

Note: the `Animated_Image_Fallback` inline `require` is a deliberate minimal workaround to avoid a top-level unused-import lint warning on plain `Image` when most of the file uses `RenderHtml`/`WebView`. Replace it with a normal top-level `import {Image} from 'react-native';` and use `<Image>` directly if the project's ESLint config doesn't flag it — check by running lint in Step 5 and simplify if there's no warning.

- [ ] **Step 4: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors in the three new files. Fix any type mismatches from `react-native-video`/`react-native-render-html`'s actual exported types if they differ from what's assumed here (check `node_modules/react-native-video/types` and `node_modules/react-native-render-html/dist/index.d.ts` if errors appear).

- [ ] **Step 5: Lint and simplify the image fallback**

Run:
```bash
cd apps/mobile && npx eslint src/components/LessonBlock.tsx
```
Expected: if no unused-import warning appears for a top-level `Image` import, replace `Animated_Image_Fallback` with a direct top-level `import {Image} from 'react-native';` and inline `<Image source={{uri: block.previewUrl}} className="h-52 w-full rounded-2xl bg-slate-100" resizeMode="contain" />` in the `image` branch, deleting the helper function.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/HlsVideoPlayer.tsx apps/mobile/src/components/ImageLightbox.tsx apps/mobile/src/components/LessonBlock.tsx
git commit -m "feat(mobile): add HLS video player, image lightbox, and lesson content block renderer"
```

---

### Task 7: Practice screen (test/image/oral submission types)

**Files:**
- Create: `apps/mobile/src/components/PracticeScreen.tsx`

**Interfaces:**
- Consumes: `ApiMyLesson`, `ApiMyPracticeBlock` (Task 3), `apiSubmitPracticeImage`/`apiDeletePracticeImageSubmission` (Task 3), `apiUploadMedia` (Task 3), `launchImageLibrary` from `react-native-image-picker` (Task 1), `useNetwork` (existing).
- Produces: `PracticeScreen` component with props `{lesson: ApiMyLesson; onBack: () => void; onStartPractice: (block: ApiMyPracticeBlock) => void; onViewSubmission: (block: ApiMyPracticeBlock, submissionId: string) => void; onImageSubmitted: () => void; hasNext: boolean; canComplete: boolean; onNext: () => void}` — consumed by `CourseScreen.tsx` in Task 8.

- [ ] **Step 1: Create the practice screen**

Create `apps/mobile/src/components/PracticeScreen.tsx`:

```tsx
import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {CheckCircle2, ChevronLeft, ImagePlus, Star, Trash2} from 'lucide-react-native';
import type {ApiMyLesson, ApiMyPracticeBlock} from '../types/api';
import {apiUploadMedia} from '../api/auth';
import {apiDeletePracticeImageSubmission, apiSubmitPracticeImage} from '../api/practiceBlocks';
import {getApiErrorMessage} from '../lib/errors';
import {useNetwork} from '../providers/NetworkProvider';

function practiceMaxScore(lesson: ApiMyLesson): number {
  return lesson.practiceBlocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0);
}

function practiceEarnedScore(lesson: ApiMyLesson): number {
  return lesson.practiceBlocks.reduce((sum, b) => sum + (b.earnedScore ?? 0), 0);
}

function ImagePracticeBlockCard({
  block,
  onImageSubmitted,
}: {
  block: ApiMyPracticeBlock;
  onImageSubmitted: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {online} = useNetwork();
  const maximumReached = block.imageSubmissions.length >= 5;
  const hasGradedSubmission = block.imageSubmissions.some(s => s.graded);

  async function pickAndUpload() {
    if (!online) {
      Alert.alert('Internet kerak', 'Rasm yuklash faqat online ishlaydi.');
      return;
    }
    if (maximumReached) {
      Alert.alert('Limit', 'Bitta topshiriqqa maksimal 5 ta rasm yuklash mumkin.');
      return;
    }
    if (hasGradedSubmission) {
      Alert.alert('Baholangan', 'Baholangan topshiriqqa yangi rasm yuklab bo‘lmaydi.');
      return;
    }
    const result = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setUploading(true);
    try {
      const uploaded = await apiUploadMedia(
        {uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? 'photo.jpg'},
        'practice-submissions',
      );
      await apiSubmitPracticeImage(block.id, uploaded.url);
      onImageSubmitted();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Rasm yuklashda xatolik yuz berdi."));
    } finally {
      setUploading(false);
    }
  }

  async function deleteImage(submissionId: string) {
    setDeletingId(submissionId);
    try {
      await apiDeletePracticeImageSubmission(submissionId);
      onImageSubmitted();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Rasmni o'chirib bo'lmadi."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {block.description ? <Text className="mb-3 text-sm text-slate-600">{block.description}</Text> : null}
      {block.imageSubmissions.map(s => (
        <View
          key={s.id}
          className="mb-2 flex-row items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-bold text-ink">
              {new Date(s.submittedAt).toLocaleDateString('uz-UZ')}
            </Text>
            <Text className="text-[11px] text-slate-400">
              {s.graded
                ? `Baholandi: ${s.score}${block.maxScore !== null ? ` / ${block.maxScore}` : ''}`
                : 'Ustoz tekshiruvini kutmoqda'}
            </Text>
          </View>
          {!s.graded && (
            <Pressable
              onPress={() => void deleteImage(s.id)}
              disabled={deletingId === s.id}
              className="h-8 w-8 items-center justify-center rounded-lg">
              <Trash2 size={15} color="#94a3b8" />
            </Pressable>
          )}
        </View>
      ))}
      <Text className="mb-2 text-right text-[11px] font-semibold text-slate-400">
        {block.imageSubmissions.length}/5 rasm
      </Text>
      <Pressable
        onPress={() => void pickAndUpload()}
        disabled={uploading || maximumReached || hasGradedSubmission}
        className={`flex-row items-center justify-center gap-2 rounded-xl py-2.5 ${
          maximumReached || hasGradedSubmission || uploading ? 'bg-slate-300' : 'bg-brand'
        }`}>
        <ImagePlus size={15} color="white" />
        <Text className="text-xs font-bold text-white">
          {uploading ? 'Yuklanmoqda...' : maximumReached ? '5 ta rasm yuklandi' : hasGradedSubmission ? 'Topshiriq baholangan' : 'Rasm yuklash'}
        </Text>
      </Pressable>
    </>
  );
}

export function PracticeScreen({
  lesson,
  onBack,
  onStartPractice,
  onViewSubmission,
  onImageSubmitted,
  hasNext,
  canComplete,
  onNext,
}: {
  lesson: ApiMyLesson;
  onBack: () => void;
  onStartPractice: (block: ApiMyPracticeBlock) => void;
  onViewSubmission: (block: ApiMyPracticeBlock, submissionId: string) => void;
  onImageSubmitted: () => void;
  hasNext: boolean;
  canComplete: boolean;
  onNext: () => void;
}) {
  const hasCompletionScore = lesson.completionScore !== null;
  const hasPracticeScore = lesson.practiceBlocks.some(b => b.maxScore !== null);
  const totalMax = practiceMaxScore(lesson) + (lesson.completionScore ?? 0);
  const effectivelyCompleted = lesson.completed && canComplete;
  const totalEarned =
    practiceEarnedScore(lesson) + (effectivelyCompleted ? lesson.completionScore ?? 0 : 0);

  return (
    <ScrollView contentContainerClassName="p-5 pb-12">
      <Text className="mb-4 text-2xl font-black text-ink">Amaliy qism</Text>

      {totalMax > 0 && (
        <View className="mb-5 rounded-2xl bg-slate-50 p-4">
          <View className="mb-3 flex-row items-center gap-2">
            <View className="flex-row items-center gap-1 rounded-full bg-white px-3 py-1">
              <Star size={13} color="#f59e0b" fill="#f59e0b" />
              <Text className="text-xs font-bold text-amber-500">
                {totalEarned} / {totalMax}
              </Text>
            </View>
            <Text className="text-xs font-semibold text-slate-500">Dars uchun yulduzlar</Text>
          </View>
          {hasPracticeScore && (
            <View className="mb-2 flex-row items-center justify-between rounded-xl bg-white px-3 py-2">
              <Text className="text-xs font-semibold text-slate-600">Amaliyot</Text>
              <Text className="text-xs font-semibold text-amber-500">
                {practiceEarnedScore(lesson)} / {practiceMaxScore(lesson)}
              </Text>
            </View>
          )}
          {hasCompletionScore && (
            <View className="flex-row items-center justify-between rounded-xl bg-white px-3 py-2">
              <Text className="text-xs font-semibold text-slate-600">Darsni tamomlash</Text>
              <Text className="text-xs font-semibold text-amber-500">
                {lesson.completed ? lesson.completionScore : 0} / {lesson.completionScore}
              </Text>
            </View>
          )}
        </View>
      )}

      {lesson.passThresholdEnabled && lesson.passThresholdPercent !== null && (
        <View className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-sm font-bold text-ink">Minimal o'tish natijasi</Text>
            <Text className="rounded-full bg-white px-3 py-1 text-sm font-black text-indigo-600">
              {lesson.passThresholdPercent}%
            </Text>
          </View>
          <Text className="mt-1.5 text-xs font-medium text-slate-500">
            Hozirgi natijangiz:{' '}
            {lesson.combinedPracticePercent === null
              ? 'hali hisoblanmagan'
              : `${Math.round(lesson.combinedPracticePercent)}%`}
          </Text>
        </View>
      )}

      {lesson.practiceBlocks.length === 0 ? (
        <View className="rounded-2xl bg-slate-50 py-16">
          <Text className="text-center text-sm font-semibold text-slate-400">
            Bu darsda amaliyot topshiriqlari yo'q
          </Text>
        </View>
      ) : (
        lesson.practiceBlocks.map(block => (
          <View key={block.id} className="mb-4 rounded-2xl bg-slate-50 p-4">
            <View className="mb-3 flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-sm font-bold text-ink">
                {block.type === 'image'
                  ? "Amaliyot topshirig'i"
                  : block.type === 'oral'
                    ? 'Jonli savol-javob'
                    : (block.testName ?? 'Test tanlanmagan')}
              </Text>
              {block.maxScore !== null && (
                <Text className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-500">
                  {block.earnedScore ?? 0} / {block.maxScore}
                </Text>
              )}
            </View>

            {block.type === 'image' ? (
              <ImagePracticeBlockCard block={block} onImageSubmitted={onImageSubmitted} />
            ) : block.type === 'oral' ? (
              <View className="rounded-xl bg-white px-3 py-3">
                <Text className="text-sm font-semibold text-slate-700">
                  Ustoz bilan jonli savol-javob
                </Text>
                <Text className="mt-1 text-xs text-slate-500">
                  Bu topshiriqda fayl yuklanmaydi. Ustoz suhbatdan so'ng yulduzingizni qo'lda
                  belgilaydi.
                </Text>
                {block.oralGrade && (
                  <Text className="mt-2 text-xs font-bold text-emerald-600">
                    Baholandi: {block.oralGrade.score}/{block.maxScore ?? '—'}
                  </Text>
                )}
              </View>
            ) : (
              <>
                {block.submissions.map((s, i) => (
                  <View
                    key={s.id}
                    className="mb-2 flex-row items-center justify-between rounded-xl bg-white px-3 py-2.5">
                    <View>
                      <Text className="text-xs font-bold text-ink">
                        Urinish {block.submissions.length - i}{' '}
                        <Text className="font-normal text-slate-400">
                          • {s.score}/{s.total}
                        </Text>
                      </Text>
                      <Text className="text-[11px] text-slate-400">
                        {new Date(s.submittedAt).toLocaleDateString('uz-UZ')}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => onViewSubmission(block, s.id)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5">
                      <Text className="text-xs font-bold text-slate-600">Ochish</Text>
                    </Pressable>
                  </View>
                ))}
                {block.testSlug ? (
                  block.attemptsRemaining === 0 ? (
                    <Text className="text-center text-xs font-semibold text-slate-400">
                      Urinishlar soni tugadi
                    </Text>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => onStartPractice(block)}
                        className="w-full items-center rounded-xl bg-brand py-2.5">
                        <Text className="text-xs font-bold text-white">Qayta o'tish</Text>
                      </Pressable>
                      {block.attemptsRemaining !== null && (
                        <Text className="mt-1.5 text-center text-[11px] text-slate-400">
                          {block.attemptsRemaining} ta urinish imkoniyati qoldi
                        </Text>
                      )}
                    </>
                  )
                ) : (
                  <Text className="text-xs font-semibold text-slate-400">
                    Bu topshiriq hali tayyor emas
                  </Text>
                )}
              </>
            )}
          </View>
        ))
      )}

      {effectivelyCompleted && (
        <View className="mt-2 flex-row items-center justify-center gap-2 rounded-2xl bg-emerald-50 p-4">
          <CheckCircle2 size={18} color="#10b981" />
          <Text className="text-sm font-bold text-emerald-700">Dars tamomlangan</Text>
        </View>
      )}

      {!lesson.completed && !canComplete && (
        <Text className="mt-4 text-center text-xs font-semibold text-red-500">
          Darsni tamomlash uchun o'tish balidan yetarlicha ball to'plang
        </Text>
      )}

      <View className="mt-5 flex-row items-center justify-between gap-2">
        <Pressable onPress={onBack} className="flex-row items-center gap-1.5 px-2 py-1.5">
          <ChevronLeft size={15} color="#64748b" />
          <Text className="text-xs font-bold text-slate-500">Darsga qaytish</Text>
        </Pressable>
        {hasNext && (
          <Pressable
            onPress={onNext}
            disabled={!canComplete}
            className={`rounded-lg px-3 py-2 ${canComplete ? 'bg-brand' : 'bg-slate-200'}`}>
            <Text className="text-xs font-bold text-white">Keyingi darsga o'tish</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors in `PracticeScreen.tsx`. If `react-native-image-picker`'s `launchImageLibrary` return type differs from the assumed `{assets?: [{uri, type, fileName}]}` shape, adjust the destructure to match the actual installed version's types (check `node_modules/react-native-image-picker/lib/typescript/index.d.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/PracticeScreen.tsx
git commit -m "feat(mobile): add practice screen with test/image/oral submission types"
```

---

### Task 8: Course/Lesson screen — locking, TOC, reader, practice wiring

**Files:**
- Modify: `apps/mobile/src/screens/CourseScreen.tsx`
- Modify: `apps/mobile/src/navigation/types.ts`

**Interfaces:**
- Consumes: `computeMaxUnlockedIndex`, `isLessonPassing`, `computeCourseStars` (Task 3), `LessonBlock` (Task 6), `PracticeScreen` (Task 7), `apiGetMyCourseDetail`/`apiMarkLessonComplete` (Task 3), `apiGetOrCreatePracticeChatForCourse` (Task 3).
- Produces: `RootStackParamList` gains `TestPractice: {slug: string; submissionId?: string}` and `ClassroomReplay: {sessionId: string}` route params (navigation targets stubbed to existing screens per the design doc's "Resolved Decisions" — see Step 4 note).

- [ ] **Step 1: Update navigation param types**

Open `apps/mobile/src/navigation/types.ts` and replace its contents:

```typescript
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Course: {courseId: string; title: string};
  Web: {path: string; title: string; onlineRequired?: boolean};
  Chat: {chatId: string; title: string};
};
export type TabParamList = {
  Courses: undefined;
  History: undefined;
  Messenger: undefined;
  Live: undefined;
};
```

(`Profile` is removed from `TabParamList` here; the `Web` route stays for now since other not-yet-converted screens in this phase — test-taking, classroom replay — still target it until their own phases land, per the design doc's resolved decision #2/#3. It will be deleted once no Phase-1-or-later screen references it.)

- [ ] **Step 2: Rewrite `CourseScreen.tsx`**

Replace the full contents of `apps/mobile/src/screens/CourseScreen.tsx`:

```tsx
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Film,
  Layers3,
  Lock,
  MessageCircle,
  Play,
  Star,
} from 'lucide-react-native';
import type {RootStackParamList} from '../navigation/types';
import type {ApiMyCourseDetail, ApiMyLesson, ApiMyPracticeBlock} from '../types/api';
import {apiGetMyCourseDetail, apiMarkLessonComplete} from '../api/groups';
import {apiGetOrCreatePracticeChatForCourse} from '../api/practiceMessenger';
import {cached} from '../lib/storage';
import {computeCourseStars, computeMaxUnlockedIndex, isLessonPassing} from '../lib/lessons';
import {getApiErrorMessage} from '../lib/errors';
import {Loading, OfflineBanner, Screen, StaleNote} from '../components/Ui';
import {LessonBlock} from '../components/LessonBlock';
import {PracticeScreen} from '../components/PracticeScreen';
import {useNetwork} from '../providers/NetworkProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Course'>;

function videoDurationLabel(lesson: ApiMyLesson): string | null {
  const videoBlock = lesson.blocks.find(b => b.type === 'video');
  if (!videoBlock?.durationSec) return null;
  const total = videoBlock.durationSec;
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export function CourseScreen({route, navigation}: Props) {
  const {courseId} = route.params;
  const [course, setCourse] = useState<ApiMyCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [showPractice, setShowPractice] = useState(false);
  const {online} = useNetwork();

  const load = useCallback(async () => {
    try {
      const r = await cached(`course:${courseId}`, () => apiGetMyCourseDetail(courseId));
      setCourse(r.data);
      setStale(r.stale);
      if (!r.stale && !selectedLessonId) {
        const first = r.data.modules.flatMap(m => m.lessons)[0];
        if (first) setSelectedLessonId(first.id);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lessons = useMemo(
    () =>
      course?.modules.flatMap(module => module.lessons.map(lesson => ({module, lesson}))) ?? [],
    [course],
  );
  const selected = lessons.find(item => item.lesson.id === selectedLessonId) ?? lessons[0];
  const selectedIndex = selected
    ? lessons.findIndex(item => item.lesson.id === selected.lesson.id)
    : -1;
  const maxUnlockedIndex = useMemo(
    () => computeMaxUnlockedIndex(lessons.map(l => ({completed: l.lesson.completed}))),
    [lessons],
  );
  const progressCount = lessons.filter(item => item.lesson.completed).length;
  const courseStars = useMemo(() => computeCourseStars(lessons), [lessons]);

  useEffect(() => {
    setShowPractice(false);
  }, [selectedLessonId]);

  async function markComplete() {
    if (!selected) return;
    await apiMarkLessonComplete(selected.lesson.id);
    setCourse(current => {
      if (!current) return current;
      return {
        ...current,
        modules: current.modules.map(module => ({
          ...module,
          lessons: module.lessons.map(lesson =>
            lesson.id === selected.lesson.id ? {...lesson, completed: true} : lesson,
          ),
        })),
      };
    });
  }

  async function openMessenger() {
    try {
      await apiGetOrCreatePracticeChatForCourse(courseId);
      navigation.getParent()?.navigate('Main', {screen: 'Messenger'} as never);
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Suhbatni ochib bo'lmadi"));
    }
  }

  function openLiveClassReplay(classSessionId: string) {
    navigation.navigate('Web', {
      path: `/classroom-history/${classSessionId}/replay`,
      title: 'Jonli dars yozuvi',
      onlineRequired: true,
    });
  }

  function startPractice(block: ApiMyPracticeBlock) {
    if (!online) {
      Alert.alert('Internet kerak', 'Test va topshiriq yuborish online ishlaydi.');
      return;
    }
    if (!block.testSlug) return;
    navigation.navigate('Web', {
      path: `/t/${block.testSlug}?practice=1`,
      title: block.testName ?? 'Amaliyot',
      onlineRequired: true,
    });
  }

  function viewSubmission(block: ApiMyPracticeBlock, submissionId: string) {
    if (!block.testSlug) return;
    navigation.navigate('Web', {
      path: `/t/${block.testSlug}/result?sid=${submissionId}&practice=1`,
      title: block.testName ?? 'Natija',
      onlineRequired: true,
    });
  }

  if (loading) return <Loading />;

  if (!course || lessons.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-8">
          <BookOpen size={32} color="#cbd5e1" />
          <Text className="mt-3 text-center text-sm font-semibold text-slate-400">
            Bu kursda hozircha ochiq dars yo'q
          </Text>
        </View>
      </Screen>
    );
  }

  if (selected && showPractice) {
    return (
      <Screen>
        <OfflineBanner />
        <PracticeScreen
          lesson={selected.lesson}
          onBack={() => setShowPractice(false)}
          onStartPractice={startPractice}
          onViewSubmission={viewSubmission}
          onImageSubmitted={() => void load()}
          hasNext={selectedIndex + 1 < lessons.length}
          canComplete={isLessonPassing(selected.lesson)}
          onNext={async () => {
            await markComplete();
            const next = lessons[selectedIndex + 1];
            if (next) setSelectedLessonId(next.lesson.id);
          }}
        />
      </Screen>
    );
  }

  if (selected) {
    const lesson = selected.lesson;
    const hasPractice = lesson.practiceBlocks.length > 0;
    const blockedByThreshold = lesson.passThresholdEnabled && !isLessonPassing(lesson);
    return (
      <Screen>
        <OfflineBanner />
        <StaleNote stale={stale} />
        <ScrollView contentContainerClassName="p-5 pb-12">
          <Pressable onPress={() => setSelectedLessonId(null)}>
            <Text className="mb-2 text-xs font-semibold text-slate-400">
              {selected.module.title}
            </Text>
          </Pressable>
          <Text className="text-2xl font-black text-ink">{lesson.title}</Text>

          <Pressable
            onPress={() => void openMessenger()}
            className="mb-5 mt-5 flex-row items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
            <View className="flex-row items-center gap-2">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-900">
                <MessageCircle size={16} color="white" />
              </View>
              <View>
                <Text className="text-xs font-bold text-ink">
                  {course.curatorName
                    ? `${course.curatorName} bilan suhbatlashish`
                    : 'Ustozga murojaat'}
                </Text>
                <Text className="text-[11px] font-semibold text-slate-500">
                  {course.curatorName
                    ? 'Kuratorga savolingizni berishingiz mumkin'
                    : "Kurator biriktirilmaguncha ustozingizga yozishingiz mumkin"}
                </Text>
              </View>
            </View>
            <MessageCircle size={18} color="#334155" />
          </Pressable>

          {lesson.blocks.length === 0 ? (
            <View className="rounded-2xl bg-slate-50 py-16">
              <Text className="text-center text-sm font-semibold text-slate-400">
                Dars kontenti hozircha tayyor emas
              </Text>
            </View>
          ) : (
            lesson.blocks.map(block => (
              <LessonBlock key={block.id} block={block} onOpenLiveClassReplay={openLiveClassReplay} />
            ))
          )}

          {!hasPractice ? (
            lesson.completed ? (
              <View className="mt-7 flex-row items-center justify-center gap-2 rounded-2xl bg-emerald-50 p-4">
                <CheckCircle2 size={20} color="#10b981" />
                <Text className="font-bold text-emerald-700">Dars tugatilgan</Text>
              </View>
            ) : (
              <Pressable
                onPress={async () => {
                  if (!online) {
                    Alert.alert('Internet kerak', "Darsni tugatish uchun internet kerak.");
                    return;
                  }
                  try {
                    await markComplete();
                  } catch (error) {
                    Alert.alert('Xatolik', getApiErrorMessage(error, "Darsni tugatib bo'lmadi."));
                  }
                }}
                className="mt-7 items-center rounded-2xl bg-brand py-3.5">
                <Text className="font-bold text-white">
                  {selectedIndex + 1 >= lessons.length ? 'Yakunlash' : 'Keyingi dars'}
                </Text>
              </Pressable>
            )
          ) : (
            <Pressable
              onPress={() => setShowPractice(true)}
              disabled={blockedByThreshold}
              className={`mt-7 items-center rounded-2xl py-3.5 ${blockedByThreshold ? 'bg-slate-200' : 'bg-brand'}`}>
              <Text className="font-bold text-white">Amaliyot</Text>
            </Pressable>
          )}
          {hasPractice && blockedByThreshold && (
            <Text className="mt-2 text-right text-xs font-semibold text-red-500">
              Keyingi darsni ochish uchun o'tish balidan yetarlicha ball to'plang
            </Text>
          )}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <OfflineBanner />
      <StaleNote stale={stale} />
      <ScrollView contentContainerClassName="p-4 pb-10">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="rounded-full bg-slate-900 px-2.5 py-1">
            <Text className="text-[11px] font-bold text-white">
              {progressCount} / {lessons.length}
            </Text>
          </View>
          {courseStars.max > 0 && (
            <View className="flex-row items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5">
              <Star size={13} color="#f59e0b" fill="#f59e0b" />
              <Text className="text-xs font-bold text-amber-500">
                {courseStars.earned} / {courseStars.max}
              </Text>
            </View>
          )}
        </View>
        {course.modules.map((module, moduleIndex) => (
          <View key={module.id} className="mb-5">
            <View className="mb-2 flex-row items-center gap-1.5 px-1">
              <Layers3 size={13} color="#94a3b8" />
              <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {module.title || `Modul ${moduleIndex + 1}`}
              </Text>
            </View>
            {module.lessons.map(lesson => {
              const globalIndex = lessons.findIndex(item => item.lesson.id === lesson.id);
              const locked = globalIndex > maxUnlockedIndex;
              const hasVideo = lesson.blocks.some(b => b.type === 'video');
              const totalStars =
                lesson.practiceBlocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0) +
                (lesson.completionScore ?? 0);
              const duration = videoDurationLabel(lesson);
              return (
                <Pressable
                  key={lesson.id}
                  disabled={locked}
                  onPress={() => setSelectedLessonId(lesson.id)}
                  className="mb-2 flex-row items-center rounded-2xl bg-white p-4">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                    {locked ? (
                      <Lock size={18} color="#94a3b8" />
                    ) : hasVideo ? (
                      <Film size={19} color="#94a3b8" />
                    ) : (
                      <BookOpen size={19} color="#94a3b8" />
                    )}
                  </View>
                  <View className="ml-3 flex-1">
                    <Text
                      numberOfLines={2}
                      className={`font-bold ${locked ? 'text-slate-400' : 'text-slate-800'}`}>
                      {lesson.title}
                    </Text>
                    <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
                      <Text className="text-[11px] font-semibold text-slate-400">
                        Modul {moduleIndex + 1}
                      </Text>
                      {duration && (
                        <View className="rounded-full bg-slate-100 px-1.5 py-0.5">
                          <Text className="text-[11px] font-semibold text-slate-500">
                            {duration}
                          </Text>
                        </View>
                      )}
                      {lesson.practiceBlocks.length > 0 && (
                        <View className="rounded-full bg-orange-100 px-1.5 py-0.5">
                          <Text className="text-[11px] font-semibold text-orange-600">
                            Amaliyot
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {totalStars > 0 && (
                      <View className="flex-row items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5">
                        <Star size={11} color="#f59e0b" fill="#f59e0b" />
                        <Text className="text-[11px] font-bold text-amber-500">{totalStars}</Text>
                      </View>
                    )}
                    {locked ? (
                      <Lock size={16} color="#cbd5e1" />
                    ) : lesson.completed ? (
                      <CheckCircle2 size={18} color="#10b981" />
                    ) : (
                      <ChevronRight size={18} color="#cbd5e1" />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors in `CourseScreen.tsx`. If `navigation.getParent()?.navigate('Main', {screen: 'Messenger'})` produces a type error against the actual `@react-navigation` typed API for this project's nested-navigator setup, replace it with the pattern already used elsewhere in the codebase for cross-tab navigation (check how `RootNavigator.tsx` types the `Main` screen's nested `TabParamList` and adjust the call to match, e.g. `navigation.navigate('Main', {screen: 'Messenger'})` directly without `getParent()` if `Course` and `Main` share the same stack navigator's typed prop).

- [ ] **Step 4: Manual verification checkpoint**

Run the app, open a course with multiple modules/lessons: verify locked lessons are non-interactive, completing a lesson unlocks the next, video/image/file blocks render, "Amaliyot" navigates into practice, pass-threshold gating blocks advancing when unmet, messenger banner navigates to the Messenger tab.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/CourseScreen.tsx apps/mobile/src/navigation/types.ts
git commit -m "feat(mobile): rebuild course/lesson screen with locking, rich content blocks, and practice flow"
```

---

### Task 9: Profile sheet + navigation shell (4 tabs + Profile trigger, live-class banner, delete WebScreen/ProfileScreen)

**Files:**
- Create: `apps/mobile/src/components/ProfileSheet.tsx`
- Create: `apps/mobile/src/components/LiveClassBanner.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`
- Delete: `apps/mobile/src/screens/ProfileScreen.tsx`

**Interfaces:**
- Consumes: `apiUpdateProfile`, `apiChangePassword`, `apiUploadMedia` (Task 3), `useAuthStore` (existing, modified in Task 4), `launchImageLibrary` (Task 1).
- Produces: `ProfileSheet` component with props `{visible: boolean; onClose: () => void}`. `LiveClassBanner` component with no props (self-fetching), navigates via `useNavigation()`.

- [ ] **Step 1: Create the live-class banner**

Create `apps/mobile/src/components/LiveClassBanner.tsx`:

```tsx
import React, {useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Radio} from 'lucide-react-native';
import {api} from '../lib/api';
import type {RootStackParamList} from '../navigation/types';
import type {ActiveClass} from '../types/api';
import {useNetwork} from '../providers/NetworkProvider';

export function LiveClassBanner() {
  const [sessions, setSessions] = useState<ActiveClass[]>([]);
  const {online} = useNetwork();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    if (!online) {
      setSessions([]);
      return;
    }
    let active = true;
    const load = () => {
      api
        .get('/classroom/sessions/active')
        .then(res => {
          if (active) setSessions(res.data);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [online]);

  if (sessions.length === 0) return null;

  return (
    <>
      {sessions.map(session => (
        <Pressable
          key={session.id}
          onPress={() =>
            navigation.navigate('Web', {
              path: `/classroom/${session.id}`,
              title: session.courseName,
              onlineRequired: true,
            })
          }
          className="mx-4 mt-3 flex-row items-center gap-2 rounded-2xl bg-red-50 px-4 py-3">
          <Radio size={20} color="#ef4444" />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-ink">
              Jonli dars ketmoqda — {session.courseName}
            </Text>
            <Text className="text-xs text-slate-500">Darsga kirish uchun bosing</Text>
          </View>
          <View className="rounded-xl bg-red-500 px-3 py-1.5">
            <Text className="text-xs font-bold text-white">Kirish</Text>
          </View>
        </Pressable>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Create the profile sheet**

Create `apps/mobile/src/components/ProfileSheet.tsx`:

```tsx
import React, {useState} from 'react';
import {Alert, Modal, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {LogOut, Phone, UserRound, X} from 'lucide-react-native';
import {useAuthStore} from '../store/authStore';
import {apiChangePassword, apiUpdateProfile, apiUploadMedia} from '../api/auth';
import {getApiErrorMessage} from '../lib/errors';

const ROLE_LABELS: Record<string, string> = {
  student: "O'quvchi",
  teacher: "O'qituvchi",
  curator: 'Kurator',
  super: 'Super admin',
};

export function ProfileSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const nameChanged = name.trim() !== (user?.name ?? '').trim();

  async function saveName() {
    if (!nameChanged) return;
    setSavingName(true);
    try {
      await apiUpdateProfile({name: name.trim()});
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Ismni saqlab bo'lmadi."));
    } finally {
      setSavingName(false);
    }
  }

  async function changeAvatar() {
    const result = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setUploadingAvatar(true);
    try {
      const uploaded = await apiUploadMedia(
        {uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? 'avatar.jpg'},
        'avatars',
      );
      await apiUpdateProfile({avatarUrl: uploaded.url});
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Avatarni yangilab bo'lmadi."));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      Alert.alert('Parol qisqa', "Parol kamida 8 ta belgidan iborat bo'lishi kerak.");
      return;
    }
    setSavingPassword(true);
    try {
      await apiChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Saqlandi', 'Parol muvaffaqiyatli yangilandi.');
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Parolni yangilab bo'lmadi."));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[90%] rounded-t-3xl bg-white p-5">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-ink">Sozlamalar</Text>
            <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-slate-100">
              <X size={16} color="#64748b" />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="pb-8">
            <Pressable
              onPress={() => void changeAvatar()}
              className="mb-6 items-center gap-2 self-center">
              <View className="h-20 w-20 items-center justify-center rounded-full bg-indigo-100">
                <UserRound size={34} color="#6366f1" />
              </View>
              <Text className="text-xs font-semibold text-brand">
                {uploadingAvatar ? 'Yuklanmoqda...' : 'Rasmni almashtirish'}
              </Text>
            </Pressable>

            <View className="mb-2 flex-row items-center gap-1.5 text-xs">
              <Phone size={11} color="#94a3b8" />
              <Text className="text-xs text-slate-400">{user?.phone}</Text>
            </View>
            {user?.role && (
              <Text className="mb-4 text-xs text-slate-400">{ROLE_LABELS[user.role]}</Text>
            )}

            <Text className="mb-1.5 text-xs font-bold text-slate-500">Ism</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="mb-2 h-11 rounded-xl border border-slate-200 px-3 text-sm text-ink"
            />
            <Pressable
              onPress={() => void saveName()}
              disabled={!nameChanged || savingName}
              className={`mb-6 items-center rounded-xl py-2.5 ${nameChanged ? 'bg-brand' : 'bg-slate-100'}`}>
              <Text className={`text-xs font-bold ${nameChanged ? 'text-white' : 'text-slate-400'}`}>
                {savingName ? 'Saqlanmoqda...' : 'Ismni saqlash'}
              </Text>
            </Pressable>

            <Text className="mb-1.5 text-xs font-bold text-slate-500">Joriy parol</Text>
            <TextInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              className="mb-2 h-11 rounded-xl border border-slate-200 px-3 text-sm text-ink"
            />
            <Text className="mb-1.5 text-xs font-bold text-slate-500">Yangi parol</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              className="mb-2 h-11 rounded-xl border border-slate-200 px-3 text-sm text-ink"
            />
            <Pressable
              onPress={() => void savePassword()}
              disabled={!currentPassword || !newPassword || savingPassword}
              className="mb-8 items-center rounded-xl bg-slate-900 py-2.5">
              <Text className="text-xs font-bold text-white">
                {savingPassword ? 'Saqlanmoqda...' : 'Parolni yangilash'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                Alert.alert('Chiqish', 'Hisobdan chiqmoqchimisiz?', [
                  {text: 'Bekor qilish'},
                  {
                    text: 'Chiqish',
                    style: 'destructive',
                    onPress: () => {
                      onClose();
                      void logout();
                    },
                  },
                ])
              }
              className="flex-row items-center justify-center gap-2 rounded-xl bg-red-50 py-3">
              <LogOut size={16} color="#ef4444" />
              <Text className="text-sm font-bold text-red-500">Chiqish</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 3: Delete the old `ProfileScreen.tsx`**

Run:
```bash
git rm apps/mobile/src/screens/ProfileScreen.tsx
```

- [ ] **Step 4: Rewrite `RootNavigator.tsx`**

Replace the full contents of `apps/mobile/src/navigation/RootNavigator.tsx`:

```tsx
import React, {useState} from 'react';
import {View} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {BookOpen, ClipboardList, MessageCircle, Radio, UserRound} from 'lucide-react-native';
import {useAuthStore} from '../store/authStore';
import type {RootStackParamList, TabParamList} from './types';
import {LoginScreen} from '../screens/LoginScreen';
import {CoursesScreen} from '../screens/CoursesScreen';
import {HistoryScreen} from '../screens/HistoryScreen';
import {MessengerScreen, ChatScreen} from '../screens/MessengerScreen';
import {LiveScreen} from '../screens/LiveScreen';
import {CourseScreen} from '../screens/CourseScreen';
import {WebScreen} from '../screens/WebScreen';
import {LiveClassBanner} from '../components/LiveClassBanner';
import {ProfileSheet} from '../components/ProfileSheet';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const icons = {Courses: BookOpen, History: ClipboardList, Messenger: MessageCircle, Live: Radio};

function TabsWithProfile() {
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <View className="flex-1">
      <LiveClassBanner />
      <Tab.Navigator
        screenOptions={({route}) => ({
          headerShown: false,
          tabBarActiveTintColor: '#6366f1',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarStyle: {height: 64, paddingTop: 6, paddingBottom: 7, borderTopColor: '#eef2f7'},
          tabBarLabelStyle: {fontSize: 10, fontWeight: '600'},
          tabBarIcon: ({color, size}) => {
            const Icon = icons[route.name as keyof typeof icons];
            return <Icon color={color} size={size} />;
          },
        })}>
        <Tab.Screen name="Courses" component={CoursesScreen} options={{title: 'Kurslar'}} />
        <Tab.Screen name="History" component={HistoryScreen} options={{title: 'Tarix'}} />
        <Tab.Screen name="Messenger" component={MessengerScreen} options={{title: 'Xabarlar'}} />
        <Tab.Screen name="Live" component={LiveScreen} options={{title: 'Jonli'}} />
      </Tab.Navigator>
      <ProfileTrigger onOpen={() => setProfileOpen(true)} />
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

function ProfileTrigger({onOpen}: {onOpen: () => void}) {
  const {Pressable, Text} = require('react-native');
  return (
    <Pressable
      onPress={onOpen}
      className="absolute bottom-0 right-0 h-16 w-16 items-center justify-center">
      <UserRound color="#94a3b8" size={20} />
      <Text className="mt-0.5 text-[10px] font-semibold text-slate-500">Profil</Text>
    </Pressable>
  );
}

export function RootNavigator() {
  const token = useAuthStore(s => s.token);
  return (
    <Stack.Navigator screenOptions={{headerBackTitle: 'Ortga', headerTintColor: '#111827'}}>
      {!token ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}} />
      ) : (
        <>
          <Stack.Screen name="Main" component={TabsWithProfile} options={{headerShown: false}} />
          <Stack.Screen
            name="Course"
            component={CourseScreen}
            options={({route}) => ({title: route.params.title})}
          />
          <Stack.Screen
            name="Web"
            component={WebScreen}
            options={({route}) => ({title: route.params.title})}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={({route}) => ({title: route.params.title})}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
```

Note: the `ProfileTrigger` positioned as an absolutely-positioned overlay button in the bottom-right is a placeholder approach for "5th tab-bar button that opens a modal instead of navigating." If this doesn't visually align well as a real 5th tab-bar slot during Step 6's manual check, replace it with a proper custom `tabBar` render prop on `Tab.Navigator` that renders the default tab buttons plus a 5th non-navigating button in the same row — check `@react-navigation/bottom-tabs`' `tabBar` prop docs (`node_modules/@react-navigation/bottom-tabs/src/types.tsx`) for the exact signature before implementing that alternative.

- [ ] **Step 5: Typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors in the modified navigation files or new components.

- [ ] **Step 6: Manual verification checkpoint**

Run the app: verify 4 real tabs navigate correctly, the 5th "Profil" button opens the sheet (not a route push — back button doesn't affect it), avatar upload works, name edit saves only when changed, password change works, logout works, live-class banner appears above tab content when a session is active (can be verified by triggering one via the teacher/web side, or by temporarily stubbing the API response during manual testing).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/ProfileSheet.tsx apps/mobile/src/components/LiveClassBanner.tsx apps/mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): replace Profile tab with bottom-sheet, add live-class banner"
```

---

### Task 10: Full manual regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck and test suite**

Run:
```bash
cd apps/mobile && npx tsc --noEmit && npx jest
```
Expected: zero type errors, all Jest suites pass (phone, lessons, existing App smoke test).

- [ ] **Step 2: Run lint**

Run:
```bash
cd apps/mobile && npm run lint
```
Expected: no errors (warnings acceptable if pre-existing and unrelated to this phase's files).

- [ ] **Step 3: Launch the app via the `run` skill and walk the full student flow**

Invoke the `run` skill to launch `apps/mobile` on a simulator/emulator. Walk through, end to end, as a real student account:
1. Log out if logged in; log back in with phone+password.
2. Log out; log in with Telegram code (auto-submit at 6 digits).
3. Trigger "Parolni unutdim", complete the reset flow, confirm it logs in.
4. Open Courses tab — confirm card visuals match web's design intent (stars badge, progress bar, student count).
5. Open "Peshqadamlar" on a course with other enrolled students — confirm podium + list render.
6. Open a course — confirm module grouping, lesson locking (locked lessons don't respond to taps), video/image/file/editor blocks render in a lesson with content.
7. Complete a lesson with no practice blocks — confirm it advances and unlocks the next.
8. Open a lesson with practice blocks — confirm "Amaliyot" button appears, practice screen shows correct block types, image upload works end-to-end (pick → upload → appears in list → delete).
9. Tap the messenger banner inside a lesson — confirm it navigates to the Messenger tab.
10. Open the Profile sheet from the 5th tab-bar button — confirm it's a sheet, not a full-screen navigation (back gesture/button doesn't dismiss the underlying tab). Edit name, change avatar, change password, log out.
11. On Android specifically: while a lesson video is playing, attempt a screenshot — confirm it's blocked (black/blank capture) per `FLAG_SECURE`. On iOS, confirm video plays with a watermark and no crash (screenshot blocking is expected to NOT work on iOS — that's the accepted gap, not a bug).

Expected: every step above works as described; note and fix any regression found before considering Phase 1 done.

- [ ] **Step 4: Final commit if any fixes were needed during manual pass**

If Step 3 surfaced fixes, make them, then:
```bash
git add -A
git commit -m "fix(mobile): address issues found in phase 1 manual regression pass"
```

If no fixes were needed, skip this step — Phase 1 is complete as of Task 9's commit.

---

## Self-Review Notes

- **Spec coverage:** navigation shell ✅ (Task 9), Login + forgot-password ✅ (Task 4), Courses + leaderboard ✅ (Task 5), Course detail locking/blocks/video/lightbox ✅ (Tasks 6, 8), Practice (test/image/oral) ✅ (Task 7), Profile sheet ✅ (Task 9), data layer/types ✅ (Task 3), FLAG_SECURE ✅ (Task 2), no-Expo/no-WebView-except-embed constraints ✅ (enforced throughout, called out in Global Constraints).
- **Resolved decisions applied:** embed WebView scoped to video blocks only (Task 6/`LessonBlock.tsx`); Messenger/live_class/test links point at existing screens (Task 8's `openMessenger`/`openLiveClassReplay`/`startPractice`/`viewSubmission`); dark mode omitted (Task 9's `ProfileSheet` has no theme toggle).
- **Known follow-ups intentionally deferred to later phases:** `WebScreen.tsx` itself is NOT deleted in this plan (only `ProfileScreen.tsx` is) because Task 8's practice/test navigation and Task 9's live-class banner still target it — it will be removed once the Test-taking and Classroom phases replace those specific navigation targets with native screens. This is consistent with the design doc's resolved decision #2/#3 and should be called out to the user as a known Phase-1 exit state, not an oversight.
