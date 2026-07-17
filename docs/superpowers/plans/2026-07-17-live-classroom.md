# Live Classroom (Jonli dars) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guruhga bog'langan jonli dars: PDF sahifalari rasm sifatida sinxron ko'rsatiladi, ustoz chizadi, LiveKit orqali ovoz, davomat avtomatik.

**Architecture:** Uch kanal — LiveKit SFU (ovoz), Socket.IO `/classroom` namespace (sahifa/stroke/presence sync, `live` moduli patterni), REST+S3 (sessiya lifecycle, PDF→rasm konvertatsiya, davomat). Holat in-memory (`Map`), davomat Postgres'da.

**Tech Stack:** NestJS 11, Drizzle/Postgres, Socket.IO 4, `livekit-server-sdk`, `mupdf` (WASM), `sharp`; React 19, Zustand, `livekit-client`, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-07-17-live-classroom-design.md`

## Global Constraints

- Har xabarda JWT verify — `live.gateway.ts` uslubi (`{sessionId, token}` payload).
- Stroke koordinatalari normalizatsiyalangan (0..1), flat `number[]`.
- PDF: max 25MB, max 60 sahifa, render kengligi 1600px, WebP q80.
- LiveKit env (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) ixtiyoriy — yo'q bo'lsa voice-token 503, dars ovozsiz ishlaydi.
- Kech qolish chegarasi: dars boshlanganidan 10 daqiqa (`LATE_AFTER_MS`).
- Host grace period: 90s (`HOST_GRACE_MS`).
- Bitta guruhda bitta aktiv sessiya.
- UI matnlari o'zbekcha (mavjud sahifalar uslubida).

---

### Task 1: Backend deps + env

**Files:** Modify `apps/backend/package.json` (npm i `livekit-server-sdk mupdf sharp`), `apps/backend/src/validate-env.ts` (LiveKit varlar to'liq yoki umuman yo'q bo'lishi kerak — qismi bo'lsa warning).

- [ ] `npm i livekit-server-sdk mupdf sharp -w backend`
- [ ] validate-env: LiveKit uchqun tekshiruvi (partial config → console.warn, ishga tushishni to'xtatmaydi)

### Task 2: DB schema + migratsiya

**Files:** Modify `apps/backend/src/db/schema.ts`; generate `apps/backend/drizzle/migrations/*`.

**Produces:** `classSessions`, `attendanceRecords` jadvallari (spec'dagi ustunlar bilan), relations.

- [ ] Schema qo'shish (classSessions: groupId, teacherId, status, pdfName, pdfPages jsonb, startedAt, endedAt; attendanceRecords: sessionId, enrollmentId, firstJoinedAt, lastLeftAt, totalSeconds, status, overriddenByAdminId; unique(sessionId, enrollmentId))
- [ ] `npm run db:generate` — migratsiya fayli
- [ ] Commit

### Task 3: classroom.types.ts + classroom.logic.ts (TDD)

**Files:** Create `apps/backend/src/classroom/classroom.types.ts`, `classroom.logic.ts`, `classroom.logic.spec.ts`.

**Produces (logic — sof funksiyalar):**
- `addStroke(session, page, stroke)` — validatsiya (points juftligi, 0..1 oralig'i, max points), sahifa mavjudligi
- `undoStroke(session, page): string | null` — oxirgi stroke id
- `clearPage(session, page)`
- `setPage(session, page): boolean` — chegara tekshiruvi
- `attendanceStatusOnJoin(startedAt, now): 'present' | 'late'`
- `closeInterval(participant, now): number` — qo'shilgan soniyalar
- `buildSnapshot(session): ClassroomSnapshot`

**Types:** `ClassroomStroke {id, tool:'pen'|'highlighter', color, width, points:number[]}`, `ClassroomParticipant {userId, name, socketId|null, enrollmentId, joinedAtMs|null, totalSeconds, status}`, `ClassroomSession {id, groupId, hostUserId, hostSocketId|null, pdfName|null, pdfPages:string[], currentPage, strokesByPage:Map<number,ClassroomStroke[]>, participants:Map<string,ClassroomParticipant>, startedAtMs, hostDisconnectTimer}`

- [ ] Failing testlar (stroke validatsiya, undo/clear, setPage chegara, late/present, interval hisobi, snapshot)
- [ ] Minimal implementatsiya, testlar yashil
- [ ] Commit

### Task 4: PDF→rasm konvertatsiya

**Files:** Create `apps/backend/src/classroom/pdf-converter.ts`.

**Produces:** `convertPdfToPageImages(buffer): Promise<Buffer[]>` — mupdf bilan har sahifani 1600px kenglikda render, sharp bilan WebP q80. 60 sahifadan ko'p bo'lsa `PDF_TOO_MANY_PAGES` xato.

- [ ] Implementatsiya + smoke test (minimal 1-sahifali PDF fixture bilan spec)
- [ ] Commit

### Task 5: classroom.service.ts (+ spec)

**Files:** Create `apps/backend/src/classroom/classroom.service.ts`, `classroom.service.spec.ts`.

**Produces:**
- `createSession(groupId, teacherId)` — egalik (courses.adminId), aktiv dublikat 409, absent davomat rowlar
- `attachPdf(sessionId, teacherId, file)` — konvertatsiya, S3 (`classroom/{sessionId}/page-N.webp`), DB update, `pdf:set` broadcast
- `hostJoin/studentJoin(sessionId, user, socketId)` — snapshot; student: enrollment tekshiruv + davomat (firstJoinedAt, present/late), presence broadcast
- `setPage/stroke/undo/clearPage/pointer` — host tekshiruvi + broadcast
- `handleDisconnect(socketId)` — student interval flush → DB; host → grace timer
- `endSession(sessionId, byUserId)` — flush all, DB ended, `session:ended`
- `listActiveForTeacher/Student`, `getSessionWithAttendance`, `groupHistory`, `overrideAttendance`
- `voiceToken(sessionId, user)` — LiveKit AccessToken yoki `VOICE_DISABLED`
- `muteParticipant(sessionId, teacherId, userId)` — RoomServiceClient
- `onModuleInit` — stale active sessiyalarni ended qilish
- `setBroadcaster(b: LiveBroadcaster-uslub)` — room = `cs:{sessionId}`

- [ ] Spec testlar (live.service.spec uslubida — db mock/fake broadcaster): create/join/davomat/disconnect/end oqimlari
- [ ] Implementatsiya, testlar yashil
- [ ] Commit

### Task 6: gateway + controller + module

**Files:** Create `apps/backend/src/classroom/classroom.gateway.ts`, `classroom.controller.ts`, `classroom.module.ts`; Modify `apps/backend/src/app.module.ts`.

**Gateway eventlari (client→server):** `host:join`, `student:join`, `host:setPage`, `host:stroke`, `host:undo`, `host:clearPage`, `host:pointer`, `host:end` — hammasi `{sessionId, token, ...}` + verify, `run()` wrapper.

**Controller (spec bo'yicha):** POST `/classroom/sessions`, POST `/classroom/sessions/:id/pdf` (FileInterceptor, 25MB, .pdf), POST `/classroom/sessions/:id/end`, GET `/classroom/sessions/active`, GET `/classroom/sessions/:id`, GET `/classroom/groups/:groupId/history`, PATCH `/classroom/attendance/:recordId`, POST `/classroom/sessions/:id/voice-token`, POST `/classroom/sessions/:id/participants/:userId/mute`.

- [ ] Gateway + controller + module, app.module'ga ulash
- [ ] `nest build` yashil
- [ ] Commit

### Task 7: Frontend API qatlami

**Files:** Create `apps/frontend/src/api/classroom.ts`, `apps/frontend/src/api/classroomSocket.ts`.

**Produces:** REST wrapperlar (`apiCreateClassSession`, `apiUploadClassPdf`, `apiActiveClassSessions`, `apiClassSession`, `apiClassHistory`, `apiOverrideAttendance`, `apiVoiceToken`, `apiMuteParticipant`, `apiEndClassSession`) + `getClassroomSocket()/closeClassroomSocket()` (`api/live.ts` uslubi) + WS payload tiplari (`CsSnapshot`, `CsStroke`, ...).

- [ ] Yozish, `tsc` yashil
- [ ] Commit

### Task 8: PDF viewer + chizish overlay

**Files:** Create `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`, `ClassroomToolbar.tsx`.

**Produces:** `<ClassroomPdfViewer pageUrl strokes pointer editable tool color onStrokeComplete onPointerMove />` — `<img>` + overlay canvas, normalizatsiya/denormalizatsiya, resize'da qayta chizish, pointer events bilan chizish (50ms batch), lazer-pointer nuqtasi. Toolbar: qalam 3 rang, marker, lazer, undo, clear, sahifa nav, PDF yuklash tugmasi.

- [ ] Komponentlar, `tsc` yashil
- [ ] Commit

### Task 9: Host va Student sahifalar + routelar

**Files:** Create `apps/frontend/src/pages/ClassroomHostPage.tsx`, `ClassroomStudentPage.tsx`; Modify `apps/frontend/src/App.tsx` (routes `/classroom/host/:id` TeacherRoute, `/classroom/:id` PrivateRoute), `apps/frontend/src/components/course/CourseGroupsPage.tsx` ("Jonli dars" tugmasi → create/navigate).

- [ ] Host sahifa: socket join, PDF yuklash (bo'lmasa dropzone), viewer+toolbar, participants panel, end tugmasi
- [ ] Student sahifa: view-only viewer, host sahifasiga ergashish, hostOnline banner, session:ended → chiqish
- [ ] Routelar + guruh sahifasidan kirish
- [ ] Commit

### Task 10: Ovoz (livekit-client)

**Files:** Create `apps/frontend/src/hooks/useClassroomVoice.ts`; Modify participants panel (speaking indikator, mute tugmalari), `apps/frontend/package.json` (`livekit-client`).

**Produces:** `useClassroomVoice(sessionId, enabled)` → `{connected, micEnabled, toggleMic, speakingUserIds, voiceAvailable}`. Student boshida mute; 503 → `voiceAvailable=false`.

- [ ] Hook + panel integratsiyasi, `tsc` yashil
- [ ] Commit

### Task 11: Davomat UI + student banner

**Files:** Modify `apps/frontend/src/components/student/StudentShell.tsx` (mount + 60s poll `apiActiveClassSessions` → banner), `apps/frontend/src/components/course/CourseGroupsPage.tsx` (darslar tarixi ro'yxati + davomat modal, status override).

- [ ] Banner + tarix/davomat UI
- [ ] Commit

### Task 12: Deploy + verifikatsiya

**Files:** Modify `docker-compose.yml` (livekit service), `DEPLOY.md` (env + portlar).

- [ ] livekit service (7880-7881/TCP, 50000-60000/UDP), DEPLOY eslatma
- [ ] `npm test -w backend` yashil, `nest build` yashil, frontend `npm run build` yashil
- [ ] Yakuniy commit
