# Mobile ilova (`apps/mobile`) — to'liq tahlil va fix rejasi

Sana: 2026-08-21
Qamrov: `apps/mobile` (React Native 0.86, 129 ta src fayl, ~23 000 satr) — infratuzilma, auth,
API qatlami, video/offline tizim, socketlar, asosiy ekranlar, konfiguratsiyalar, testlar.
Jonli dars (classroom) moduli alohida tahlil qilingan — [CLASSROOM_REALTIME_REPORT.md](CLASSROOM_REALTIME_REPORT.md)
(ushbu hisobotda faqat havola beriladi, takrorlanmaydi).
Format: har bir topilma uchun **Sabab → Natija → Qanday fix qilinadi**.
Holat: 19 test suite / 120 test — hammasi o'tadi (`npx jest` 3.7s).

---

## 0. Executive Summary

| Soha | Baho | Asosiy xulosa |
|---|---|---|
| Arxitektura | **A** | Toza qatlamlar (api/store/lib/screens), zustand + nativewind, kichik fokusli fayllar |
| Xavfsizlik | **B−** | JWT AsyncStorage'da (Keychain emas); WebView token-in'ektsiya oqimi ochiq |
| Ishonchlilik | **C+** | Offline video'da cheksiz effect loop (B1); iOS'da download "ishlaydigan" ko'rinishda, lekin ochilmaydi (B2) |
| Performance | **B** | AES-decrypt JS thread'da; rasm keshi 2 marta yuklaydi; qolganlari yaxshi sozlangan |
| Parity (web vs mobile) | **B** | iOS deep link, landscape fullscreen, push bildirishnomalar yo'q |
| Testlar | **B+** | 120 test, barqaror; lekin UI/integration qoplami yupqa (faqat logika testlari) |

Eng og'riqli 3 ta masala: **B1** (offline video cheksiz qayta yuklanadi), **A1+A2** (token xavfsizligi),
**B2** (iOS'da yolg'on "Yuklangan" belgisi).

```
App.tsx ──► Providers: Network(30s HEAD ping) + LiveNotifications(socket) + AppUpdatePrompt
   │
   ├─ axios (lib/api.ts) ──────────► jamm.uz/api/v1  (15s timeout, 401→logout, retry YO'Q)
   ├─ socket.io ×2 (bir xil namespace'ga!): liveNotifications + practiceMessenger
   ├─ LiveKit (classroom) — alohida reportda
   │
   ├─ Video: LazyVideoPlayer (poster-tap) → HlsVideoPlayer (1168 satr)
   │     ├─ online: apiStartVideoPlayback → HLS + Bearer header
   │     └─ offline: offlineVideoService — HLS segmentlab yuklab, AES-128 JS'da decrypt
   ├─ Kesh: imageCache (CacheDir) + CachedImage · storage.ts (AsyncStorage + cachedFirst)
   └─ WebScreen: WebView + token localStorage'ga in'ektsiya
```

---

## 1. XAVFSIZLIK

### A1. [P1] JWT va user obyekti AsyncStorage'da — Keychain/Keystore emas

- **Sabab:** [authStore.ts:58](apps/mobile/src/store/authStore.ts#L58) `storage.set('session', {token, user})`
  → [storage.ts](apps/mobile/src/lib/storage.ts) oddiy `AsyncStorage` (Android: sqllite fayl, iOS: plist).
  Yumshatuvchi: `android:allowBackup="false"` (backup orqali oqmaydi), NSAppTransport qulflangan.
- **Natija:** root/qilingan yoki jiddiy xavfsizlik buzilishida token o'qiladi. Backend JWT muddati
  **365 kun** ([ANALYSIS_REPORT.md](ANALYSIS_REPORT.md) B1) — olingan token bir yil davomida
  to'liq hisob nazorati beradi. Mobil qurilma yo'qolsa ham token "yashab" qoladi.
- **Fix:** `react-native-keychain` (yoki `expo-secure-store`) — token faqat Keychain/Keystore'da;
  `user` obyekti (sezgirsiz) AsyncStorage'da qolishi mumkin. Logout'da `resetGenericPassword`.
  (Backend refresh-token modeli — [2026-08-18-refresh-token-auth.md](docs/superpowers/plans/2026-08-18-refresh-token-auth.md)
  planida bor — token umrini qisqartirsa bu topilma ham yengillashadi.)

### A2. [P1] WebScreen: token HAR QANDAY origin'ning localStorage'iga yoziladi

- **Sabab:** [WebScreen.tsx:14-16](apps/mobile/src/screens/WebScreen.tsx#L14-L16) —
  `injectedJavaScriptBeforeContentLoaded` WebView ichida **yuklanadigan har bir sahifaga** (qaysi
  domain bo'lishidan qat'i nazar) ishlaydi: `localStorage.setItem('token', ...)`.
  `onShouldStartLoadWithRequest` — yo'q, ya'ni WebView ichida tashqi havolaga o'tish erkin.
- **Natija:** dars/matn ichidagi tashqi havola bosilsa (reklama, o'quv resurs, redirects) — JWT
  o'sha begona saytning localStorage'iga yozib qoldiriladi. Sayt uni o'qib, o'quvchining
  jamm.uz akkauntiga 1 yilga ega bo'ladi. Bu repodagi eng oddiy ekspluatatsiya yo'li.
- **Fix:**
  1. `onShouldStartLoadWithRequest={req => req.url.startsWith(WEB_URL) ? true : (Linking.openURL(req.url), false)}`
  2. In'ektsiyani origin-tekshiruv bilan o'rash: `if (location.origin === 'https://jamm.uz') {...}`.

### A3. [P2] AES-128 kalit ochiq faylda, decrypt esa JS'da — himoya illyuziya

- **Sabab:** [offlineVideoService.ts:423-433](apps/mobile/src/lib/offlineVideoService.ts#L423-L433) — kalit
  `enc.key` sifatida segmentlar yonidagi o'sha papkaga yoziladi va shu yerda qoladi;
  decrypt `aes-js` bilan JS'da ([325-340](apps/mobile/src/lib/offlineVideoService.ts#L325-L340)).
- **Natija:** " DRM" faqat nomiga: har kim papkani ochib kalitni olib, videoni decrypt qila oladi.
  Real himoya yo'q, lekin murakkablik va JS-thread yuki (C1) to'liq.
- **Fix:** yo (a) AESni butunlay olib tashlab, qisqa umrli signed URL'larga tayanish (kontent
  ochiq URL'da yotmaydi — bu video-piratlikka qarshi real choralar bilan birga kelishi kerak),
  yoki (b) kalitni Keychain'da saqlash + decrypt'ni native/JSI'da qilish (C1 fix bilan birga).

### A4. [P3] Production'da `console.log` qolgan

- **Sabab:** 8 ta joy — [HlsVideoPlayer.tsx:282-320](apps/mobile/src/components/HlsVideoPlayer.tsx#L282-L320)
  (API URL, fayl pathlari, xato matnlari), `PdfViewerSheet.tsx`.
- **Natija:** release'da ham log chiqadi (debug qulayligi, kichik info-leak, ish faoliyati).
- **Fix:** `babel-plugin-transform-remove-console` (release uchun) yoki `if (__DEV__)` guard.

### A5. [P3] `secureScreen` (FLAG_SECURE) faqat Android

- **Sabab:** [secureScreen.ts:7-13](apps/mobile/src/lib/secureScreen.ts#L7-L13) — iOS shartlari yo'q.
- **Natija:** Android'da test/videoda screenshot blok, iOS'da erkin (suvbelgisi — watermark qisman qoplaydi).
- **Fix:** iOS 17+ `UIScreen.capturedScreenshotNotification` + blur-on-background; yoki qabul qilinadi (low).

---

## 2. ISHONCHLILIK (real bug'lar)

### B1. [P0] Offline video o'ynatishda CHEKSIZ effect loop — `loadPlayback` o'zini qayta-qayta ishga tushiradi

- **Sabab:** [HlsVideoPlayer.tsx:277-344](apps/mobile/src/components/HlsVideoPlayer.tsx#L277-L344) —
  `loadPlayback = useCallback(..., [blockId, isOfflineMode])`, lekin funksiya **o'zi** boshida
  `setIsOfflineMode(false)`, oxirida (lokal yo'l) `setIsOfflineMode(true)` qiladi.
  `useEffect(() => loadPlayback(), [loadPlayback])` — har `isOfflineMode` almashinishida callback
  identiteti o'zgaradi → effect qayta ishga tushadi → u yana almashtiradi → **abadiy ping-pong**:
  `manifestUrl`: `file://... → null → file://... → null...`
- **Natija:** to'liq yuklab olingan video ochildigi da (yoki online xato → lokal fallback'da):
  `<Video>` har aylanishda unmount/remount, spinner miltillaydi, playback boshlanmaydi yoki
  uzilib-qayta boshlanadi; disk I/O va CPU doim band — batareya tez tugaydi. Android offline
  playback'ning asosiy buzilishi.
- **Fix:** `isOfflineMode`'ni deps'dan olib tashlash (u kirish, chiqish emas): lokal/online tanlovini
  ref yoki lokal o'zgaruvchi bilan boshqarish; state faqat UI ko'rsatkichi sifatida saqlansin:
  ```ts
  const loadPlayback = useCallback(async () => { ... setIsOfflineMode(local); ... }, [blockId]);
  ```
  (Test: yuklangan videoni o'chirib-yoqib, `loadPlayback` chaqiruvlarini sanash — 1 marta bo'lishi kerak.)

### B2. [P0] iOS'da "Yuklab olish" ishlaydi-lekin-ochilmaydi: yolg'on "Yuklangan" belgisi + disk band

- **Sabab:** [offlineVideoService.ts:15-24](apps/mobile/src/lib/offlineVideoService.ts#L15-L24) (o'z
  izohida): AVFoundation lokal `.m3u8` ham, `.ts` ham ochmaydi. Kod baribir iOS'da `merged.ts`
  yig'adi (`USE_MERGED_TS = Platform.OS === 'ios'`), `isOfflineVideoComplete → true`, badge
  "Yuklangan" ([HlsVideoPlayer.tsx:227](apps/mobile/src/components/HlsVideoPlayer.tsx#L227)).
  Player `merged.ts`ni ocholmaydi → `onError` → online fallback ([772-786](apps/mobile/src/components/HlsVideoPlayer.tsx#L772-L786)).
- **Natija:** iPhone foydalanuvchi video yuklab oladi (disk: yuzlab MB–GB), badge muvaffaqiyatli
  ko'rinadi, lekin **har safar internet bilan ochiladi**; offline'da umuman ochilmaydi. Support'ga
  "yukladim lekin internetsiz ko'rmayapman" tarzidagi shikoyat keladi.
- **Fix:** backend fMP4/MP4 offline yo'li tayyor bo'lguncha (reja bor) iOS'da download tugmasini
  yashirish (`Platform.OS === 'android'`) yoki "iOS'da tez orada" toast'i. Hech bo'lmasa
  `onError`'da foydalanuvchiga aniq xato ko'rsatish (hozir jimgina online'ga o'tadi).

### B3. [P1] TestTaker anti-cheat iOS'da "inactive" uchun ham testni yopib yuboradi

- **Sabab:** [TestTakerScreen.tsx:264-267](apps/mobile/src/screens/TestTakerScreen.tsx#L264-L267) —
  `state === 'background' || state === 'inactive'` → darhol `violation` submit. iOS'da `inactive`
  **juda tez-tez** bo'ladi: Control Center ochish, qo'ng'iroq banneri, bildirishnoma markazi, FaceID.
- **Natija:** o'quvchi vaqtni ko'rish uchun Control Center'ni ochsa yoki qo'ng'iroq kelsa — testi
  "Taqiqlangan harakat" bilan avto-yopiladi. Yolg'on violation, o'quvchi ayblanadi.
- **Fix:** iOS'da faqat `'background'`'ni trigger qilish; qisqa inactive uchun 5-10s grace;
  qo'ng'iroq holatini (`AppState` + `CallKeep`/`DeviceEvent`) istisna qilish. Android'da hozirgi
  xolat to'g'ri (u yerda inactive kam uchraydi).

### B4. [P1] Vaqt tugaganda submit xato qilsa — ekran 0:00'da qotib qoladi

- **Sabab:** [TestTakerScreen.tsx:234-236](apps/mobile/src/screens/TestTakerScreen.tsx#L234-L236) —
  `timeLeft === 0 → handleSubmit()`; submit tarmoq xatosi bilan tugasa `submitting=false`, lekin
  taymer 0 va hech qanday retry yo'q (draf saqlanadi, UI esa 0:00'da "topshirilmoqda" holatida).
- **Natija:** imtihon oxirida internet g'ich bo'lsa — natija yuborilmaydi, o'quvchi qotib qolgan
  ekranga qaraydi; "Topshirish" tugmasini ham bosib ko'ra olmaydi (handleSubmit `timeLeft`ga qaram).
- **Fix:** xato holatida "Qayta topshirish" tugmasi ko'rsatish + offline bo'lsa drafni saqlab,
  onlayn bo'lganda avto-retry (masalan 30s interval bilan).

### B5. [P2] Watch-progress faqat range yopilganda/unmount'da saqlanadi — app kill'da yo'qoladi

- **Sabab:** [HlsVideoPlayer.tsx:521-543](apps/mobile/src/components/HlsVideoPlayer.tsx#L521-L543) —
  `apiSaveWatchProgress` faqat `closeCurrentRange()` ichida (seek, onEnd, unmount).
- **Natija:** o'quvchi 20 daqiqa ko'rib, telefonni o'chirib tashlasa (yoki crash) — shu 20 daqiqa
  serverga yuborilmaydi; "ko'rilgan %" va davom etish nuqtasi yo'qoladi.
- **Fix:** `AppState → background`'da ham `closeCurrentRange()` chaqirish (video'da allaqachon
  bor pattern), va/yoki har 30-60s da jonli range'ni yuborish (server merge qiladi — segmentlar
  idempotent merge qilinadi [83-104](apps/mobile/src/components/HlsVideoPlayer.tsx#L83-L104)).

### B6. [P2] Bir xel namespace'ga 2 ta socket ulanadi

- **Sabab:** [liveNotificationsSocket.ts:12-19](apps/mobile/src/lib/liveNotificationsSocket.ts#L12-L19)
  va [practiceMessengerSocket.ts:8-15](apps/mobile/src/lib/practiceMessengerSocket.ts#L8-L15) — ikkalasi
  ham `/practice-messenger`'ga alohida `io()` ochadi (messenger ochiq bo'lsa app'da doim 2 ta WS).
- **Natija:** ikkilangan ulanish: server ulanish kvotalari, batareya, va token autentikatsiyasi
  ikki marta. Bir socket'da token yangilanishi ikkinchisiga ta'sir qilmaydi (hozir token statik —
  muammo emas, refresh-token kelganda esa bo'ladi).
- **Fix:** bitta singleton `getPracticeMessengerSocket(token)` moduli; listenerlarni xohlagan joy
  ulaydi (hozirgi API saqlanadi, `connect*` ikkalasi shu funksiyaga delegat bo'ladi).

### B7. [P2] axios'da retry yo'q — beqaror mobil tarmoqda bir martalik GET'lar yo'qoladi

- **Sabab:** [api.ts:5](apps/mobile/src/lib/api.ts#L5) — `axios.create({timeout: 15000})`, interceptorlar
  faqat auth uchun. `ECONNABORTED`/tarmoq flutter → so'rov darhol xato.
- **Natija:** ro'yxatlar/kurslar ochilishida "Server bilan aloqa o'rnatilmadi" — bir necha soniyadan
  keyin refresh qilsa keladigan ma'lumot.cachedFirst yumshatadi, lekin birinchi ochilish (cache yo'q)
  bu holatga tushadi.
- **Fix:** idempotent GET'lar uchun 1-2 marta backoff-retry (axios-retry yoki o'z interceptor'i);
  POST'larni qoldirish (xavfsiz).

### B8. [P3] Versiya nomuvofiqligi: package.json `1.2.4` vs build.gradle `1.2.7`

- **Sabab:** versiya ikki joyda qo'lda yuritiladi ([package.json:3](apps/mobile/package.json#L3),
  `android/app/build.gradle` versionCode 20 / versionName 1.2.7).
- **Natija:** in-app update va support so'rovlari qaysi versiya haqida gapirayotgani chalkashadi.
- **Fix:** gradle'da `versionName` ni package.json'dan o'qish (`exec node -p require('../package.json').version`)
  yoki release skriptda ikkalasini yangilovchi npm script.

### B9. [P3] NetworkProvider: har 30s HEAD + `fetch` abort yo'q

- **Sabab:** [NetworkProvider.tsx:6](apps/mobile/src/providers/NetworkProvider.tsx#L6) — `setInterval(30s)`
  bilan `fetch(HEAD)`; `AbortController` yo'q; NetInfo ishlatilmaydi.
- **Natija:** sekin tarmoqda so'rovlar to'planib qolishi mumkin; "online" aniqligi ~30s;
  wifi/cellular farqi bilinmaydi (yuklab olishda "mobil tarmoq — oqadimi?" ogohlantirishi berilmaydi).
- **Fix:** `@react-native-community/netinfo` (event-driven, ping'siz) + kerak bo'lgina reachability
  HEAD (offline→active o'tishda); download boshlanishida `ConnectionType === 'cellular'` bo'lsa tasdiq so'rash.

---

## 3. PERFORMANCE

### C1. [P1] AES-128 segment decrypt JS thread'da — download payti UI "titraydi"

- **Sabab:** [offlineVideoService.ts:504-544](apps/mobile/src/lib/offlineVideoService.ts#L504-L544) — har
  segment: fayldan **base64 string** sifatida o'qish → JS'da base64→bytes → `aes-js` CBC → bytes→base64 →
  faylga yozish. 2 MB segment ≈ 2,7 MB base64 string ×2 + sinxron AES. `setTimeout(0)` bilan egallash
  yumshatilgan, lekin bitta segmentning ishlanishi baribir bloklar.
- **Natija:** yuklab olish davomida video/scroll/touch kechikadi (ayniqsa past sinf Android);
  xotira spike'lari. Bu offline download paytidagi "ilova sekinlashdi" shikoyatining manbasi.
- **Fix:** (a) JSI-asosli `react-native-quick-crypto` (aes-js o'rniga — 10-50x tez, string emas
  buffer); (b) yoki native modul `decryptToFile(path, key, iv)` — JS'da umuman bayt ko'chirilmasin;
  (c) eng to'g'risi — A3(a): AESni olib tashlash.

### C2. [P1] CachedImage har rasmni 2 marta yuklashi mumkin

- **Sabab:** [CachedImage.tsx:20](apps/mobile/src/components/common/CachedImage.tsx#L20) — boshlang'ich
  state `remoteUri` → `Image` darhol **tarmoqdan** yuklay boshlaydi; parallel holda `getCachedImageUri`
  diskka qaraydi → joyida bo'lsa `setCachedUri(local)` → Image manbasi almashadi.
- **Natija:** diskda bor rasm baribir tarmoqdan tortiladi (trafik + kechikish), keyin local'dan
  qayta ko'rsatiladi. Avatar/chat ro'yxatlarida ko'rinadigan ortiqcha yuk.
- **Fix:** `imageCache`'dagi `memoryCache`ni sinxron o'qish: birinchi renderda memory-hit bo'lsa
  darhol local URI (tarmoqsiz); miss bo'lsa placeholder → async resolve. `getCachedImageUriSync(url)`
  export qilish 5 satrlik ish.

### C3. [P2] Offline registry har segmentda to'liq o'qilib-qayta yoziladi

- **Sabab:** [offlineVideoService.ts:605-607](apps/mobile/src/lib/offlineVideoService.ts#L605-L607) —
  segment siklida: butun registry JSON o'qish → o'zgartirish → butun JSON yozish (2s'lik segmentlar =
  yuzlab rewrite; har biri barcha videolarning metadatasi).
- **Natija:** disk I/O ortiqcha; AsyncStorage yozuvlari navbatlashadi (boshqa o'qishlar kechikadi).
- **Fix:** registry'ni xotirada ushlab, diskka har 5-10 segmentda va oxirida yozish; cancel/kill
  bo'lsa keyingi ochilishda `ls` orqali rekonstruksiya (hozir ham qilinadi — resume stat bilan).

### C4. [P2] RootNavigator barcha 24 ekranni statik import qiladi — TTI ortadi

- **Sabab:** [RootNavigator.tsx:17-42](apps/mobile/src/navigation/RootNavigator.tsx#L17-L42) — barcha
  screen'lar app ochilishida bundle'ga o'qiladi va parse qilinadi (jumladan og'irlar: Classroom,
  TestTaker, ChallengeWordPractice 853 satr).
- **Natija:** cold start va ilk render sekinroq, boshlang'ich JS heap kattaroq.
- **Fix:** kam ishlatiladigan ekranlarni `React.lazy(() => require(...).X)` + `Suspense` bilan
  kechiktirish (native-stack bilan mos). Klassik RN optimizatsiyasi, 30-60 minutlik ish.

### C5. [P3] `computeTotalWatchedSeconds` har 500ms to'liq sort+merge

- **Sabab:** [HlsVideoPlayer.tsx:691-696](apps/mobile/src/components/HlsVideoPlayer.tsx#L691-L696) —
  har progress tick'da barcha saqlangan segmentlar qayta saralanadi (uzun ko'rishda segmentlar
  o'nlab-taga yetadi).
- **Natija:** kichik, lekin uzoq seansda o'sib boruvchi ortiqcha hisob.
- **Fix:** faqat ko'rsatkich UI uchun — hisobni sekundiga emas, 2-5s da bir yoki segment yopilganda
  yangilash.

### C6. [P3] `cachedFirst` taqqoslash `JSON.stringify` bilan

- **Sabab:** [storage.ts:43](apps/mobile/src/lib/storage.ts#L43) — fresh va snapshot to'liq
  serialize qilinib solishtiriladi (kurs detaliday katta payload'da yuz KB'lab string).
- **Natija:** har refresh'da ikki marta stringify — asosiy thread'da.
- **Fix:** `savedAt`/hash maydonini solishtirish yoki `JSON.stringify`ni faqat maydonlar soni
  kichik bo'lganda qo'llash.

---

## 4. FUNRSIONAL YETISHMOVCHILIKLAR (web↔mobile parity va UX)

### D1. [P1] iOS'da deep link umuman ishlamaydi

- **Sabab:** [linking.ts](apps/mobile/src/navigation/linking.ts) `jamm://` va `https://jamm.uz`
  prefikslerini kutadi, lekin `ios/Mobile/Info.plist`'da **`CFBundleURLTypes` yo'q** (custom scheme
  ro'yxatdan o'tmagan) va Universal Links (associated domains + AASA fayl) ham yo'q. Android'da
  App Links to'liq sozlangan (manifest + assetlinks.json).
- **Natija:** iPhone'da `jamm.uz/t/<slug>` havolasi (Telegram'dan, share'dan) Safari'da ochiladi,
  ilovaga o'tmaydi. "Test havolasini telefondan ochdim — app emas, sayt ochildi" shikoyati (iOS
  foydalanuvchilardan).
- **Fix:** 1) Info.plist'ga `CFBundleURLTypes` (`jamm` scheme); 2) Xcode signing'da
   `applinks:jamm.uz` associated domain + `https://jamm.uz/.well-known/apple-app-site-association`
   (backend/nginx'da serve); 3) `getStateFromPath` allaqachon tayyor — o'zgarish talab qilmaydi.

### D2. [P1] iPhone'da fullscreen video landscape bo'lmaydi

- **Sabab:** Info.plist `UISupportedInterface_orientations` — faqat Portrait (iPhone);
  [HlsVideoPlayer.tsx:1101-1125](apps/mobile/src/components/HlsVideoPlayer.tsx#L1101-L1125) Modal
  `supportedOrientations=['portrait','landscape']` yozgan, lekin app-darajasidagi lock'ni yengib
  o'tolmaydi; `isLandscape` kod yo'li (241-254) iPhone'da hech qachon trigger bo'lmaydi.
- **Natija:** iPhone'da "fullscreen" — shunchaki kattaroq portrait oyna; gorizontal dars videosi
  kichik ko'rinadi. Android'da manifest orientation'ga ruxsat bergani uchun ishlaydi.
- **Fix:** (a) native orientation unlock (rotating lock view controller / `react-native-orientation`
  o'xshash yechim) fullscreen modal ochilganda landscape-ga ruxsat; yoki (b) portrait fullscreen
  dizaynini qabul qilib, o'lik `isLandscape` shoxlarini olib tashlash.

### D3. [P2] Yuklab olishda disk joyi tekshirilmaydi

- **Sabab:** `downloadOfflineVideo` boshlanishida free space so'ralmaydi.
- **Natija:** disk to'lguncha yuklaydi → keyingi segmentlar fail → "Internet uzildi..." xatosi
  (chalkash — internet emas, disk muammosi); boshqa app'lar ham buziladi.
- **Fix:** `ReactNativeBlobUtil.fs.df()` → taxminiy hajmdan kichik bo'lsa aniq "Xotira yetarli emas
  (kerak: ~X MB, bor: Y MB)" xatosi; `StorageUsageModal` orqali joy bo'shatishga yo'naltirish.

### D4. [P3] Push bildirishnomalar yo'q — socket faqat app ochiq bo'lganda

- **Sabab:** bildirishnoma infratuzilmasi (FCM/APNs) umuman yo'q; `LiveNotificationsProvider`
  faqat foreground socket.
- **Natija:** "Jonli dars boshlandi" / yangi xabar — app yopiq bo'lsa foydalanuvchi bilmaydi.
  Dars boshlanishini o'tkazib yuborish bevosita business-loss.
- **Fix:** FCM (Android) + APNs; backend'da `liveSession:started` va `new_message`'ga push
  trigger'lari. Katta ish — alohida plan.

### D5. [P3] `soundEnabled` — o'lik funksiya

- **Sabab:** [TestTakerScreen.tsx:89](apps/mobile/src/screens/TestTakerScreen.tsx#L89) state bor,
  header'da tugma chizadi ([428-433](apps/mobile/src/screens/TestTakerScreen.tsx#L428-L433)), lekin
  hech qanday tovush mantiqiga ulanmagan (butun repoda boshqa ishlatilish yo'q).
- **Natija:** tugma bosiladi — hech narsa o'zgarmaydi (tovush baribir yo'q, chunki effektlar ham yo'q).
- **Fix:** tugmani olib tashlash yoki haqiqiy effekt (to'g'ri/javob noto'g'ri) mp3 + `sound.play`.

### D6. [P3] Watermark faqat `controlsVisible=false`da — himoya oynasi katta

- **Sabab:** [HlsVideoPlayer.tsx:804](apps/mobile/src/components/HlsVideoPlayer.tsx#L804) —
  suvbelgisi kontrollar ko'rinayotganda yashirinadi (dizayn qarori: tugmalar ustiga tushmasin).
- **Natija:** ekran yozayotgan kishi kontrollarni doim ko'rsatib turib (bitta tap) suvbelgisiz
  yozishi mumkin.
- **Fix:** watermark'ni alohida qatlamda doim ko'rsatish, kontrollar ustiga `zIndex` berib;
  yoki kontrollar ochilganda watermark'ni vaqtincha markazga olib chiqish.

---

## 5. Nima allaqachon yaxshi ishlayapti (buzish kerak emas)

- **`cachedFirst` pattern** ([storage.ts:33-57](apps/mobile/src/lib/storage.ts#L33-L57)) — disk'dan
  bir zumda chizish + fon'da refresh, faqat farq bo'lsa re-render. Navigatsiya "bir zumda" hissi
  shundan.
- **LazyVideoPlayer** — poster-tap'gacha haqiqiy player mount qilinmaydi; bir darsdagi bir nechta
  video bir-biri bilan kanal tortishmaydi.
- **Offline download davom ettirish**: segment-darajasida resume, yarim yuklangan holat ham
  yaroqli playlist bilan qoladi (`#EXT-X-ENDLIST` har qadamda), yarim fayl toza `'tmp'`+rename
  bilan yoziladi.
- **Seek settle mantiqi** ([573-584](apps/mobile/src/components/HlsVideoPlayer.tsx#L573-L584)) —
  progress'dagi eski pozitsiyalarni filtrlab, timeline "orqaga sakrashi" yo'q qilingan.
- **Watch segments** — birlashtirilgan (merge) va oflayn partial holatda noto'g'ri duration
  yuborilmaydi ([527-533](apps/mobile/src/components/HlsVideoPlayer.tsx#L527-L533)).
- **Testlar 120/120** — reducerlar, replay, cache, linking, storage, api mock'lari yaxwi yozilgan.
- **AppUpdatePrompt** — release'da native modul yo'q bo'lsa ham crash bermaydigan himoyalangan
  instansiyalash ([AppUpdatePrompt.tsx:11-28](apps/mobile/src/providers/AppUpdatePrompt.tsx#L11-L28),
  runtime nom noto'g'riligi ham hujjatlashtirilgan).
- **Android manifest gigiyenasi**: `allowBackup=false`, faqat kerakli ruxsatlar (INTERNET,
  RECORD_AUDIO, foreground media), media session to'g'ri e'lon qilingan (background audio
  Android'da ishlaydi), App Links autoVerify.
- **NSAppTransportSecurity** qulflangan (ATS bypass yo'q), mikrofon uchun izohli usage string.
- **API xato xabarlari** ([errors.ts](apps/mobile/src/lib/errors.ts)) — texnik leak'lar filtrlanib,
  foydalanuvchiga o'zbekcha aniq matn; 401-dan farqlash (JSON body sharti) deploy paytidagi
  yolg'on logout'larni oldini olgan.

---

## 6. Ustuvorlik rejasi

| Prioritet | Topilmalar | Kutilayotgan effekt |
|---|---|---|
| **P0 — buzilgan narsalarni tuzatish** | B1 (offline loop), B2 (iOS yolg'on download) | Offline video haqiqatan ishlaydi (Android) va iOS yolg'ondan xoli |
| **P1 — xavfsizlik + ishonchlilik** | A1 (Keychain), A2 (WebView origin-lock), B3 (inactive false-positive), B4 (timer-qotish), B5 (progress yo'qolishi), C1 (AES JS-thread), C2 (2x rasm yuklash), D1 (iOS deep link), D2 (landscape) | Token himoyasi; imtihon adolati; download paytida silliq UI; iOS parity |
| **P2 — polish** | A3, B6, B7, B9, C3, C4, D3 | Resurs tejash, TTI, kichik UX |
| **P3 — cosmetic** | A4, A5, B8, C5, C6, D5, D6 | Tozalik |

### Tez g'alabalar (1-2 kun)
1. **B1** — `loadPlayback` deps tuzatish: 1 satrlik dependency o'zgarishi (eng katta foyda).
2. **A2** — WebScreen'ga `onShouldStartLoadWithRequest` origin-lock + in'ektsiya guard: ~10 satr.
3. **B2** — iOS'da download tugmasini yashirish: 1 shart.
4. **B3** — `'inactive'`'ni faqat Android'da trigger qilish: 1 shart.
5. **C2** — `getCachedImageUriSync` (memory-cache) + CachedImage'da ishlatish: ~15 satr.
6. **D1-a** — Info.plist `CFBundleURLTypes` (jamm://): config-only (Universal Links keyinroq).
7. **B8** — versiyani bitta manbaga o'tkazish: kichik gradle skript.

### Test reja (har fixdan keyin)
- **B1:** video'ni to'liq yuklab olib, airplane mode'da ochish — 1 marta yuklanishi, playback
  uzluksiz davom etishi; `console.log` sanogi (yoki test'da `loadPlayback` spy) 1 bo'lishi kerak.
- **A2:** WebScreen ichida tashqi havola (masalan, lesson HTML'dagi youtube link) bosish — tashqi
  brauzerda ochilishi, WebView'da emas; localStorage'ga faqat jamm.uz'da token yozilishi.
- **B3:** iOS'da test paytida Control Center ochib-yopish — test davom etishi; 10s+ background'da
  esa violation submit bo'lishi.
- **C1:** 500 MB darsni yuklab olish paytida video ijro etish — stutter yo'qolishi (PS: quick-crypto
  bilan solishtirish).
- **D1:** iOS Safari'dan `jamm.uz/t/<slug>` ochish — ilova ochilishi (scheme'dan keyin link).
- **Regression:** `npx jest` (120) + classroom report'dagi testlar.

---

*Ushbu hisobot `apps/mobile@versionCode 20 (1.2.7)` kod bazasida yozildi. Classroom moduli
bo'yicha topilmalar (ovoz reconnect, join timeout, transport fallback va h.k.)
[CLASSROOM_REALTIME_REPORT.md](CLASSROOM_REALTIME_REPORT.md) faylida.*
