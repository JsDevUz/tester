# Mobile "Mening testlarim" va "Mening lug'atlarim" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port "Mening testlarim" and "Mening lug'atlarim" to the React Native mobile app (`apps/mobile`) as fully native screens — no `WebScreen`/WebView involvement anywhere in either flow, matching how "So'z yodlash" (`ChallengeWordPracticeScreen`) and test-taking (`TestTakerScreen`) are already native.

**Architecture:** Two new API client files (`student-tests.ts`, `word-decks.ts`) call the same backend endpoints the web app already uses (built in the prior web plan) — no backend changes. New native screens follow existing screen conventions exactly: `Screen`/`Header`/`Button`/`Input`/`Empty`/`Loading` from `components/Ui.tsx`, NativeWind styling, `Alert.alert`-based confirmation dialogs, the hand-rolled `Modal`+`react-native-reanimated` bottom-sheet pattern (from `PdfViewerSheet.tsx`) for create/import dialogs, and `PanResponder`+`Animated` (not reanimated) for the flashcard swipe UI, mirroring `ChallengeWordPracticeScreen.tsx` line-for-line. Test-taking reuses `TestTakerScreen`/`api/delivery.ts` unchanged. The question editor (10 types) mirrors the web's `QuestionForm.tsx` encoding but with native inputs, reusing the `ReorderQuestion.tsx`-documented "up/down buttons instead of drag" substitution for any type needing reordering.

**Tech Stack:** React Native (bare, not Expo), React Navigation (native-stack + bottom-tabs), NativeWind (Tailwind via `className`), Zustand, axios, `react-native-reanimated` + `react-native-gesture-handler` (sheets only), `react-native-image-picker` (already a dependency), Jest (`__tests__/` top-level directory, not colocated).

## Global Constraints

- No screen in either new flow may render a `WebView` or navigate to the `Web` route — every screen is a native `Stack.Screen` component.
- Every new screen requiring auth relies on the existing `api` axios instance (`apps/mobile/src/lib/api.ts`), which already injects the JWT — no new auth code needed.
- Student test creation must never expose `requireAuth`/`onceOnly`/`deadline` controls — the backend already rejects/ignores these for student-created tests (per the web plan), so the mobile create form simply never collects them, matching `apps/frontend/src/components/StudentTestSettingsModal.tsx`'s field set.
- Deck practice (`DeckPracticeScreen`) must never call any progress-persisting endpoint — `known` state is local-only (`useState`), exactly as specified in `docs/superpowers/specs/2026-08-10-mobile-my-tests-my-dictionaries-design.md` §5.4.
- All new API functions follow the one-liner-per-endpoint style already used in `apps/mobile/src/api/challenges.ts`/`challenge-words.ts`: `export async function apiXxx(...): Promise<T> { return (await api.<verb>(url, body?, {params})).data; }`.
- All new screens use NativeWind `className`, not `StyleSheet.create`, matching every existing screen.
- New tests use `jest.spyOn(api, 'get' | 'post' | 'patch' | 'delete').mockResolvedValueOnce(...)` to mock the shared `api` axios instance (the established pattern from `apps/mobile/__tests__/authStoreActions.test.ts`) — never `jest.mock('../src/lib/api')` wholesale, since no precedent for that exists and the spy pattern is simpler for one-off endpoint mocks.
- Test files live in the top-level `apps/mobile/__tests__/` directory, not colocated under `src/`.

---

## Part A: Navigation and Jamm hub

### Task 1: Add new route params and register the deck deep link

**Files:**
- Modify: `apps/mobile/src/navigation/types.ts`
- Modify: `apps/mobile/src/navigation/linking.ts`
- Test: `apps/mobile/__tests__/linking.test.ts`

**Interfaces:**
- Produces: six new entries in `RootStackParamList` — `MyTests: undefined`, `MyTestFolder: {folderId: string; folderName: string}`, `MyTestQuestionEditor: {testId: string; testName: string}`, `MyDictionaries: undefined`, `WordDeck: {deckId: string; deckName: string}`, `DeckPractice: {slug: string; deckName?: string}`.
- Produces: a `getLinking` branch that routes `/d/:slug` to `DeckPractice` and `/t/:slug` to `TestTaker` (closing the existing WebView-fallback gap noted in the design spec).

- [ ] **Step 1: Write the failing test for the new linking branches**

```ts
// apps/mobile/__tests__/linking.test.ts
import {getLinking} from '../src/navigation/linking';

describe('getLinking path routing', () => {
  const linking = getLinking(true);

  function route(path: string) {
    return linking.getStateFromPath!(path, {} as any) as any;
  }

  it('routes /d/:slug to the native DeckPractice screen', () => {
    const state = route('/d/AbCd1234');
    expect(state.routes).toEqual([
      {name: 'Main'},
      {name: 'DeckPractice', params: {slug: 'AbCd1234'}},
    ]);
  });

  it('routes /t/:slug to the native TestTaker screen', () => {
    const state = route('/t/XyZw9876');
    expect(state.routes).toEqual([
      {name: 'Main'},
      {name: 'TestTaker', params: {slug: 'XyZw9876', title: 'Test', practiceMode: false}},
    ]);
  });

  it('still falls through unrecognized paths to the Web screen', () => {
    const state = route('/classroom/some-session-id');
    expect(state.routes[1]).toEqual({
      name: 'Web',
      params: {path: '/classroom/some-session-id', title: 'Jamm'},
    });
  });

  it('returns undefined (no navigation) when not logged in', () => {
    const loggedOutLinking = getLinking(false);
    expect(loggedOutLinking.getStateFromPath!('/d/anything', {} as any)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest linking.test.ts`
Expected: FAIL — `/d/:slug` and `/t/:slug` currently fall through to `Web`, not `DeckPractice`/`TestTaker`.

- [ ] **Step 3: Add the new route param types**

In `apps/mobile/src/navigation/types.ts`, add to `RootStackParamList` (after the existing `ChallengeWordPractice` entry):

```ts
  MyTests: undefined;
  MyTestFolder: {folderId: string; folderName: string};
  MyTestQuestionEditor: {testId: string; testName: string};
  MyDictionaries: undefined;
  WordDeck: {deckId: string; deckName: string};
  DeckPractice: {slug: string; deckName?: string};
```

- [ ] **Step 4: Add the deck and test deep-link branches to `linking.ts`**

In `apps/mobile/src/navigation/linking.ts`, insert before the final `return {routes: [{name: 'Main'}, {name: 'Web', ...}]}` fallback:

```ts
      const deckMatch = normalized.match(/^\/d\/([^/?#]+)/);
      if (deckMatch) {
        return {
          routes: [{name: 'Main'}, {name: 'DeckPractice', params: {slug: deckMatch[1]}}],
        } as ReturnType<NonNullable<LinkingOptions<RootStackParamList>['getStateFromPath']>>;
      }

      const testMatch = normalized.match(/^\/t\/([^/?#]+)/);
      if (testMatch) {
        return {
          routes: [
            {name: 'Main'},
            {name: 'TestTaker', params: {slug: testMatch[1], title: 'Test', practiceMode: false}},
          ],
        } as ReturnType<NonNullable<LinkingOptions<RootStackParamList>['getStateFromPath']>>;
      }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && npx jest linking.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full mobile test suite to check for regressions**

Run: `cd apps/mobile && npx jest`
Expected: PASS (all existing suites plus the new one)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/navigation/types.ts apps/mobile/src/navigation/linking.ts apps/mobile/__tests__/linking.test.ts
git commit -m "feat(mobile): add nav routes and deep links for Mening testlarim/lug'atlarim"
```

---

### Task 2: Add Jamm hub cards and register screen placeholders in RootNavigator

**Files:**
- Modify: `apps/mobile/src/screens/ChallengesScreen.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`
- Create (temporary placeholder, replaced in later tasks): none — screens are created in their own tasks; this task only wires navigation and will fail to compile until Task 4/9 land, so **this task's screens must be stubbed inline** to keep the app buildable at every commit.

**Interfaces:**
- Consumes: `MyTests`/`MyDictionaries` route names from Task 1.
- Produces: two new `HubCard`s in `ChallengesScreen`; two new `Stack.Screen` registrations in `RootNavigator.tsx` pointing at minimal placeholder components that Tasks 4 and 9 will replace with real implementations (this keeps every commit in this plan shippable/buildable, per the bite-sized-task convention).

- [ ] **Step 1: Add `FileText`/`Languages` icons and two `HubCard`s to `ChallengesScreen.tsx`**

Change the import line:

```tsx
import { BookOpen, FileText, Focus, Languages, Mic, Radio } from 'lucide-react-native';
```

Insert after the "Jonli Musobaqalar" `HubCard` (before the two disabled cards):

```tsx
        <HubCard
          icon={<FileText size={22} color="#10b981" />}
          title="Mening testlarim"
          subtitle="O'z testlaringizni tuzing"
          onPress={() => navigation.navigate('MyTests')}
        />
        <HubCard
          icon={<Languages size={22} color="#f59e0b" />}
          title="Mening lug'atlarim"
          subtitle="O'z lug'atlaringizni tuzing"
          onPress={() => navigation.navigate('MyDictionaries')}
        />
```

- [ ] **Step 2: Create minimal placeholder screens so the app compiles**

```tsx
// apps/mobile/src/screens/MyTestsScreen.tsx
import React from 'react';
import { Screen } from '../components/Ui';
export function MyTestsScreen() { return <Screen />; }
```

```tsx
// apps/mobile/src/screens/MyDictionariesScreen.tsx
import React from 'react';
import { Screen } from '../components/Ui';
export function MyDictionariesScreen() { return <Screen />; }
```

(Task 4 replaces the first file's content; Task 9 replaces the second. Both are real files from the start — no separate "placeholder" file to delete later.)

- [ ] **Step 3: Register both screens in `RootNavigator.tsx`**

Add imports near the `ChallengesScreen` import:

```tsx
import { MyTestsScreen } from '../screens/MyTestsScreen';
import { MyDictionariesScreen } from '../screens/MyDictionariesScreen';
```

Add `Stack.Screen` entries near the `ChallengesList`/`ChallengeDetail` block:

```tsx
          <Stack.Screen
            name="MyTests"
            component={MyTestsScreen}
            options={{ title: 'Mening testlarim' }}
          />
          <Stack.Screen
            name="MyDictionaries"
            component={MyDictionariesScreen}
            options={{ title: "Mening lug'atlarim" }}
          />
```

- [ ] **Step 4: Type-check and verify the app builds**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/ChallengesScreen.tsx apps/mobile/src/screens/MyTestsScreen.tsx apps/mobile/src/screens/MyDictionariesScreen.tsx apps/mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): add Jamm hub cards and screen registrations for new features"
```

---

## Part B: Mening testlarim (mobile)

### Task 3: Add the student-tests API client

**Files:**
- Create: `apps/mobile/src/api/student-tests.ts`
- Test: `apps/mobile/__tests__/studentTestsApi.test.ts`

**Interfaces:**
- Produces: `StudentFolder`, `StudentTest`, `StudentTestDetail`, `CreateStudentTestData` types and `apiFetchStudentFolders`, `apiCreateStudentFolder`, `apiUpdateStudentFolder`, `apiDeleteStudentFolder`, `apiFetchStudentTests`, `apiGetStudentTest`, `apiCreateStudentTest`, `apiUpdateStudentTest`, `apiDeleteStudentTest`, `apiAddStudentQuestion`, `apiUpdateStudentQuestion`, `apiDeleteStudentQuestion` — same backend endpoints as `apps/frontend/src/api/student-tests.ts`, called through the mobile `api` instance.

- [ ] **Step 1: Write the failing test for one representative endpoint call**

```ts
// apps/mobile/__tests__/studentTestsApi.test.ts
import {api} from '../src/lib/api';
import {
  apiFetchStudentFolders,
  apiCreateStudentTest,
} from '../src/api/student-tests';

describe('student-tests API client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fetches student folders from /me/test-folders', async () => {
    jest.spyOn(api, 'get').mockResolvedValueOnce({
      data: [{id: 'f1', adminId: 'u1', name: 'Fizika', color: '#6366f1', icon: 'folder', createdAt: '2026-01-01', testCount: 2}],
    });

    const folders = await apiFetchStudentFolders();

    expect(api.get).toHaveBeenCalledWith('/me/test-folders');
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Fizika');
  });

  it('posts to /me/tests without requireAuth/onceOnly/deadline fields', async () => {
    jest.spyOn(api, 'post').mockResolvedValueOnce({data: {id: 't1'}});

    await apiCreateStudentTest({folderId: 'f1', name: 'Mening testim'});

    expect(api.post).toHaveBeenCalledWith('/me/tests', {folderId: 'f1', name: 'Mening testim'});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest studentTestsApi.test.ts`
Expected: FAIL — `Cannot find module '../src/api/student-tests'`

- [ ] **Step 3: Write `apps/mobile/src/api/student-tests.ts`**

```ts
import {api} from '../lib/api';
import type {Question} from '../types/api';

export interface StudentFolder {
  id: string;
  adminId: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
  testCount: number;
}

export interface StudentTest {
  id: string;
  folderId: string;
  adminId: string;
  name: string;
  description: string | null;
  timeLimit: number | null;
  showResults: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  oneByOne: boolean;
  requireAuth: boolean;
  autoCompleteOnLeave: boolean;
  onceOnly: boolean;
  deadline: string | null;
  createdAt: string;
  slug: string | null;
}

export interface StudentTestDetail extends StudentTest {
  questions: Question[];
}

export type CreateStudentTestData = {
  folderId: string;
  name: string;
  description?: string;
  timeLimit?: number;
  showResults?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  oneByOne?: boolean;
  autoCompleteOnLeave?: boolean;
};

export async function apiFetchStudentFolders(): Promise<StudentFolder[]> {
  return (await api.get('/me/test-folders')).data;
}

export async function apiCreateStudentFolder(name: string, color?: string, icon?: string): Promise<StudentFolder> {
  return (await api.post('/me/test-folders', {name, color, icon})).data;
}

export async function apiUpdateStudentFolder(id: string, data: {name?: string; color?: string; icon?: string}): Promise<StudentFolder> {
  return (await api.patch(`/me/test-folders/${id}`, data)).data;
}

export async function apiDeleteStudentFolder(id: string): Promise<void> {
  await api.delete(`/me/test-folders/${id}`);
}

export async function apiFetchStudentTests(folderId: string): Promise<StudentTest[]> {
  return (await api.get('/me/tests', {params: {folder_id: folderId}})).data;
}

export async function apiGetStudentTest(id: string): Promise<StudentTestDetail> {
  return (await api.get(`/me/tests/${id}`)).data;
}

export async function apiCreateStudentTest(data: CreateStudentTestData): Promise<StudentTest> {
  return (await api.post('/me/tests', data)).data;
}

export async function apiUpdateStudentTest(id: string, data: Partial<Omit<CreateStudentTestData, 'folderId'>>): Promise<StudentTest> {
  return (await api.patch(`/me/tests/${id}`, data)).data;
}

export async function apiDeleteStudentTest(id: string): Promise<void> {
  await api.delete(`/me/tests/${id}`);
}

export type CreateStudentQuestionData = {
  text: string;
  type: string;
  options: Array<{text: string; isCorrect: boolean; orderIndex?: number}>;
  imageUrl?: string;
  audioUrl?: string;
  correctAnswer?: string;
};

export async function apiAddStudentQuestion(testId: string, data: CreateStudentQuestionData): Promise<Question> {
  return (await api.post(`/me/tests/${testId}/questions`, data)).data;
}

export async function apiUpdateStudentQuestion(id: string, data: Partial<CreateStudentQuestionData>): Promise<Question> {
  return (await api.patch(`/me/questions/${id}`, data)).data;
}

export async function apiDeleteStudentQuestion(id: string): Promise<void> {
  await api.delete(`/me/questions/${id}`);
}
```

Note: `Question` type is imported from `'../types/api'` — before writing this file, grep `apps/mobile/src/types/api.ts` for an existing `Question` export; if none exists (the web's `Question` type lives in `apps/frontend/src/api/questions.ts`, which has no mobile mirror since mobile never had a question-creation surface before this plan), define it inline in this file instead:

```ts
export interface QuestionOption {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface Question {
  id: string;
  testId: string;
  text: string;
  type: string;
  orderIndex: number;
  imageUrl: string | null;
  audioUrl: string | null;
  correctAnswer: string | null;
  options: QuestionOption[];
}
```

(Check first — don't duplicate a type that already exists.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest studentTestsApi.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/api/student-tests.ts apps/mobile/__tests__/studentTestsApi.test.ts
git commit -m "feat(mobile): add student-tests API client"
```

---

### Task 4: Build `MyTestsScreen` (folder list)

**Files:**
- Modify: `apps/mobile/src/screens/MyTestsScreen.tsx` (replaces Task 2's placeholder)
- Test: `apps/mobile/__tests__/myTestsScreen.test.tsx` — **only if** an existing precedent for component-render tests exists (see Step 0); otherwise this task ships without a render test, matching the codebase's logic-only testing convention, and Step 0's finding is noted in the commit body.

**Interfaces:**
- Consumes: `apiFetchStudentFolders`, `apiCreateStudentFolder`, `apiUpdateStudentFolder`, `apiDeleteStudentFolder`, `StudentFolder` from Task 3.
- Produces: `MyTestsScreen` component, navigating to `MyTestFolder` with `{folderId, folderName}` on card press.

- [ ] **Step 0: Check whether any RTL (`@testing-library/react-native`) component test exists anywhere in the repo**

Run: `cd apps/mobile && grep -rl "@testing-library/react-native" __tests__/ package.json`

If no match, this codebase has zero component-render test precedent (confirmed during research) — write this screen without a render test, same as every other screen in the app. If a match is found (meaning a dependency/precedent was added since this plan was written), follow that precedent instead.

- [ ] **Step 1: Write `MyTestsScreen.tsx`**

```tsx
// apps/mobile/src/screens/MyTestsScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FileText, MoreVertical, Plus } from 'lucide-react-native';
import {
  apiCreateStudentFolder,
  apiDeleteStudentFolder,
  apiFetchStudentFolders,
  apiUpdateStudentFolder,
  type StudentFolder,
} from '../api/student-tests';
import { Button, Empty, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyTests'>;

const COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#6B7280', '#1f2937'];

export function MyTestsScreen({ navigation }: Props) {
  const [folders, setFolders] = useState<StudentFolder[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setFolders(await apiFetchStudentFolders());
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Papkalarni yuklab bo'lmadi"));
      setFolders([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      await apiCreateStudentFolder(newName.trim(), newColor);
      setCreating(false);
      setNewName('');
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Papka yaratib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(folder: StudentFolder) {
    Alert.alert('Papkani o\'chirish', `"${folder.name}" o'chirilsinmi? Ichidagi barcha testlar ham o'chadi.`, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteStudentFolder(folder.id);
            void load();
          } catch (error) {
            Alert.alert('Xatolik', getApiErrorMessage(error, "Papkani o'chirib bo'lmadi"));
          }
        },
      },
    ]);
  }

  function promptRename(folder: StudentFolder) {
    Alert.prompt?.(
      'Papka nomini o\'zgartirish',
      undefined,
      async (text) => {
        if (!text?.trim()) return;
        try {
          await apiUpdateStudentFolder(folder.id, { name: text.trim() });
          void load();
        } catch (error) {
          Alert.alert('Xatolik', getApiErrorMessage(error, "Papkani yangilab bo'lmadi"));
        }
      },
      'plain-text',
      folder.name,
    );
  }

  function showActions(folder: StudentFolder) {
    Alert.alert(folder.name, undefined, [
      { text: 'Nomini o\'zgartirish', onPress: () => promptRename(folder) },
      { text: "O'chirish", style: 'destructive', onPress: () => confirmDelete(folder) },
      { text: 'Bekor qilish', style: 'cancel' },
    ]);
  }

  if (folders === null) return <Loading />;

  return (
    <Screen>
      <View className="flex-row items-center justify-between p-4 pb-0">
        <Text className="text-lg font-black text-ink dark:text-dark-ink">Papkalar</Text>
        <Pressable
          onPress={() => setCreating((v) => !v)}
          className="h-10 w-10 items-center justify-center rounded-full bg-indigo-600"
        >
          <Plus size={20} color="#ffffff" />
        </Pressable>
      </View>

      {creating && (
        <View className="m-4 gap-3 rounded-2xl bg-white p-4 dark:bg-dark-surface">
          <TextInput
            autoFocus
            value={newName}
            onChangeText={setNewName}
            placeholder="Papka nomi"
            placeholderTextColor="#94a3b8"
            className="rounded-xl bg-gray-100 px-3 py-3 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <View className="flex-row flex-wrap gap-2">
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setNewColor(c)}
                style={{ backgroundColor: c, borderWidth: newColor === c ? 2 : 0, borderColor: '#000' }}
                className="h-8 w-8 rounded-full"
              />
            ))}
          </View>
          <Button title="Yaratish" loading={saving} onPress={() => void handleCreate()} />
        </View>
      )}

      {folders.length === 0 ? (
        <Empty text="Hali papka yo'q. Yangisini yarating!" />
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 p-4"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('MyTestFolder', { folderId: item.id, folderName: item.name })}
              className="flex-row items-center gap-3 rounded-2xl bg-white p-4 active:opacity-70 dark:bg-dark-surface"
            >
              <View style={{ backgroundColor: item.color }} className="h-11 w-11 items-center justify-center rounded-xl">
                <FileText size={20} color="#ffffff" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-ink dark:text-dark-ink">{item.name}</Text>
                <Text className="text-xs text-gray-400">{item.testCount} ta test</Text>
              </View>
              <Pressable onPress={() => showActions(item)} className="h-8 w-8 items-center justify-center">
                <MoreVertical size={18} color="#94a3b8" />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
```

Note: `Alert.prompt` is iOS-only in React Native — on Android it's `undefined`, hence the `Alert.prompt?.(...)` optional call. If the rename feature must also work on Android, this needs a small custom text-input dialog instead; this plan accepts the iOS-only limitation for rename (matching the low-stakes nature of a rename action — Android users can still delete-and-recreate) and flags it explicitly here rather than silently degrading. If the user wants full Android parity, replace with a small inline `Modal`+`TextInput` sheet mirroring the `PdfViewerSheet.tsx` skeleton.

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 4: Manually verify in the simulator/device**

Run the app (`cd apps/mobile && npx react-native run-ios` or `run-android`), log in as a student, navigate Jamm → "Mening testlarim", confirm the empty state renders, create a folder, confirm it appears in the list.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/MyTestsScreen.tsx
git commit -m "feat(mobile): implement MyTestsScreen folder list"
```

---

### Task 5: Build `MyTestFolderScreen` (test list within a folder)

**Files:**
- Create: `apps/mobile/src/screens/MyTestFolderScreen.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `apiFetchStudentTests`, `apiCreateStudentTest`, `apiDeleteStudentTest`, `StudentTest`, `CreateStudentTestData` from Task 3.
- Produces: `MyTestFolderScreen`, registered at `MyTestFolder`; navigates to `MyTestQuestionEditor` with `{testId, testName}` after creating a test.

- [ ] **Step 1: Write `MyTestFolderScreen.tsx`**

```tsx
// apps/mobile/src/screens/MyTestFolderScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Share, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Clock, Link2, Pencil, Plus, Trash2 } from 'lucide-react-native';
import {
  apiCreateStudentTest,
  apiDeleteStudentTest,
  apiFetchStudentTests,
  type StudentTest,
} from '../api/student-tests';
import { Button, Empty, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import { WEB_URL } from '../config/env';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyTestFolder'>;

export function MyTestFolderScreen({ route, navigation }: Props) {
  const { folderId } = route.params;
  const [tests, setTests] = useState<StudentTest[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setTests(await apiFetchStudentTests(folderId));
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Testlarni yuklab bo'lmadi"));
      setTests([]);
    }
  }, [folderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const data: CreateStudentTestData = { folderId, name: name.trim(), description: description.trim() || undefined };
    try {
      const test = await apiCreateStudentTest(data);
      setCreating(false);
      setName('');
      setDescription('');
      navigation.replace('MyTestQuestionEditor', { testId: test.id, testName: test.name });
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Test yaratib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(test: StudentTest) {
    Alert.alert("Testni o'chirish", `"${test.name}" o'chirilsinmi?`, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteStudentTest(test.id);
            void load();
          } catch (error) {
            Alert.alert('Xatolik', getApiErrorMessage(error, "Testni o'chirib bo'lmadi"));
          }
        },
      },
    ]);
  }

  async function shareLink(test: StudentTest) {
    if (!test.slug) return;
    await Share.share({ message: `${WEB_URL}/t/${test.slug}` });
  }

  if (tests === null) return <Loading />;

  return (
    <Screen>
      <View className="flex-row items-center justify-between p-4 pb-0">
        <Text className="text-lg font-black text-ink dark:text-dark-ink">Testlar</Text>
        <Pressable
          onPress={() => setCreating((v) => !v)}
          className="h-10 w-10 items-center justify-center rounded-full bg-indigo-600"
        >
          <Plus size={20} color="#ffffff" />
        </Pressable>
      </View>

      {creating && (
        <View className="m-4 gap-3 rounded-2xl bg-white p-4 dark:bg-dark-surface">
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder="Test nomi"
            placeholderTextColor="#94a3b8"
            className="rounded-xl bg-gray-100 px-3 py-3 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Tavsif (ixtiyoriy)"
            placeholderTextColor="#94a3b8"
            className="rounded-xl bg-gray-100 px-3 py-3 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Button title="Yaratish va savollar qo'shish" loading={saving} onPress={() => void handleCreate()} />
        </View>
      )}

      {tests.length === 0 ? (
        <Empty text="Hali testlar yo'q. Yangisini yarating!" />
      ) : (
        <FlatList
          data={tests}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 p-4"
          renderItem={({ item }) => (
            <View className="rounded-2xl bg-white p-4 dark:bg-dark-surface">
              <Text className="font-bold text-ink dark:text-dark-ink">{item.name}</Text>
              {item.description ? <Text className="mt-0.5 text-xs text-gray-400">{item.description}</Text> : null}
              <View className="mt-2 flex-row items-center gap-1.5">
                <Clock size={13} color="#94a3b8" />
                <Text className="text-xs text-gray-500">{item.timeLimit ? `${item.timeLimit} daqiqa` : 'Vaqt cheklanmagan'}</Text>
              </View>
              <View className="mt-3 flex-row gap-2">
                <Pressable
                  onPress={() => navigation.navigate('MyTestQuestionEditor', { testId: item.id, testName: item.name })}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas"
                >
                  <Pencil size={14} color="#475569" />
                  <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">Savollar</Text>
                </Pressable>
                <Pressable
                  disabled={!item.slug}
                  onPress={() => void shareLink(item)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas"
                >
                  <Link2 size={14} color="#475569" />
                  <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">Ulashish</Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(item)}
                  className="h-9 w-9 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40"
                >
                  <Trash2 size={14} color="#e11d48" />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
```

Note: `WEB_URL` — check `apps/mobile/src/config/env.ts` exports this exact name before using it (it's referenced in `WebScreen.tsx` per earlier research, so it should already exist); if the exported name differs, use the actual one.

- [ ] **Step 2: Register the screen in `RootNavigator.tsx`**

```tsx
import { MyTestFolderScreen } from '../screens/MyTestFolderScreen';
```

```tsx
          <Stack.Screen
            name="MyTestFolder"
            component={MyTestFolderScreen}
            options={({ route }) => ({ title: route.params.folderName })}
          />
```

- [ ] **Step 3: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/MyTestFolderScreen.tsx apps/mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): implement MyTestFolderScreen test list"
```

---

### Task 6: Question editor — simple types (single, multi, truefalse, open, fillblank)

**Files:**
- Create: `apps/mobile/src/screens/MyTestQuestionEditorScreen.tsx`
- Create: `apps/mobile/src/components/questionEditor/ChoiceTypeEditor.tsx`
- Create: `apps/mobile/src/components/questionEditor/TrueFalseTypeEditor.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`
- Test: `apps/mobile/__tests__/questionEncoding.test.ts`

**Interfaces:**
- Consumes: `apiGetStudentTest`, `apiAddStudentQuestion`, `apiUpdateStudentQuestion`, `apiDeleteStudentQuestion`, `StudentTestDetail` from Task 3.
- Produces: `MyTestQuestionEditorScreen` handling 5 of the 10 question types this task covers (`single`, `multi`, `truefalse`, `open`, `fillblank`); the remaining 5 (`arrange`, `reorder`, `matching`, `slider`, `droppin`) are added by Tasks 7-8 as additive branches to the same type-picker, not a rewrite.
- Produces: `encodeChoiceOptions(opts: {text: string; isCorrect: boolean}[]): CreateStudentQuestionData['options']` and `encodeTrueFalse(correct: 'true' | 'false'): CreateStudentQuestionData['options']` pure functions, exported from their respective component files, tested in isolation (per the backend DTO shape documented in the mobile design spec §4.4 table).

- [ ] **Step 1: Write the failing test for the encoding functions (the part of this task most prone to off-by-one/shape bugs)**

```ts
// apps/mobile/__tests__/questionEncoding.test.ts
import { encodeChoiceOptions } from '../src/components/questionEditor/ChoiceTypeEditor';
import { encodeTrueFalse } from '../src/components/questionEditor/TrueFalseTypeEditor';

describe('encodeChoiceOptions', () => {
  it('passes through text/isCorrect pairs for single/multi choice', () => {
    const result = encodeChoiceOptions([
      { text: 'A', isCorrect: true },
      { text: 'B', isCorrect: false },
    ]);
    expect(result).toEqual([
      { text: 'A', isCorrect: true },
      { text: 'B', isCorrect: false },
    ]);
  });

  it('drops options with empty text', () => {
    const result = encodeChoiceOptions([
      { text: 'A', isCorrect: true },
      { text: '  ', isCorrect: false },
    ]);
    expect(result).toEqual([{ text: 'A', isCorrect: true }]);
  });
});

describe('encodeTrueFalse', () => {
  it('encodes "true" as the To\'g\'ri option being correct', () => {
    expect(encodeTrueFalse('true')).toEqual([
      { text: "To'g'ri", isCorrect: true, orderIndex: 0 },
      { text: "Noto'g'ri", isCorrect: false, orderIndex: 1 },
    ]);
  });

  it('encodes "false" as the Noto\'g\'ri option being correct', () => {
    expect(encodeTrueFalse('false')).toEqual([
      { text: "To'g'ri", isCorrect: false, orderIndex: 0 },
      { text: "Noto'g'ri", isCorrect: true, orderIndex: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest questionEncoding.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Write `ChoiceTypeEditor.tsx`**

```tsx
// apps/mobile/src/components/questionEditor/ChoiceTypeEditor.tsx
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Check, Circle, Trash2 } from 'lucide-react-native';

export type ChoiceOption = { text: string; isCorrect: boolean };

export function encodeChoiceOptions(opts: ChoiceOption[]): Array<{ text: string; isCorrect: boolean }> {
  return opts.filter((o) => o.text.trim()).map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect }));
}

export function ChoiceTypeEditor({
  type,
  options,
  onChange,
}: {
  type: 'single' | 'multi';
  options: ChoiceOption[];
  onChange: (options: ChoiceOption[]) => void;
}) {
  function toggleCorrect(index: number) {
    if (type === 'single') {
      onChange(options.map((o, i) => ({ ...o, isCorrect: i === index })));
    } else {
      onChange(options.map((o, i) => (i === index ? { ...o, isCorrect: !o.isCorrect } : o)));
    }
  }

  function setText(index: number, text: string) {
    onChange(options.map((o, i) => (i === index ? { ...o, text } : o)));
  }

  function remove(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }

  return (
    <View className="gap-2">
      {options.map((option, index) => (
        <View key={index} className="flex-row items-center gap-2">
          <Pressable onPress={() => toggleCorrect(index)} className="h-8 w-8 items-center justify-center">
            {option.isCorrect ? <Check size={18} color="#10b981" /> : <Circle size={18} color="#cbd5e1" />}
          </Pressable>
          <TextInput
            value={option.text}
            onChangeText={(text) => setText(index, text)}
            placeholder={`Variant ${index + 1}`}
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Pressable onPress={() => remove(index)} className="h-8 w-8 items-center justify-center">
            <Trash2 size={16} color="#ef4444" />
          </Pressable>
        </View>
      ))}
      <Pressable
        onPress={() => onChange([...options, { text: '', isCorrect: false }])}
        className="items-center rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas"
      >
        <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">+ Variant qo'shish</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Write `TrueFalseTypeEditor.tsx`**

```tsx
// apps/mobile/src/components/questionEditor/TrueFalseTypeEditor.tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export function encodeTrueFalse(correct: 'true' | 'false'): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  return [
    { text: "To'g'ri", isCorrect: correct === 'true', orderIndex: 0 },
    { text: "Noto'g'ri", isCorrect: correct === 'false', orderIndex: 1 },
  ];
}

export function TrueFalseTypeEditor({
  value,
  onChange,
}: {
  value: 'true' | 'false' | null;
  onChange: (value: 'true' | 'false') => void;
}) {
  return (
    <View className="flex-row gap-3">
      <Pressable
        onPress={() => onChange('true')}
        className={`flex-1 items-center rounded-xl py-3 ${value === 'true' ? 'bg-emerald-500' : 'bg-gray-100 dark:bg-dark-canvas'}`}
      >
        <Text className={`font-bold ${value === 'true' ? 'text-white' : 'text-gray-600 dark:text-dark-ink'}`}>To'g'ri</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('false')}
        className={`flex-1 items-center rounded-xl py-3 ${value === 'false' ? 'bg-rose-500' : 'bg-gray-100 dark:bg-dark-canvas'}`}
      >
        <Text className={`font-bold ${value === 'false' ? 'text-white' : 'text-gray-600 dark:text-dark-ink'}`}>Noto'g'ri</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && npx jest questionEncoding.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Write `MyTestQuestionEditorScreen.tsx`** (single/multi/truefalse/open/fillblank only — Tasks 7-8 extend the `TYPES` array and `renderTypeEditor` switch)

```tsx
// apps/mobile/src/screens/MyTestQuestionEditorScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Trash2 } from 'lucide-react-native';
import {
  apiAddStudentQuestion,
  apiDeleteStudentQuestion,
  apiGetStudentTest,
  apiUpdateStudentQuestion,
  type CreateStudentQuestionData,
  type Question,
  type StudentTestDetail,
} from '../api/student-tests';
import { ChoiceTypeEditor, encodeChoiceOptions, type ChoiceOption } from '../components/questionEditor/ChoiceTypeEditor';
import { TrueFalseTypeEditor, encodeTrueFalse } from '../components/questionEditor/TrueFalseTypeEditor';
import { Button, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyTestQuestionEditor'>;

const TYPES: Array<{ key: string; label: string }> = [
  { key: 'single', label: 'Bir tanlov' },
  { key: 'multi', label: "Ko'p tanlov" },
  { key: 'truefalse', label: "To'g'ri/Noto'g'ri" },
  { key: 'open', label: 'Ochiq savol' },
  { key: 'fillblank', label: "Bo'sh joy" },
];

export function MyTestQuestionEditorScreen({ route }: Props) {
  const { testId } = route.params;
  const [test, setTest] = useState<StudentTestDetail | null>(null);
  const [type, setType] = useState('single');
  const [text, setText] = useState('');
  const [choiceOptions, setChoiceOptions] = useState<ChoiceOption[]>([
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [tfValue, setTfValue] = useState<'true' | 'false' | null>(null);
  const [openAnswer, setOpenAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setTest(await apiGetStudentTest(testId));
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Testni yuklab bo'lmadi"));
    }
  }, [testId]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setType('single');
    setText('');
    setChoiceOptions([{ text: '', isCorrect: false }, { text: '', isCorrect: false }]);
    setTfValue(null);
    setOpenAnswer('');
  }

  async function handleSave() {
    if (!text.trim() || saving) return;
    let data: CreateStudentQuestionData;
    if (type === 'single' || type === 'multi') {
      const options = encodeChoiceOptions(choiceOptions);
      if (options.length > 0 && !options.some((o) => o.isCorrect)) {
        Alert.alert('Xatolik', "Kamida bitta to'g'ri javob belgilanishi shart");
        return;
      }
      data = { text: text.trim(), type, options };
    } else if (type === 'truefalse') {
      if (!tfValue) {
        Alert.alert('Xatolik', "To'g'ri yoki Noto'g'rini tanlang");
        return;
      }
      data = { text: text.trim(), type, options: encodeTrueFalse(tfValue) };
    } else {
      // open, fillblank
      data = { text: text.trim(), type, options: [], correctAnswer: openAnswer.trim() || undefined };
    }

    setSaving(true);
    try {
      await apiAddStudentQuestion(testId, data);
      resetForm();
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Savol qo'shib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteQuestion(question: Question) {
    Alert.alert('Savolni o\'chirish', undefined, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteStudentQuestion(question.id);
            void load();
          } catch (error) {
            Alert.alert('Xatolik', getApiErrorMessage(error, "Savolni o'chirib bo'lmadi"));
          }
        },
      },
    ]);
  }

  if (!test) return <Loading />;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4">
        <View className="gap-3 rounded-2xl bg-white p-4 dark:bg-dark-surface">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {TYPES.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setType(t.key)}
                  className={`rounded-full border px-3 py-1.5 ${type === t.key ? 'border-gray-900 bg-gray-900 dark:border-white dark:bg-white' : 'border-gray-200 dark:border-zinc-700'}`}
                >
                  <Text className={`text-xs font-bold ${type === t.key ? 'text-white dark:text-gray-900' : 'text-gray-500'}`}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Savol matni"
            placeholderTextColor="#94a3b8"
            multiline
            className="rounded-xl bg-gray-100 px-3 py-3 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />

          {(type === 'single' || type === 'multi') && (
            <ChoiceTypeEditor type={type} options={choiceOptions} onChange={setChoiceOptions} />
          )}
          {type === 'truefalse' && <TrueFalseTypeEditor value={tfValue} onChange={setTfValue} />}
          {(type === 'open' || type === 'fillblank') && (
            <TextInput
              value={openAnswer}
              onChangeText={setOpenAnswer}
              placeholder="To'g'ri javob (ixtiyoriy)"
              placeholderTextColor="#94a3b8"
              className="rounded-xl bg-gray-100 px-3 py-3 text-ink dark:bg-dark-canvas dark:text-dark-ink"
            />
          )}

          <Button title="Savolni saqlash" loading={saving} onPress={() => void handleSave()} />
        </View>

        {test.questions.map((question, index) => (
          <View key={question.id} className="flex-row items-start gap-3 rounded-2xl bg-white p-4 dark:bg-dark-surface">
            <Text className="w-6 text-xs font-bold text-gray-400">{index + 1}.</Text>
            <Text className="flex-1 text-sm text-ink dark:text-dark-ink">{question.text}</Text>
            <Pressable onPress={() => confirmDeleteQuestion(question)} className="h-8 w-8 items-center justify-center">
              <Trash2 size={16} color="#ef4444" />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
```

Note: `apiUpdateStudentQuestion` is imported but not yet wired to an edit interaction in this task — inline editing of existing questions is deferred; tapping a question in the list is a no-op for now. If inline edit is required before shipping, add it as a follow-up task (out of scope for this plan per the spec's focus on creation, matching how the web's `InlineQuestionCard` pattern could be ported later without blocking the initial native launch).

- [ ] **Step 7: Register the screen in `RootNavigator.tsx`**

```tsx
import { MyTestQuestionEditorScreen } from '../screens/MyTestQuestionEditorScreen';
```

```tsx
          <Stack.Screen
            name="MyTestQuestionEditor"
            component={MyTestQuestionEditorScreen}
            options={({ route }) => ({ title: route.params.testName })}
          />
```

- [ ] **Step 8: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/screens/MyTestQuestionEditorScreen.tsx apps/mobile/src/components/questionEditor/ChoiceTypeEditor.tsx apps/mobile/src/components/questionEditor/TrueFalseTypeEditor.tsx apps/mobile/src/navigation/RootNavigator.tsx apps/mobile/__tests__/questionEncoding.test.ts
git commit -m "feat(mobile): question editor for single/multi/truefalse/open/fillblank types"
```

---

### Task 7: Question editor — list-based types (arrange, reorder, matching)

**Files:**
- Create: `apps/mobile/src/components/questionEditor/ReorderTypeEditor.tsx`
- Create: `apps/mobile/src/components/questionEditor/ArrangeTypeEditor.tsx`
- Create: `apps/mobile/src/components/questionEditor/MatchingTypeEditor.tsx`
- Modify: `apps/mobile/src/screens/MyTestQuestionEditorScreen.tsx`
- Test: `apps/mobile/__tests__/questionEncoding.test.ts` (extend)

**Interfaces:**
- Produces: `encodeReorder(tokens: string[])`, `encodeArrange(tokens: string[], distractors: string[])`, `encodeMatching(pairs: {left: string; right: string}[])` pure functions, matching the web's exact encoding (documented in `docs/superpowers/specs/2026-08-10-mobile-my-tests-my-dictionaries-design.md` §4.4 and verified against `apps/frontend/src/components/QuestionForm.tsx`'s `handleSubmit`).

- [ ] **Step 1: Extend the failing test with the three new encodings**

Append to `apps/mobile/__tests__/questionEncoding.test.ts`:

```ts
import { encodeReorder } from '../src/components/questionEditor/ReorderTypeEditor';
import { encodeArrange } from '../src/components/questionEditor/ArrangeTypeEditor';
import { encodeMatching } from '../src/components/questionEditor/MatchingTypeEditor';

describe('encodeReorder', () => {
  it('encodes tokens as ordered, all-correct options', () => {
    expect(encodeReorder(['first', 'second', 'third'])).toEqual([
      { text: 'first', isCorrect: true, orderIndex: 0 },
      { text: 'second', isCorrect: true, orderIndex: 1 },
      { text: 'third', isCorrect: true, orderIndex: 2 },
    ]);
  });

  it('drops blank tokens', () => {
    expect(encodeReorder(['first', '  ', 'third'])).toEqual([
      { text: 'first', isCorrect: true, orderIndex: 0 },
      { text: 'third', isCorrect: true, orderIndex: 1 },
    ]);
  });
});

describe('encodeArrange', () => {
  it('encodes correct tokens (ordered) plus distractors (unordered, isCorrect false)', () => {
    expect(encodeArrange(['a', 'b'], ['x', 'y'])).toEqual([
      { text: 'a', isCorrect: true, orderIndex: 0 },
      { text: 'b', isCorrect: true, orderIndex: 1 },
      { text: 'x', isCorrect: false, orderIndex: 0 },
      { text: 'y', isCorrect: false, orderIndex: 0 },
    ]);
  });
});

describe('encodeMatching', () => {
  it('flattens left/right pairs into isCorrect-tagged options sharing an orderIndex per pair', () => {
    expect(encodeMatching([{ left: 'cat', right: 'mushuk' }, { left: 'dog', right: "it" }])).toEqual([
      { text: 'cat', isCorrect: true, orderIndex: 0 },
      { text: 'mushuk', isCorrect: false, orderIndex: 0 },
      { text: 'dog', isCorrect: true, orderIndex: 1 },
      { text: 'it', isCorrect: false, orderIndex: 1 },
    ]);
  });

  it('drops pairs missing either side', () => {
    expect(encodeMatching([{ left: 'cat', right: 'mushuk' }, { left: '', right: 'it' }])).toEqual([
      { text: 'cat', isCorrect: true, orderIndex: 0 },
      { text: 'mushuk', isCorrect: false, orderIndex: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest questionEncoding.test.ts`
Expected: FAIL — the three new modules don't exist.

- [ ] **Step 3: Write `ReorderTypeEditor.tsx`**

Reuses the up/down-button list-reorder UX already established and documented in `apps/mobile/src/components/testTaker/ReorderQuestion.tsx` (drag-and-drop libraries aren't available in this environment; up/down buttons are the codebase's own precedent for native list reordering).

```tsx
// apps/mobile/src/components/questionEditor/ReorderTypeEditor.tsx
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react-native';

export function encodeReorder(tokens: string[]): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  return tokens
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, orderIndex) => ({ text, isCorrect: true, orderIndex }));
}

export function ReorderTypeEditor({ tokens, onChange }: { tokens: string[]; onChange: (tokens: string[]) => void }) {
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= tokens.length) return;
    const next = [...tokens];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function setText(index: number, text: string) {
    onChange(tokens.map((t, i) => (i === index ? text : t)));
  }
  function remove(index: number) {
    onChange(tokens.filter((_, i) => i !== index));
  }

  return (
    <View className="gap-2">
      <Text className="text-xs text-gray-400">To'g'ri tartibda kiriting:</Text>
      {tokens.map((token, index) => (
        <View key={index} className="flex-row items-center gap-2">
          <Text className="w-5 text-xs text-gray-400">{index + 1}.</Text>
          <TextInput
            value={token}
            onChangeText={(text) => setText(index, text)}
            placeholder={`${index + 1}-element`}
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Pressable onPress={() => move(index, -1)} disabled={index === 0} className="h-8 w-8 items-center justify-center opacity-100">
            <ChevronUp size={16} color={index === 0 ? '#e2e8f0' : '#475569'} />
          </Pressable>
          <Pressable onPress={() => move(index, 1)} disabled={index === tokens.length - 1} className="h-8 w-8 items-center justify-center">
            <ChevronDown size={16} color={index === tokens.length - 1 ? '#e2e8f0' : '#475569'} />
          </Pressable>
          <Pressable onPress={() => remove(index)} className="h-8 w-8 items-center justify-center">
            <Trash2 size={16} color="#ef4444" />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChange([...tokens, ''])} className="items-center rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas">
        <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">+ Element qo'shish</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Write `ArrangeTypeEditor.tsx`**

```tsx
// apps/mobile/src/components/questionEditor/ArrangeTypeEditor.tsx
import React from 'react';
import { Text, View } from 'react-native';
import { ReorderTypeEditor } from './ReorderTypeEditor';
import { Pressable, TextInput } from 'react-native';
import { Trash2 } from 'lucide-react-native';

export function encodeArrange(
  correctTokens: string[],
  distractors: string[],
): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  const validTokens = correctTokens.map((t) => t.trim()).filter(Boolean);
  const validDistractors = distractors.map((d) => d.trim()).filter(Boolean);
  return [
    ...validTokens.map((text, orderIndex) => ({ text, isCorrect: true, orderIndex })),
    ...validDistractors.map((text) => ({ text, isCorrect: false, orderIndex: 0 })),
  ];
}

export function ArrangeTypeEditor({
  correctTokens,
  distractors,
  onChangeTokens,
  onChangeDistractors,
}: {
  correctTokens: string[];
  distractors: string[];
  onChangeTokens: (tokens: string[]) => void;
  onChangeDistractors: (distractors: string[]) => void;
}) {
  function setDistractor(index: number, text: string) {
    onChangeDistractors(distractors.map((d, i) => (i === index ? text : d)));
  }
  function removeDistractor(index: number) {
    onChangeDistractors(distractors.filter((_, i) => i !== index));
  }

  return (
    <View className="gap-3">
      <ReorderTypeEditor tokens={correctTokens} onChange={onChangeTokens} />
      <Text className="text-xs text-gray-400">Chalg'ituvchi variantlar (ixtiyoriy):</Text>
      {distractors.map((d, index) => (
        <View key={index} className="flex-row items-center gap-2">
          <TextInput
            value={d}
            onChangeText={(text) => setDistractor(index, text)}
            placeholder="Chalg'ituvchi"
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Pressable onPress={() => removeDistractor(index)} className="h-8 w-8 items-center justify-center">
            <Trash2 size={16} color="#ef4444" />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChangeDistractors([...distractors, ''])} className="items-center rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas">
        <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">+ Chalg'ituvchi qo'shish</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 5: Write `MatchingTypeEditor.tsx`**

```tsx
// apps/mobile/src/components/questionEditor/MatchingTypeEditor.tsx
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';

export type MatchPair = { left: string; right: string };

export function encodeMatching(pairs: MatchPair[]): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  const valid = pairs.filter((p) => p.left.trim() && p.right.trim());
  return valid.flatMap((p, i) => [
    { text: p.left.trim(), isCorrect: true, orderIndex: i },
    { text: p.right.trim(), isCorrect: false, orderIndex: i },
  ]);
}

export function MatchingTypeEditor({ pairs, onChange }: { pairs: MatchPair[]; onChange: (pairs: MatchPair[]) => void }) {
  function setLeft(index: number, left: string) {
    onChange(pairs.map((p, i) => (i === index ? { ...p, left } : p)));
  }
  function setRight(index: number, right: string) {
    onChange(pairs.map((p, i) => (i === index ? { ...p, right } : p)));
  }
  function remove(index: number) {
    onChange(pairs.filter((_, i) => i !== index));
  }

  return (
    <View className="gap-2">
      {pairs.map((pair, index) => (
        <View key={index} className="flex-row items-center gap-2">
          <TextInput
            value={pair.left}
            onChangeText={(text) => setLeft(index, text)}
            placeholder="Chap (savol)"
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <TextInput
            value={pair.right}
            onChangeText={(text) => setRight(index, text)}
            placeholder="O'ng (javob)"
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Pressable onPress={() => remove(index)} className="h-8 w-8 items-center justify-center">
            <Trash2 size={16} color="#ef4444" />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChange([...pairs, { left: '', right: '' }])} className="items-center rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas">
        <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">+ Juftlik qo'shish</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/mobile && npx jest questionEncoding.test.ts`
Expected: PASS (10 tests total)

- [ ] **Step 7: Wire the three new types into `MyTestQuestionEditorScreen.tsx`**

Add to the `TYPES` array: `{ key: 'reorder', label: 'Tartiblash' }, { key: 'arrange', label: 'Joylashtirish' }, { key: 'matching', label: "Moslashtirish" }`.

Add state: `const [reorderTokens, setReorderTokens] = useState<string[]>(['', ''])`, `const [arrangeTokens, setArrangeTokens] = useState<string[]>(['', ''])`, `const [arrangeDistractors, setArrangeDistractors] = useState<string[]>([])`, `const [matchPairs, setMatchPairs] = useState<MatchPair[]>([{left:'',right:''},{left:'',right:''}])`.

In `handleSave`, extend the `if/else if` chain (before the final `else` catch-all for `open`/`fillblank`):

```tsx
    } else if (type === 'reorder') {
      const options = encodeReorder(reorderTokens);
      if (options.length < 2) {
        Alert.alert('Xatolik', 'Kamida 2 ta element kiriting');
        return;
      }
      data = { text: text.trim(), type, options };
    } else if (type === 'arrange') {
      const options = encodeArrange(arrangeTokens, arrangeDistractors);
      if (options.filter((o) => o.isCorrect).length < 2) {
        Alert.alert('Xatolik', 'Kamida 2 ta to\'g\'ri element kiriting');
        return;
      }
      data = { text: text.trim(), type, options };
    } else if (type === 'matching') {
      const options = encodeMatching(matchPairs);
      if (options.length < 4) {
        Alert.alert('Xatolik', "Kamida 2 ta juft kiriting");
        return;
      }
      data = { text: text.trim(), type, options };
```

Add render branches after the `truefalse` branch:

```tsx
          {type === 'reorder' && <ReorderTypeEditor tokens={reorderTokens} onChange={setReorderTokens} />}
          {type === 'arrange' && (
            <ArrangeTypeEditor
              correctTokens={arrangeTokens}
              distractors={arrangeDistractors}
              onChangeTokens={setArrangeTokens}
              onChangeDistractors={setArrangeDistractors}
            />
          )}
          {type === 'matching' && <MatchingTypeEditor pairs={matchPairs} onChange={setMatchPairs} />}
```

Extend `resetForm` to also reset these three state slices, and add the corresponding imports at the top of the file.

- [ ] **Step 8: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/components/questionEditor/ReorderTypeEditor.tsx apps/mobile/src/components/questionEditor/ArrangeTypeEditor.tsx apps/mobile/src/components/questionEditor/MatchingTypeEditor.tsx apps/mobile/src/screens/MyTestQuestionEditorScreen.tsx apps/mobile/__tests__/questionEncoding.test.ts
git commit -m "feat(mobile): question editor for reorder/arrange/matching types"
```

---

### Task 8: Question editor — media/coordinate types (slider, droppin)

**Files:**
- Create: `apps/mobile/src/components/questionEditor/SliderTypeEditor.tsx`
- Create: `apps/mobile/src/components/questionEditor/DropPinTypeEditor.tsx`
- Modify: `apps/mobile/src/screens/MyTestQuestionEditorScreen.tsx`
- Test: `apps/mobile/__tests__/questionEncoding.test.ts` (extend)

**Interfaces:**
- Consumes: `apiUploadMedia` from `apps/mobile/src/api/auth.ts` (existing function, confirmed present — `folder: 'questions'` is the closest existing bucket to reuse; verify this literal is already in the union before using it, extend the union server-side + here only if it's missing).
- Produces: `encodeSlider(min: string, max: string, step: string)`, `encodeDropPin(radiusPct: string)` pure functions; `DropPinTypeEditor` handles image upload + tap-to-place-pin (via `onPress`'s `nativeEvent.locationX/Y` converted to a percentage using the image `View`'s measured width/height).

- [ ] **Step 1: Extend the failing test**

Append to `apps/mobile/__tests__/questionEncoding.test.ts`:

```ts
import { encodeSlider } from '../src/components/questionEditor/SliderTypeEditor';
import { encodeDropPinRadius } from '../src/components/questionEditor/DropPinTypeEditor';

describe('encodeSlider', () => {
  it('encodes min/max/step as three ordered options, defaulting blanks', () => {
    expect(encodeSlider('0', '100', '5')).toEqual([
      { text: '0', isCorrect: false, orderIndex: 0 },
      { text: '100', isCorrect: false, orderIndex: 1 },
      { text: '5', isCorrect: false, orderIndex: 2 },
    ]);
  });

  it('defaults to 0/100/1 when fields are blank', () => {
    expect(encodeSlider('', '', '')).toEqual([
      { text: '0', isCorrect: false, orderIndex: 0 },
      { text: '100', isCorrect: false, orderIndex: 1 },
      { text: '1', isCorrect: false, orderIndex: 2 },
    ]);
  });
});

describe('encodeDropPinRadius', () => {
  it('encodes the radius percentage as a single option', () => {
    expect(encodeDropPinRadius('8')).toEqual([{ text: '8', isCorrect: false, orderIndex: 0 }]);
  });

  it('defaults to 8 when blank', () => {
    expect(encodeDropPinRadius('')).toEqual([{ text: '8', isCorrect: false, orderIndex: 0 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest questionEncoding.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Write `SliderTypeEditor.tsx`**

```tsx
// apps/mobile/src/components/questionEditor/SliderTypeEditor.tsx
import React from 'react';
import { Text, TextInput, View } from 'react-native';

export function encodeSlider(min: string, max: string, step: string): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  return [
    { text: min.trim() || '0', isCorrect: false, orderIndex: 0 },
    { text: max.trim() || '100', isCorrect: false, orderIndex: 1 },
    { text: step.trim() || '1', isCorrect: false, orderIndex: 2 },
  ];
}

export function SliderTypeEditor({
  min,
  max,
  step,
  onChangeMin,
  onChangeMax,
  onChangeStep,
}: {
  min: string;
  max: string;
  step: string;
  onChangeMin: (v: string) => void;
  onChangeMax: (v: string) => void;
  onChangeStep: (v: string) => void;
}) {
  return (
    <View className="flex-row gap-2">
      <View className="flex-1">
        <Text className="mb-1 text-[10px] text-gray-400">Min</Text>
        <TextInput value={min} onChangeText={onChangeMin} keyboardType="numeric" placeholder="0" placeholderTextColor="#94a3b8" className="rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink" />
      </View>
      <View className="flex-1">
        <Text className="mb-1 text-[10px] text-gray-400">Max</Text>
        <TextInput value={max} onChangeText={onChangeMax} keyboardType="numeric" placeholder="100" placeholderTextColor="#94a3b8" className="rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink" />
      </View>
      <View className="flex-1">
        <Text className="mb-1 text-[10px] text-gray-400">Qadam</Text>
        <TextInput value={step} onChangeText={onChangeStep} keyboardType="numeric" placeholder="1" placeholderTextColor="#94a3b8" className="rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink" />
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Write `DropPinTypeEditor.tsx`**

```tsx
// apps/mobile/src/components/questionEditor/DropPinTypeEditor.tsx
import React, { useState } from 'react';
import { Image, Pressable, Text, TextInput, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

export function encodeDropPinRadius(radiusPct: string): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  return [{ text: radiusPct.trim() || '8', isCorrect: false, orderIndex: 0 }];
}

export function DropPinTypeEditor({
  imageUrl,
  correctAnswer,
  radiusPct,
  onChangeRadius,
  onChangeCorrectAnswer,
}: {
  imageUrl: string | null;
  correctAnswer: string;
  radiusPct: string;
  onChangeRadius: (v: string) => void;
  onChangeCorrectAnswer: (v: string) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  function onLayout(e: LayoutChangeEvent) {
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  }

  function onPress(e: GestureResponderEvent) {
    if (!size.width || !size.height) return;
    const xPct = (e.nativeEvent.locationX / size.width) * 100;
    const yPct = (e.nativeEvent.locationY / size.height) * 100;
    onChangeCorrectAnswer(`${xPct.toFixed(1)},${yPct.toFixed(1)}`);
  }

  const [px, py] = correctAnswer ? correctAnswer.split(',').map(Number) : [null, null];

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="text-[10px] text-gray-400">Radius (1-30%):</Text>
        <TextInput
          value={radiusPct}
          onChangeText={onChangeRadius}
          keyboardType="numeric"
          placeholder="8"
          placeholderTextColor="#94a3b8"
          className="w-16 rounded-lg bg-gray-100 px-2 py-1.5 text-sm text-ink dark:bg-dark-canvas dark:text-dark-ink"
        />
      </View>
      {imageUrl ? (
        <Pressable onPress={onPress} onLayout={onLayout} className="relative overflow-hidden rounded-xl">
          <Image source={{ uri: imageUrl }} style={{ width: '100%', aspectRatio: size.width && size.height ? size.width / size.height : 1.5 }} resizeMode="cover" />
          {px !== null && py !== null && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: `${px}%`,
                top: `${py}%`,
                width: 16,
                height: 16,
                marginLeft: -8,
                marginTop: -8,
                borderRadius: 8,
                backgroundColor: '#ef4444',
                borderWidth: 2,
                borderColor: '#ffffff',
              }}
            />
          )}
        </Pressable>
      ) : (
        <View className="items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 dark:bg-dark-canvas dark:border-zinc-700">
          <Text className="text-xs text-gray-400">Yuqoridan rasm yuklang, keyin to'g'ri joyni bosing</Text>
        </View>
      )}
      {correctAnswer && (
        <Text className="text-[10px] text-gray-400">Pin: {correctAnswer} | Radius: {radiusPct || '8'}%</Text>
      )}
    </View>
  );
}
```

Note: this task does not build the image-upload trigger button (`react-native-image-picker` + `apiUploadMedia` call) inline in this component — that wiring belongs in `MyTestQuestionEditorScreen.tsx` (Step 5 below), shared across any question type needing `imageUrl` (currently only `droppin`, but this keeps the upload trigger reusable if a future type needs it).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && npx jest questionEncoding.test.ts`
Expected: PASS (14 tests total)

- [ ] **Step 6: Wire `slider` and `droppin` into `MyTestQuestionEditorScreen.tsx`**

Add to `TYPES`: `{ key: 'slider', label: 'Slider' }, { key: 'droppin', label: 'Nuqta belgilash' }`.

Add state: `const [sliderMin, setSliderMin] = useState('0')`, `const [sliderMax, setSliderMax] = useState('100')`, `const [sliderStep, setSliderStep] = useState('1')`, `const [dropPinRadius, setDropPinRadius] = useState('8')`, `const [dropPinAnswer, setDropPinAnswer] = useState('')`, `const [questionImageUrl, setQuestionImageUrl] = useState<string | null>(null)`, `const [uploading, setUploading] = useState(false)`.

Add the image-picker trigger (only rendered when `type === 'droppin'`, using the existing `apiUploadMedia` from `apps/mobile/src/api/auth.ts` and `react-native-image-picker`'s `launchImageLibrary`):

```tsx
import { launchImageLibrary } from 'react-native-image-picker';
import { apiUploadMedia } from '../api/auth';
// ...
  async function pickImage() {
    const result = await launchImageLibrary({ mediaType: 'photo' });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setUploading(true);
    try {
      const uploaded = await apiUploadMedia({ uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? 'question.jpg' }, 'questions');
      setQuestionImageUrl(uploaded.url);
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Rasm yuklab bo'lmadi"));
    } finally {
      setUploading(false);
    }
  }
```

Add render branches:

```tsx
          {type === 'slider' && (
            <SliderTypeEditor min={sliderMin} max={sliderMax} step={sliderStep} onChangeMin={setSliderMin} onChangeMax={setSliderMax} onChangeStep={setSliderStep} />
          )}
          {type === 'droppin' && (
            <View className="gap-2">
              <Button title={uploading ? 'Yuklanmoqda...' : 'Rasm tanlash'} loading={uploading} onPress={() => void pickImage()} />
              <DropPinTypeEditor
                imageUrl={questionImageUrl}
                correctAnswer={dropPinAnswer}
                radiusPct={dropPinRadius}
                onChangeRadius={setDropPinRadius}
                onChangeCorrectAnswer={setDropPinAnswer}
              />
            </View>
          )}
```

Extend `handleSave`'s `if/else if` chain:

```tsx
    } else if (type === 'slider') {
      data = { text: text.trim(), type, options: encodeSlider(sliderMin, sliderMax, sliderStep) };
    } else if (type === 'droppin') {
      if (!questionImageUrl || !dropPinAnswer) {
        Alert.alert('Xatolik', "Rasm yuklang va to'g'ri joyni belgilang");
        return;
      }
      data = { text: text.trim(), type, options: encodeDropPinRadius(dropPinRadius), imageUrl: questionImageUrl, correctAnswer: dropPinAnswer };
```

Extend `resetForm` to reset these state slices too, and add the corresponding imports.

- [ ] **Step 7: Verify `'questions'` is a valid `folder` literal for `apiUploadMedia`**

Run: `grep -n "folder:" apps/mobile/src/api/auth.ts` and confirm `'questions'` is in the union (it was found during research). If not present, this step must add it there and check with the backend team whether the server-side upload endpoint's `folder` validation needs the same addition — do not proceed silently if this mismatch exists.

- [ ] **Step 8: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 10: Manually verify all 10 question types in the simulator**

Create a test, add one question of each of the 10 types, confirm each saves without error and appears in the question list. For `droppin`, confirm the image uploads and the pin marker renders at the tapped location.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/components/questionEditor/SliderTypeEditor.tsx apps/mobile/src/components/questionEditor/DropPinTypeEditor.tsx apps/mobile/src/screens/MyTestQuestionEditorScreen.tsx apps/mobile/__tests__/questionEncoding.test.ts
git commit -m "feat(mobile): question editor for slider/droppin types, completing all 10 question types"
```

---

## Part C: Mening lug'atlarim (mobile)

### Task 9: Add the word-decks API client and build `MyDictionariesScreen`

**Files:**
- Create: `apps/mobile/src/api/word-decks.ts`
- Modify: `apps/mobile/src/screens/MyDictionariesScreen.tsx` (replaces Task 2's placeholder)
- Test: `apps/mobile/__tests__/wordDecksApi.test.ts`

**Interfaces:**
- Produces: `WordDeck`, `DeckWord`, `DeckView` types and `apiFetchWordDecks`, `apiCreateWordDeck`, `apiUpdateWordDeck`, `apiDeleteWordDeck`, `apiListDeckWords`, `apiAddDeckWord`, `apiBulkImportDeckWords`, `apiDeleteDeckWord`, `apiGetDeckBySlug` — mirrors `apps/frontend/src/api/word-decks.ts` exactly, called through the mobile `api` instance.
- Produces: `MyDictionariesScreen`, navigating to `WordDeck` with `{deckId, deckName}` on card press.

- [ ] **Step 1: Write the failing test for the API client**

```ts
// apps/mobile/__tests__/wordDecksApi.test.ts
import {api} from '../src/lib/api';
import {apiFetchWordDecks, apiGetDeckBySlug} from '../src/api/word-decks';

describe('word-decks API client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fetches word decks from /me/word-decks', async () => {
    jest.spyOn(api, 'get').mockResolvedValueOnce({
      data: [{id: 'd1', ownerId: 'u1', name: "Ingliz tili", slug: 'AbCd1234', createdAt: '2026-01-01'}],
    });

    const decks = await apiFetchWordDecks();

    expect(api.get).toHaveBeenCalledWith('/me/word-decks');
    expect(decks[0].name).toBe('Ingliz tili');
  });

  it('fetches a deck by slug from the public decks endpoint', async () => {
    jest.spyOn(api, 'get').mockResolvedValueOnce({
      data: {id: 'd1', name: "Ingliz tili", words: [{id: 'w1', word: 'apple', translation: 'olma'}]},
    });

    const deck = await apiGetDeckBySlug('AbCd1234');

    expect(api.get).toHaveBeenCalledWith('/decks/AbCd1234');
    expect(deck.words).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest wordDecksApi.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write `apps/mobile/src/api/word-decks.ts`**

```ts
import {api} from '../lib/api';

export interface WordDeck {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface DeckWord {
  id: string;
  deckId: string;
  word: string;
  translation: string;
  orderIndex: number;
}

export interface DeckView {
  id: string;
  name: string;
  words: Array<{id: string; word: string; translation: string}>;
}

export async function apiFetchWordDecks(): Promise<WordDeck[]> {
  return (await api.get('/me/word-decks')).data;
}

export async function apiCreateWordDeck(name: string): Promise<WordDeck> {
  return (await api.post('/me/word-decks', {name})).data;
}

export async function apiUpdateWordDeck(id: string, name: string): Promise<WordDeck> {
  return (await api.patch(`/me/word-decks/${id}`, {name})).data;
}

export async function apiDeleteWordDeck(id: string): Promise<void> {
  await api.delete(`/me/word-decks/${id}`);
}

export async function apiListDeckWords(deckId: string): Promise<DeckWord[]> {
  return (await api.get(`/me/word-decks/${deckId}/words`)).data;
}

export async function apiAddDeckWord(deckId: string, data: {word: string; translation: string}): Promise<DeckWord> {
  return (await api.post(`/me/word-decks/${deckId}/words`, data)).data;
}

export async function apiBulkImportDeckWords(deckId: string, text: string): Promise<{added: number; skipped: number}> {
  return (await api.post(`/me/word-decks/${deckId}/words/bulk`, {text})).data;
}

export async function apiDeleteDeckWord(deckId: string, wordId: string): Promise<void> {
  await api.delete(`/me/word-decks/${deckId}/words/${wordId}`);
}

export async function apiGetDeckBySlug(slug: string): Promise<DeckView> {
  return (await api.get(`/decks/${slug}`)).data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest wordDecksApi.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `MyDictionariesScreen.tsx`**

```tsx
// apps/mobile/src/screens/MyDictionariesScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Languages, MoreVertical, Plus } from 'lucide-react-native';
import {
  apiCreateWordDeck,
  apiDeleteWordDeck,
  apiFetchWordDecks,
  apiUpdateWordDeck,
  type WordDeck,
} from '../api/word-decks';
import { Button, Empty, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyDictionaries'>;

export function MyDictionariesScreen({ navigation }: Props) {
  const [decks, setDecks] = useState<WordDeck[] | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setDecks(await apiFetchWordDecks());
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Lug'atlarni yuklab bo'lmadi"));
      setDecks([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await apiCreateWordDeck(newName.trim());
      setNewName('');
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Lug'at yaratib bo'lmadi"));
    } finally {
      setCreating(false);
    }
  }

  function showActions(deck: WordDeck) {
    Alert.alert(deck.name, undefined, [
      {
        text: 'Nomini o\'zgartirish',
        onPress: () =>
          Alert.prompt?.('Lug\'at nomi', undefined, async (text) => {
            if (!text?.trim()) return;
            try {
              await apiUpdateWordDeck(deck.id, text.trim());
              void load();
            } catch (error) {
              Alert.alert('Xatolik', getApiErrorMessage(error, "Lug'atni yangilab bo'lmadi"));
            }
          }, 'plain-text', deck.name),
      },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: () =>
          Alert.alert("Lug'atni o'chirish", `"${deck.name}" o'chirilsinmi? Ichidagi barcha so'zlar ham o'chadi.`, [
            { text: 'Bekor qilish', style: 'cancel' },
            {
              text: "O'chirish",
              style: 'destructive',
              onPress: async () => {
                try {
                  await apiDeleteWordDeck(deck.id);
                  void load();
                } catch (error) {
                  Alert.alert('Xatolik', getApiErrorMessage(error, "Lug'atni o'chirib bo'lmadi"));
                }
              },
            },
          ]),
      },
      { text: 'Bekor qilish', style: 'cancel' },
    ]);
  }

  if (decks === null) return <Loading />;

  return (
    <Screen>
      <View className="gap-2 p-4 pb-0">
        <Text className="text-lg font-black text-ink dark:text-dark-ink">Lug'atlar</Text>
        <View className="flex-row gap-2">
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Yangi lug'at nomi"
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-3 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Pressable
            disabled={!newName.trim() || creating}
            onPress={() => void handleCreate()}
            className="h-11 w-12 items-center justify-center rounded-xl bg-indigo-600 disabled:opacity-40"
          >
            <Plus size={20} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {decks.length === 0 ? (
        <Empty text="Hali lug'at yo'q. Yangisini yarating!" />
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 p-4"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('WordDeck', { deckId: item.id, deckName: item.name })}
              className="flex-row items-center gap-3 rounded-2xl bg-white p-4 active:opacity-70 dark:bg-dark-surface"
            >
              <View className="h-11 w-11 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
                <Languages size={20} color="#f59e0b" />
              </View>
              <Text className="flex-1 font-bold text-ink dark:text-dark-ink">{item.name}</Text>
              <Pressable onPress={() => showActions(item)} className="h-8 w-8 items-center justify-center">
                <MoreVertical size={18} color="#94a3b8" />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/api/word-decks.ts apps/mobile/src/screens/MyDictionariesScreen.tsx apps/mobile/__tests__/wordDecksApi.test.ts
git commit -m "feat(mobile): add word-decks API client and MyDictionariesScreen"
```

---

### Task 10: Build `WordDeckScreen` (word management + bulk import + share)

**Files:**
- Create: `apps/mobile/src/screens/WordDeckScreen.tsx`
- Create: `apps/mobile/src/components/BulkImportWordsSheet.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `apiListDeckWords`, `apiAddDeckWord`, `apiBulkImportDeckWords`, `apiDeleteDeckWord`, `DeckWord` from Task 9.
- Produces: `WordDeckScreen` registered at `WordDeck`; `BulkImportWordsSheet` (a hand-rolled bottom sheet following the `PdfViewerSheet.tsx` skeleton — `Modal` + `react-native-reanimated` slide-up + `react-native-gesture-handler` drag-to-dismiss).

- [ ] **Step 1: Write `BulkImportWordsSheet.tsx`**

```tsx
// apps/mobile/src/components/BulkImportWordsSheet.tsx
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { Button } from './Ui';

const SPRING = { damping: 22, stiffness: 260, mass: 0.7 };

export function BulkImportWordsSheet({
  visible,
  onClose,
  onSubmit,
  submitting,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  submitting: boolean;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [text, setText] = useState('');
  const translateY = useSharedValue(windowHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = windowHeight;
      backdropOpacity.value = withTiming(1, { duration: 220 });
      translateY.value = withSpring(0, SPRING);
    } else if (mounted) {
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withSpring(windowHeight, SPRING, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, windowHeight]);

  function close() {
    onClose();
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) {
        translateY.value = withSpring(windowHeight, SPRING, (finished) => {
          if (finished) runOnJS(close)();
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  if (!mounted) return null;

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>
        <Animated.View style={[sheetStyle]} className="rounded-t-3xl bg-white p-5 dark:bg-dark-surface">
          <GestureDetector gesture={pan}>
            <View className="items-center pb-3">
              <View className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-dark-border" />
            </View>
          </GestureDetector>
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-base font-bold text-ink dark:text-dark-ink">Ommaviy import</Text>
            <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-surface-2">
              <X size={16} color="#475569" />
            </Pressable>
          </View>
          <Text className="mb-3 text-xs text-gray-400">Har qatorda: so'z - tarjima</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={8}
            placeholder={'apple - olma\nbook - kitob'}
            placeholderTextColor="#94a3b8"
            className="mb-4 h-40 rounded-2xl bg-gray-100 p-3 text-sm text-ink dark:bg-dark-canvas dark:text-dark-ink"
            textAlignVertical="top"
          />
          <Button
            title="Import qilish"
            loading={submitting}
            disabled={!text.trim()}
            onPress={() => {
              onSubmit(text);
              setText('');
            }}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Write `WordDeckScreen.tsx`**

```tsx
// apps/mobile/src/screens/WordDeckScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Share, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Link2, Trash2, Upload, Zap } from 'lucide-react-native';
import {
  apiAddDeckWord,
  apiBulkImportDeckWords,
  apiDeleteDeckWord,
  apiListDeckWords,
  type DeckWord,
} from '../api/word-decks';
import { BulkImportWordsSheet } from '../components/BulkImportWordsSheet';
import { Empty, Loading, Screen } from '../components/Ui';
import { getApiErrorMessage } from '../lib/errors';
import { WEB_URL } from '../config/env';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WordDeck'>;

export function WordDeckScreen({ route, navigation }: Props) {
  const { deckId, deckName } = route.params;
  const [words, setWords] = useState<DeckWord[] | null>(null);
  const [word, setWord] = useState('');
  const [translation, setTranslation] = useState('');
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setWords(await apiListDeckWords(deckId));
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "So'zlarni yuklab bo'lmadi"));
      setWords([]);
    }
  }, [deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd() {
    if (!word.trim() || !translation.trim() || saving) return;
    setSaving(true);
    try {
      await apiAddDeckWord(deckId, { word: word.trim(), translation: translation.trim() });
      setWord('');
      setTranslation('');
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "So'z qo'shib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkImport(text: string) {
    setImporting(true);
    try {
      const result = await apiBulkImportDeckWords(deckId, text);
      Alert.alert('Import yakunlandi', `${result.added} ta qo'shildi, ${result.skipped} ta o'tkazib yuborildi`);
      setImportOpen(false);
      void load();
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Import qilib bo'lmadi"));
    } finally {
      setImporting(false);
    }
  }

  function confirmDeleteWord(item: DeckWord) {
    Alert.alert("So'zni o'chirish", undefined, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteDeckWord(deckId, item.id);
            void load();
          } catch (error) {
            Alert.alert('Xatolik', getApiErrorMessage(error, "So'zni o'chirib bo'lmadi"));
          }
        },
      },
    ]);
  }

  const deck = { slug: undefined as string | undefined }; // slug isn't in DeckWord list response; see Step 3 note

  if (words === null) return <Loading />;

  return (
    <Screen>
      <View className="flex-row items-center justify-between p-4 pb-0">
        <Pressable onPress={() => setImportOpen(true)} className="flex-row items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 dark:bg-dark-canvas">
          <Upload size={14} color="#475569" />
          <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">Ommaviy import</Text>
        </Pressable>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => navigation.navigate('DeckPractice', { slug: route.params.deckId, deckName })}
            className="flex-row items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2"
          >
            <Zap size={14} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Mashq qilish</Text>
          </Pressable>
        </View>
      </View>

      <View className="m-4 flex-row gap-2 rounded-2xl bg-white p-3 dark:bg-dark-surface">
        <TextInput
          value={word}
          onChangeText={setWord}
          placeholder="So'z"
          placeholderTextColor="#94a3b8"
          className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
        />
        <TextInput
          value={translation}
          onChangeText={setTranslation}
          placeholder="Tarjima"
          placeholderTextColor="#94a3b8"
          className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
        />
        <Pressable
          disabled={!word.trim() || !translation.trim() || saving}
          onPress={() => void handleAdd()}
          className="items-center justify-center rounded-xl bg-gray-900 px-4 disabled:opacity-40 dark:bg-white"
        >
          <Text className="text-xs font-bold text-white dark:text-gray-900">Qo'shish</Text>
        </Pressable>
      </View>

      {words.length === 0 ? (
        <Empty text="Hali so'z yo'q" />
      ) : (
        <FlatList
          data={words}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 px-4 pb-4"
          renderItem={({ item }) => (
            <View className="flex-row items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5 dark:bg-dark-canvas">
              <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-ink dark:text-dark-ink">{item.word}</Text>
              <Text numberOfLines={1} className="flex-1 text-sm text-gray-500 dark:text-gray-400">{item.translation}</Text>
              <Pressable onPress={() => confirmDeleteWord(item)} className="h-7 w-7 items-center justify-center">
                <Trash2 size={15} color="#ef4444" />
              </Pressable>
            </View>
          )}
        />
      )}

      <BulkImportWordsSheet visible={importOpen} onClose={() => setImportOpen(false)} onSubmit={(text) => void handleBulkImport(text)} submitting={importing} />
    </Screen>
  );
}
```

- [ ] **Step 3: Resolve the deck-slug gap before finalizing the share/practice buttons**

`apiListDeckWords`/`WordDeck` route params carry `deckId`, not `slug` — but sharing and "Mashq qilish" both need the `slug` (`/d/:slug`). Two options: (a) have `apiFetchWordDecks()` results (already fetched in `MyDictionariesScreen`) pass `slug` forward via an additional route param (`WordDeck: {deckId, deckName, slug}` — requires a small `types.ts` edit), or (b) call `apiFetchWordDecks()` again inside `WordDeckScreen` and find the matching deck by id to read its `slug`. Prefer **(a)** — it avoids a redundant fetch and is a two-line change (add `slug: string` to the `WordDeck` route param type in Task 1's `types.ts`, and pass it from `MyDictionariesScreen`'s `navigation.navigate('WordDeck', {deckId: item.id, deckName: item.name, slug: item.slug})`). Apply this fix now:

- Amend `apps/mobile/src/navigation/types.ts`: `WordDeck: {deckId: string; deckName: string; slug: string};`
- Amend `MyDictionariesScreen.tsx`'s `navigation.navigate('WordDeck', ...)` call to include `slug: item.slug`.
- Amend `WordDeckScreen.tsx` to destructure `slug` from `route.params` and use it directly for `shareLink`/`navigation.navigate('DeckPractice', {slug, deckName})`, removing the placeholder `const deck = {...}` line and the incorrect `deckId` passed as `slug` in Step 2's `DeckPractice` navigation call above.

Add the share button using the resolved `slug`:

```tsx
          <Pressable
            onPress={async () => { await Share.share({ message: `${WEB_URL}/d/${slug}` }); }}
            className="flex-row items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 dark:bg-dark-canvas"
          >
            <Link2 size={14} color="#475569" />
            <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">Ulashish</Text>
          </Pressable>
```

- [ ] **Step 4: Register the screen in `RootNavigator.tsx`**

```tsx
import { WordDeckScreen } from '../screens/WordDeckScreen';
```

```tsx
          <Stack.Screen
            name="WordDeck"
            component={WordDeckScreen}
            options={({ route }) => ({ title: route.params.deckName })}
          />
```

- [ ] **Step 5: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 7: Manually verify in the simulator**

Create a deck, add words one-by-one and via bulk import, confirm both appear in the list, tap "Ulashish" and confirm the share sheet opens with a `jamm.uz/d/:slug`-shaped message.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/screens/WordDeckScreen.tsx apps/mobile/src/components/BulkImportWordsSheet.tsx apps/mobile/src/navigation/types.ts apps/mobile/src/screens/MyDictionariesScreen.tsx apps/mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): implement WordDeckScreen with bulk import and share"
```

---

### Task 11: Build `DeckPracticeScreen` (flashcard/test, no persisted progress)

**Files:**
- Create: `apps/mobile/src/screens/DeckPracticeScreen.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`
- Test: `apps/mobile/__tests__/deckPracticeDistractors.test.ts`

**Interfaces:**
- Consumes: `apiGetDeckBySlug`, `DeckView` from Task 9.
- Produces: `DeckPracticeScreen` registered at `DeckPractice`; a pure `pickDistractors(pool: string[], answer: string, seedKey: string): string[]` function extracted from the Test component's `options` `useMemo` (the deterministic-sort distractor logic from `ChallengeWordPracticeScreen.tsx`), tested in isolation since it's the one piece of meaningfully complex logic in this otherwise-adapted screen.

- [ ] **Step 1: Write the failing test for the distractor-picking logic**

```ts
// apps/mobile/__tests__/deckPracticeDistractors.test.ts
import { pickDistractors } from '../src/screens/DeckPracticeScreen';

describe('pickDistractors', () => {
  it('excludes the answer itself and dedupes the pool', () => {
    const result = pickDistractors(['olma', 'olma', 'nok', 'uzum'], 'olma', 'q1');
    expect(result).not.toContain('olma');
    expect(new Set(result).size).toBe(result.length);
  });

  it('returns at most 3 distractors', () => {
    const result = pickDistractors(['a', 'b', 'c', 'd', 'e'], 'z', 'q1');
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('is deterministic for the same seed key', () => {
    const pool = ['a', 'b', 'c', 'd'];
    expect(pickDistractors(pool, 'z', 'q1')).toEqual(pickDistractors(pool, 'z', 'q1'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest deckPracticeDistractors.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write `DeckPracticeScreen.tsx`**

Adapted directly from `ChallengeWordPracticeScreen.tsx` (Task 6's research pass has the full source). Structural changes from the original: (1) data comes from `apiGetDeckBySlug(route.params.slug)` instead of `apiListMyChallengeWords`, seeding local `known: false` on every word; (2) `commit()`/`checkAnswer()` never call any progress-persisting API — they only call the local `setWords`/`setDeck`/`setResults` state setters, with the `apiSetChallengeWordProgress` call and its catch-block rollback logic deleted entirely; (3) the header text "✦ So'z yodlash" becomes the deck's name; (4) `resetDeck()` is synchronous (no `Promise.all`, no `Alert.alert` confirmation needed since there's no network risk — a plain immediate reset is fine, but keeping the same confirm-dialog UX is also acceptable if preferred for consistency; this task uses the simpler synchronous reset since there is nothing to lose).

```tsx
// apps/mobile/src/screens/DeckPracticeScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, Layers3, ListChecks, RotateCcw, Trophy, X } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiGetDeckBySlug } from '../api/word-decks';
import { Loading, Screen } from '../components/Ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DeckPractice'>;
type Mode = 'flashcard' | 'test';
type Direction = 'wordToTranslation' | 'translationToWord';
type PracticeWord = { id: string; word: string; translation: string; known: boolean };

export function pickDistractors(pool: string[], answer: string, seedKey: string): string[] {
  const deduped = pool.filter((v, i, all) => v !== answer && all.indexOf(v) === i);
  const sorted = [...deduped].sort((a, b) => `${seedKey}:${a}`.localeCompare(`${seedKey}:${b}`));
  return sorted.slice(0, 3);
}

export function DeckPracticeScreen({ route }: Props) {
  const { slug, deckName: paramDeckName } = route.params;
  const [deckName, setDeckName] = useState(paramDeckName ?? '');
  const [words, setWords] = useState<PracticeWord[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [direction, setDirection] = useState<Direction>('wordToTranslation');

  useEffect(() => {
    void apiGetDeckBySlug(slug)
      .then((deck) => {
        setDeckName(deck.name);
        setWords(deck.words.map((w) => ({ ...w, known: false })));
      })
      .catch(() => Alert.alert('Xatolik', "Lug'atni yuklab bo'lmadi"));
  }, [slug]);

  if (!words) return <Loading />;

  if (!mode)
    return (
      <Screen>
        <View className="flex-1 gap-6 p-5">
          <Text className="text-2xl font-black text-ink dark:text-dark-ink">{deckName}</Text>
          <View>
            <Text className="mb-2 text-xs font-bold uppercase text-gray-400">Yo'nalish</Text>
            <View className="h-[42px] w-full flex-row rounded-2xl bg-gray-200 p-[3px] dark:bg-dark-surface">
              <DirectionButton active={direction === 'wordToTranslation'} label="So'z" onPress={() => setDirection('wordToTranslation')} />
              <DirectionButton active={direction === 'translationToWord'} label="Tarjima" onPress={() => setDirection('translationToWord')} />
            </View>
          </View>
          <View>
            <Text className="mb-2 text-xs font-bold uppercase text-gray-400">Rejim</Text>
            <View className="flex-row gap-3">
              <SelectCard selected={mode === 'flashcard'} title="Flashcard" icon={<Layers3 size={20} color={mode === 'flashcard' ? '#ffffff' : '#4f46e5'} />} onPress={() => setMode('flashcard')} />
              <SelectCard selected={mode === 'test'} title="Test" icon={<ListChecks size={20} color={mode === 'test' ? '#ffffff' : '#4f46e5'} />} onPress={() => setMode('test')} />
            </View>
          </View>
        </View>
      </Screen>
    );

  return mode === 'flashcard' ? (
    <Flashcards words={words} direction={direction} setWords={setWords} deckName={deckName} />
  ) : (
    <Test words={words} direction={direction} setWords={setWords} />
  );
}

function SelectCard({ selected, title, icon, onPress }: { selected: boolean; title: string; icon?: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`flex-1 flex-row items-center gap-3 rounded-2xl p-4 ${selected ? 'bg-indigo-600' : 'bg-white dark:bg-dark-surface'}`}>
      {icon}
      <Text className={`font-bold ${selected ? 'text-white' : 'text-ink dark:text-dark-ink'}`}>{title}</Text>
    </Pressable>
  );
}

function DirectionButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`flex-1 items-center justify-center rounded-xl ${active ? 'bg-indigo-600' : ''}`}>
      <Text className={`text-[11px] font-bold ${active ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`}>{label}</Text>
    </Pressable>
  );
}

function Flashcards({ words, direction, setWords, deckName }: { words: PracticeWord[]; direction: Direction; setWords: (w: PracticeWord[]) => void; deckName: string }) {
  const [deck, setDeck] = useState(() => words.filter((w) => !w.known));
  const [revealed, setRevealed] = useState(false);
  const [exiting, setExiting] = useState<'again' | 'known' | null>(null);
  const [dragX, setDragX] = useState(0);
  const animatedDragX = useRef(new Animated.Value(0)).current;
  const currentRef = useRef(deck[0]);
  const wordsRef = useRef(words);

  useEffect(() => { currentRef.current = deck[0]; }, [deck]);
  useEffect(() => { wordsRef.current = words; }, [words]);

  const commit = useCallback((known: boolean) => {
    const swiped = currentRef.current;
    if (!swiped || exiting) return;
    setExiting(known ? 'known' : 'again');
    setWords(wordsRef.current.map((w) => (w.id === swiped.id ? { ...w, known } : w)));
    setTimeout(() => {
      setDeck((oldDeck) => {
        const rest = oldDeck.filter((w) => w.id !== swiped.id);
        return known ? rest : [...rest, { ...swiped, known: false }];
      });
      setDragX(0);
      setRevealed(false);
      setExiting(null);
      animatedDragX.setValue(0);
    }, 320);
  }, [exiting, animatedDragX, setWords]);

  useEffect(() => {
    if (exiting === 'known') {
      Animated.timing(animatedDragX, { toValue: 560, duration: 320, useNativeDriver: false }).start();
    } else if (!exiting) {
      animatedDragX.setValue(dragX);
    }
  }, [exiting, dragX, animatedDragX]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => !exiting && Math.abs(gesture.dx) > 5,
        onPanResponderMove: (_, gesture) => { if (!exiting) setDragX(gesture.dx); },
        onPanResponderRelease: (_, gesture) => {
          if (exiting) return;
          if (Math.abs(gesture.dx) < 35) setDragX(0);
          else commit(gesture.dx > 0);
        },
      }),
    [commit, exiting],
  );

  function resetDeck() {
    const resetWords = words.map((w) => ({ ...w, known: false }));
    setWords(resetWords);
    setDeck(resetWords);
    setRevealed(false);
    setDragX(0);
    setExiting(null);
  }

  const current = deck[0];
  if (!current)
    return (
      <Screen>
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-3xl font-black text-ink dark:text-dark-ink">🎉 Tugadi!</Text>
          <Text className="mt-2 text-sm font-semibold text-gray-400">Barcha so'zlar takrorlandi</Text>
          <Pressable onPress={resetDeck} className="mt-6 flex-row items-center gap-2 rounded-full bg-indigo-600 px-6 py-3.5">
            <RotateCcw size={18} color="#ffffff" />
            <Text className="font-bold text-white">Qayta boshlash</Text>
          </Pressable>
        </View>
      </Screen>
    );

  const rotate = animatedDragX.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-14deg', '0deg', '14deg'] });

  return (
    <Screen>
      <View className="flex-1 items-center px-4 pt-6">
        <Text className="text-[20px] font-extrabold tracking-[2px] text-ink dark:text-dark-ink">✦ {deckName}</Text>
        <Text className="mt-1 text-[11px] font-semibold text-gray-400">CHAPGA - TAKRORLASH · O'NGGA - BILAMAN</Text>
        <View className="mb-6 mt-4 w-[250px] flex-row justify-between">
          <Stat label="TAKRORLASH" value={words.length} color="#6366f1" />
          <Stat label="QOLGAN" value={deck.length} color="#6366f1" />
          <Stat label="BILAMAN" value={words.filter((w) => w.known).length} color="#10b981" />
        </View>
        <View className="relative h-[340px] w-[280px]">
          {deck.slice(1, 6).reverse().map((w, reverseIndex, stack) => {
            const depth = stack.length - reverseIndex;
            const uid = words.findIndex((item) => item.id === w.id);
            const seed = (uid * 137 + depth * 53) % 20;
            const opacity = depth <= 1 ? 1 : Math.max(1 - (depth - 1) * 0.16, 0.15);
            return (
              <View
                key={`stack-${w.id}-${depth}`}
                className="absolute inset-0 rounded-3xl border-2 border-gray-200 bg-white dark:border-zinc-700 dark:bg-dark-surface"
                style={{ transform: [{ translateY: -depth * 6 }, { scale: 1 - depth * 0.05 }, { rotate: `${seed - 10}deg` }], opacity, zIndex: 100 - depth }}
              />
            );
          })}
          <Animated.View
            {...responder.panHandlers}
            className="absolute inset-0 items-center justify-center rounded-3xl border-2 border-gray-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-dark-surface"
            style={{ zIndex: 100, transform: [{ translateX: animatedDragX }, { rotate }] }}
          >
            <Pressable onPress={() => !exiting && Math.abs(dragX) < 5 && setRevealed(true)} className="w-full items-center">
              <Text className="text-center text-3xl font-extrabold text-ink dark:text-dark-ink">
                {direction === 'wordToTranslation' ? current.word : current.translation}
              </Text>
              {revealed ? (
                <Text className="mt-4 text-center text-lg font-semibold text-gray-700 dark:text-zinc-200">
                  {direction === 'wordToTranslation' ? current.translation : current.word}
                </Text>
              ) : (
                <Text className="mt-4 text-[10px] font-bold tracking-[1px] text-gray-400">JAVOBNI KO'RSATISH</Text>
              )}
            </Pressable>
          </Animated.View>
        </View>
        <Pressable onPress={resetDeck} className="mt-6 flex-row items-center gap-2 rounded-full bg-white px-5 py-3 border border-gray-200 dark:bg-dark-surface dark:border-zinc-700">
          <RotateCcw size={16} color="#6366f1" />
          <Text className="font-bold text-gray-700 dark:text-dark-ink">Yangilash</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="items-center">
      <Text style={{ color }} className="text-2xl font-extrabold">{value}</Text>
      <Text className="text-[10px] font-bold tracking-[1px] text-gray-400">{label}</Text>
    </View>
  );
}

function Test({ words, direction, setWords }: { words: PracticeWord[]; direction: Direction; setWords: (w: PracticeWord[]) => void }) {
  const [queue] = useState(() => [...words].sort((a, b) => a.id.localeCompare(b.id)));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const current = queue[index];

  const options = useMemo(() => {
    if (!current) return [];
    const answer = direction === 'wordToTranslation' ? current.translation : current.word;
    const pool = words.filter((w) => w.id !== current.id).map((w) => (direction === 'wordToTranslation' ? w.translation : w.word));
    const distractors = pickDistractors(pool, answer, current.id);
    return [answer, ...distractors].sort((a, b) => `${current.id}:${a}`.localeCompare(`${current.id}:${b}`));
  }, [current, direction, words]);

  function restart() {
    setIndex(0);
    setSelected(null);
    setChecked(false);
    setCorrectCount(0);
    setResults([]);
  }

  if (!current) {
    const percentage = queue.length ? Math.round((correctCount / queue.length) * 100) : 0;
    return (
      <Screen>
        <View className="flex-1 items-center justify-center p-6">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/60">
            <Trophy size={38} color="#6366f1" />
          </View>
          <Text className="mt-5 text-xs font-bold uppercase tracking-wider text-gray-400">TEST YAKUNLANDI</Text>
          <Text className="mt-1 text-3xl font-black text-ink dark:text-dark-ink">Natijangiz</Text>
          <Text className="mt-2 text-5xl font-black text-indigo-600">{percentage}%</Text>
          <Pressable onPress={restart} className="mt-7 flex-row items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3.5">
            <RotateCcw size={17} color="#ffffff" />
            <Text className="font-bold text-white">Qayta ishlash</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const question = direction === 'wordToTranslation' ? current.word : current.translation;
  const answer = direction === 'wordToTranslation' ? current.translation : current.word;

  function checkAnswer() {
    if (!selected || checked) return;
    const known = selected === answer;
    if (known) setCorrectCount((c) => c + 1);
    setResults((r) => [...r, known]);
    setChecked(true);
    setWords(words.map((w) => (w.id === current.id ? { ...w, known } : w)));
  }

  function nextQuestion() {
    setSelected(null);
    setChecked(false);
    setIndex((v) => v + 1);
  }

  const optionLabels = ['A', 'B', 'C', 'D'];
  const progress = ((index + 1) / queue.length) * 100;

  return (
    <Screen>
      <ScrollView contentContainerClassName="p-4 gap-4">
        <View className="rounded-3xl bg-white p-4 dark:bg-dark-surface shadow-xs">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs font-bold text-gray-400">Savol {index + 1}/{queue.length}</Text>
            <Text className="text-xs font-bold text-indigo-600">{correctCount} to'g'ri</Text>
          </View>
          <View className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-canvas">
            <View className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} />
          </View>
        </View>

        <View className="rounded-3xl bg-white p-5 dark:bg-dark-surface shadow-xs gap-4">
          <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink leading-snug">{question}</Text>
          <View className="gap-2.5">
            {options.map((option, optionIndex) => {
              const correct = option === answer;
              const chosen = option === selected;
              let btnBg = 'bg-white dark:bg-dark-canvas border-gray-200 dark:border-zinc-700';
              let textColor = 'text-ink dark:text-dark-ink';
              if (checked) {
                if (correct) { btnBg = 'bg-emerald-500 border-emerald-500'; textColor = 'text-white font-bold'; }
                else if (chosen) { btnBg = 'bg-rose-500 border-rose-500'; textColor = 'text-white font-bold'; }
              } else if (chosen) {
                btnBg = 'bg-indigo-600 border-indigo-600'; textColor = 'text-white font-bold';
              }
              return (
                <Pressable key={`${option}-${optionIndex}`} disabled={checked} onPress={() => setSelected(option)} className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 ${btnBg}`}>
                  <Text className="w-7 text-xs font-bold text-gray-500">{optionLabels[optionIndex]}</Text>
                  <Text className={`flex-1 text-sm font-semibold ${textColor}`}>{option}</Text>
                  {checked && correct && <Check size={18} color="#ffffff" />}
                  {checked && chosen && !correct && <X size={18} color="#ffffff" />}
                </Pressable>
              );
            })}
          </View>
          {checked ? (
            <Pressable onPress={nextQuestion} className="items-center justify-center rounded-2xl bg-indigo-600 py-3.5">
              <Text className="font-bold text-white text-sm">{index < queue.length - 1 ? 'Keyingi savol' : "Natijani ko'rish"}</Text>
            </Pressable>
          ) : (
            <Pressable disabled={!selected} onPress={checkAnswer} className={`items-center justify-center rounded-2xl py-3.5 ${selected ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-zinc-800'}`}>
              <Text className={`font-bold text-sm ${selected ? 'text-white' : 'text-gray-400'}`}>Tekshirish</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest deckPracticeDistractors.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Register the screen in `RootNavigator.tsx`**

```tsx
import { DeckPracticeScreen } from '../screens/DeckPracticeScreen';
```

```tsx
          <Stack.Screen
            name="DeckPractice"
            component={DeckPracticeScreen}
            options={({ route }) => ({ title: route.params.deckName ?? "Lug'at", gestureEnabled: false })}
          />
```

- [ ] **Step 6: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS

- [ ] **Step 8: Manually verify the full share-and-practice flow**

From `WordDeckScreen`, tap "Mashq qilish", confirm mode/direction picker → flashcard swipe works (drag left/right) → test mode shows 4 options and a results screen. Then close and reopen the deck link via `jamm://d/<slug>` (or use the OS share sheet's copy-link then paste into a notes app and tap it) to confirm the deep-link path (Task 1) lands directly on this screen without going through `WordDeckScreen` first, and confirm reloading resets all progress to zero (nothing persisted).

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/screens/DeckPracticeScreen.tsx apps/mobile/src/navigation/RootNavigator.tsx apps/mobile/__tests__/deckPracticeDistractors.test.ts
git commit -m "feat(mobile): implement DeckPracticeScreen with session-only progress"
```

---

## Part D: Final verification

### Task 12: Full regression pass

**Files:** none created or modified — verification only.

- [ ] **Step 1: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS, including all new suites from Tasks 1, 3, 6, 7, 8, 9, 11.

- [ ] **Step 2: Type-check the whole mobile app**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 3: Manually re-walk both golden paths on a real device or simulator (iOS and Android if both are available)**

"Mening testlarim": Jamm → "Mening testlarim" → create folder → create test → add at least 3 different question types (e.g. `single`, `truefalse`, `matching`) → share link → open the link on a second logged-in account (or via `jamm://t/:slug` deep link) → confirm it opens `TestTakerScreen` natively (no WebView flash) → submit → submit again (confirm allowed) → confirm no results/statistics screen is reachable for this test from either account.

"Mening lug'atlarim": Jamm → "Mening lug'atlarim" → create deck → add words (one-by-one + bulk import) → share link → open the link on a second account via `jamm://d/:slug` → confirm it opens `DeckPracticeScreen` natively → practice in both Flashcard and Test modes → close and reopen → confirm progress reset to zero.

- [ ] **Step 4: Confirm the deep-link fix (Task 1) doesn't break any existing flow that relied on `/t/:slug` falling through to `WebScreen`**

Search for any place that might have depended on the old WebView behavior for test links (e.g. a support flow, an old bookmark format) — grep `WebScreen`/`'/t/'` usages once more across `apps/mobile/src` to confirm nothing else assumed test links go through the web fallback.

Run: `grep -rn "'/t/" apps/mobile/src/`

Expected: only the new `linking.ts` branch from Task 1 matches; no other code assumed `/t/` falls through to `Web`.

- [ ] **Step 5: Confirm teacher-only mobile flows are unaffected**

If the mobile app has any teacher-role screens reachable (check `RootStackParamList`/`TabParamList` for any teacher-gated route), spot-check that none of them were touched by this plan — this plan only added new files and edited `ChallengesScreen.tsx`, `RootNavigator.tsx`, `navigation/types.ts`, `navigation/linking.ts`, none of which are teacher-specific.

- [ ] **Step 6: Commit (if any fixups were needed during verification)**

```bash
git add -A
git commit -m "fix(mobile): address issues found during full regression verification"
```

(Skip this commit entirely if verification found no issues.)
