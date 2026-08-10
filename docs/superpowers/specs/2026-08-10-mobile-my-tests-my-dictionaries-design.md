# Mobil: "Mening testlarim" va "Mening lug'atlarim" — dizayn

Sana: 2026-08-10

## Maqsad

Web'da qilingan "Mening testlarim" va "Mening lug'atlarim" funksiyalarini (`docs/superpowers/specs/2026-08-10-my-tests-my-dictionaries-design.md`) mobil ilovaga (`apps/mobile`, React Native + NativeWind) **to'liq native** ko'chirish — WebView (`WebScreen`) hech qanday bosqichda ishlatilmaydi. Backend o'zgarishsiz qoladi (u allaqachon web implementatsiyasi bilan tayyor); bu spec faqat mobil frontendni qamrab oladi.

Bu ikkalasi ham Jamm tabidagi (`apps/mobile/src/screens/ChallengesScreen.tsx`) yangi ikkita karta orqali ochiladi, xuddi web'dagi `/jamm` sahifasiga qo'shilgan kartalar kabi.

## 1. Mavjud arxitektura tekshiruvi (nima bor, nima yo'q)

Mobil ilova Jamm bo'limini allaqachon to'liq native qurgan: `ChallengesScreen` (hub), `ChallengesListView`, `ChallengeDetailScreen`, `ChallengeWordPracticeScreen` — bularning barchasi `RootNavigator.tsx`da native `Stack.Screen` sifatida ro'yxatga olingan, WebView emas. Test **topshirish** oqimi ham allaqachon native: `TestTakerScreen.tsx` + `apps/mobile/src/api/delivery.ts` (`/public/tests/:slug` orqali) — bu **o'zgarishsiz qayta ishlatiladi**, chunki backend `/t/:slug` public delivery endpointi allaqachon shu orqali ishlaydi va u kim yaratgani (teacher/student) bilan qiziqmaydi.

Yetishmayotgan (mobilda hech qachon bo'lmagan) qismlar:
- Folder/test/deck **ro'yxati va boshqaruv** ekranlari (web'dagi Dashboard/FolderCard ekvivalenti mobilda umuman yo'q — mobil foydalanuvchilar hozirgacha faqat link orqali test topshirgan, hech qachon o'z testini/papkasini ko'rmagan).
- Savol **yaratish/tahrirlash** UI (mobilda `QuestionForm.tsx`ning hech qanday analogi yo'q — mavjud `components/testTaker/*` komponentlari faqat *javob berish* uchun, *yaratish* uchun emas).
- Lug'at (deck) yaratish/so'z kiritish UI.

## 2. Navigatsiya

`apps/mobile/src/navigation/types.ts`dagi `RootStackParamList`ga qo'shiladi:

```ts
MyTests: undefined;
MyTestFolder: { folderId: string; folderName: string };
MyTestQuestionEditor: { testId: string; testName: string };
MyDictionaries: undefined;
WordDeck: { deckId: string; deckName: string };
DeckPractice: { slug: string; deckName?: string };
```

`DeckPractice` `slug` orqali ochiladi (`deckId` emas) — chunki bu ekranga ikki yo'l bilan kirish mumkin: (a) `WordDeckScreen`dan "Mashq qilish" tugmasi orqali (o'z deck'i, slug ma'lum), (b) boshqa foydalanuvchining ulashgan linkini deep link orqali ochganda (faqat slug ma'lum, `deckId`/`deckName` noma'lum — nom API javobidan olinadi).

`apps/mobile/src/navigation/RootNavigator.tsx`ga yangi `Stack.Screen` yozuvlari qo'shiladi, `ChallengesList`/`ChallengeDetail`/`ChallengeWordPractice` bilan bir qatorda:

```tsx
<Stack.Screen name="MyTests" component={MyTestsScreen} options={{ title: 'Mening testlarim' }} />
<Stack.Screen name="MyTestFolder" component={MyTestFolderScreen} options={({ route }) => ({ title: route.params.folderName })} />
<Stack.Screen name="MyTestQuestionEditor" component={MyTestQuestionEditorScreen} options={({ route }) => ({ title: route.params.testName })} />
<Stack.Screen name="MyDictionaries" component={MyDictionariesScreen} options={{ title: "Mening lug'atlarim" }} />
<Stack.Screen name="WordDeck" component={WordDeckScreen} options={({ route }) => ({ title: route.params.deckName })} />
<Stack.Screen name="DeckPractice" component={DeckPracticeScreen} options={({ route }) => ({ title: route.params.deckName ?? "Lug'at", gestureEnabled: false })} />
```

### Deep linking

`apps/mobile/src/navigation/linking.ts`ga `/d/:slug` uchun maxsus qoida qo'shiladi (hozirda bu yo'l WebView'ga tushardi — endi native `DeckPractice`ga yo'naltiriladi):

```ts
const deckMatch = normalized.match(/^\/d\/([^/?#]+)/);
if (deckMatch) {
  return {
    routes: [{name: 'Main'}, {name: 'DeckPractice', params: {slug: deckMatch[1]}}],
  } as ReturnType<NonNullable<LinkingOptions<RootStackParamList>['getStateFromPath']>>;
}
```

`linking.ts`da hozircha faqat `/school-invite/:token` uchun maxsus qoida bor — `/t/:slug` uchun qoida **yo'q**, ya'ni bugungi kunda ulashilgan test linklari mobilda `WebScreen` (WebView) orqali ochiladi, `TestTakerScreen`ga emas. Bu — student-yaratgan testlarga xos emas, mavjud (teacher-yaratgan) testlar uchun ham amal qiladigan eski kamchilik. "Mobil ichida web qolmasin" talabiga ko'ra, bu spec doirasida `/t/:slug` uchun ham `/d/:slug`dagi bilan bir xil naqshda maxsus qoida qo'shiladi:

```ts
const testMatch = normalized.match(/^\/t\/([^/?#]+)/);
if (testMatch) {
  return {
    routes: [{name: 'Main'}, {name: 'TestTaker', params: {slug: testMatch[1], title: 'Test', practiceMode: false}}],
  } as ReturnType<NonNullable<LinkingOptions<RootStackParamList>['getStateFromPath']>>;
}
```

Bu o'zgarish student-yaratgan testlar bilan cheklanmaydi — barcha `/t/:slug` linklari (teacher yoki student yaratgan, farqsiz) endi native `TestTakerScreen`da ochiladi.

## 3. Jamm hub — ikkita yangi karta

`apps/mobile/src/screens/ChallengesScreen.tsx`ga, "Jonli Musobaqalar" `HubCard`dan keyin, ikkita yangi faol karta qo'shiladi (mavjud ikkita "Tez orada" kartadan oldin):

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

`FileText`, `Languages` — `lucide-react-native`dan import qilinadi (web versiyasida ishlatilgan `lucide-react` ikonkalari bilan bir xil nomlar, mobil ekvivalenti mavjud).

## 4. Mening testlarim (mobil)

### 4.1 API klient

`apps/mobile/src/api/student-tests.ts` — web'dagi `apps/frontend/src/api/student-tests.ts` bilan bir xil backend endpointlar (`me/test-folders`, `me/tests`, `me/tests/:testId/questions`, `me/questions/:id`), lekin mobil `apps/mobile/src/lib/api.ts` axios instance (`api`) orqali chaqiriladi (JWT interceptor allaqachon o'rnatilgan, qo'shimcha auth kod kerak emas).

Tiplar va funksiyalar web bilan bir xil nomlash: `StudentFolder`, `StudentTest`, `StudentTestDetail`, `CreateStudentTestData`, `apiFetchStudentFolders`, `apiCreateStudentFolder`, `apiUpdateStudentFolder`, `apiDeleteStudentFolder`, `apiFetchStudentTests`, `apiGetStudentTest`, `apiCreateStudentTest`, `apiUpdateStudentTest`, `apiDeleteStudentTest`, `apiAddStudentQuestion`, `apiUpdateStudentQuestion`, `apiDeleteStudentQuestion`.

### 4.2 `MyTestsScreen.tsx` — papka ro'yxati

`Screen`+`Header` (`Ui.tsx`) ichida papka kartalari ro'yxati (`FlatList` yoki `ScrollView`, mobil konventsiyasiga ko'ra — mavjud ro'yxat ekranlarida qanday ishlatilgani implementatsiya bosqichida tekshiriladi). Har bir karta: rang doira/kvadrat + icon, nom, test soni, uzoq bosishda (`onLongPress`) tahrirlash/o'chirish uchun action-sheet (`Alert.alert` bilan tugmalar, mavjud `ChallengeDetailScreen`dagi timeframe-picker naqshiga o'xshab) yoki kichik uch-nuqta tugma. Sarlavha ostida "+ Yangi papka" tugmasi — nom va rang tanlash uchun oddiy bottom-sheet/modal (rang tanlash `NewFolderModal.tsx`dagi 10 ta rangli doira bilan bir xil palitra).

Bo'sh holat: `Empty` komponenti (`Ui.tsx`) — "Hali papka yo'q. Yangisini yarating!".

### 4.3 `MyTestFolderScreen.tsx` — papka ichidagi testlar

`route.params.folderId` bo'yicha `apiFetchStudentTests(folderId)`. Har bir test — karta: nom, tavsif, savol soni (agar `findOne` orqali olingan bo'lsa) yoki oddiy ro'yxat elementi (`apiFetchStudentTests` savol sonini qaytarmasa, faqat nom+tavsif ko'rsatiladi — bu implementatsiya bosqichida backend javobiga qarab aniqlanadi). Har bir test kartasida uch tugma: **Savollar** (→ `MyTestQuestionEditor`), **Havola nusxalash** (`react-native`ning `Share.share()` yoki `@react-native-clipboard/clipboard` — mobil ilovada allaqachon qaysi mexanizm ishlatilganini implementatsiya bosqichida tekshirish kerak, `jamm.uz/t/:slug` matnini nusxalaydi/ulashadi), **O'chirish** (tasdiqlash `Alert.alert` bilan).

Sarlavhada "+ Yangi test" — nom+tavsif so'ragan oddiy forma (vaqt chegarasi, natija ko'rsatish rejimi, aralashtirish sozlamalari — web'dagi `StudentTestSettingsModal`dagi bir xil maydonlar, `requireAuth`/`onceOnly`/`deadline` UI'da yo'q). Yaratilgach darhol `MyTestQuestionEditor`ga navigate qilinadi (`replace`, orqaga qaytishda bo'sh testga qaytmasligi uchun).

### 4.4 `MyTestQuestionEditorScreen.tsx` — savol muharriri (10 tur, to'liq)

Bu eng katta yangi ekran — mobilda hech qachon savol yaratish UI bo'lmagan. Web'dagi `QuestionForm.tsx` (980 qator, `apps/frontend/src/components/QuestionForm.tsx`) — barcha 10 turning aniq ma'lumot kodlanishi (`options: [{text, isCorrect, orderIndex}]` massivi orqali har bir tur o'zicha kodlanadi) shu yerda **native RN komponentlar** bilan qayta yaratiladi:

| Tur | Web input | Mobil ekvivalenti | Ma'lumot kodlanishi (backendga bir xil yuboriladi) |
|---|---|---|---|
| `single`/`multi` | checkbox/radio ro'yxat | `Pressable` ro'yxat, radio/checkbox ikonka bilan | `options: [{text, isCorrect}]` |
| `truefalse` | 2 ta tugma (To'g'ri/Noto'g'ri) | 2 ta katta `Pressable` tugma | `options: [{text:"To'g'ri", isCorrect}, {text:"Noto'g'ri", isCorrect}]` |
| `open` | matn input | `Input` (`Ui.tsx`) | `correctAnswer: string`, `options: []` |
| `fillblank` | matn input (bo'sh joy belgisi bilan) | `Input`, ko'p qatorli | `correctAnswer: string`, `options: []` |
| `arrange` | to'g'ri tartib tokenlari + chalg'ituvchilar | ikkita dinamik ro'yxat (`+ qo'shish` tugmasi bilan) | `options: [...to'g'ri tokenlar (isCorrect:true, orderIndex), ...chalg'ituvchilar (isCorrect:false)]` |
| `reorder` | to'g'ri tartib tokenlari | bitta dinamik ro'yxat | `options: [{text, isCorrect:true, orderIndex}]` |
| `matching` | chap/o'ng juftlik ro'yxati | ikki ustunli dinamik forma (chap/o'ng input juftlari) | `options: [{left, isCorrect:true, orderIndex:i}, {right, isCorrect:false, orderIndex:i}]` (flatten, index bo'yicha juftlanadi) |
| `slider` | min/max/step raqam inputlari | 3 ta `Input` (raqamli klaviatura, `keyboardType="numeric"`) | `options: [{text:min,orderIndex:0},{text:max,orderIndex:1},{text:step,orderIndex:2}]` |
| `droppin` | rasm ustiga bosib nuqta belgilash + radius | rasm yuklash + `Pressable` bilan rasm ustiga bosish (`onPress` event koordinatalari, `nativeEvent.locationX/Y` foizga aylantiriladi) + radius `Input` | `correctAnswer: "x,y"` (foiz), `options: [{text: radius}]` |

Har bir tur uchun kichik, alohida komponent fayl (`apps/mobile/src/components/questionEditor/` papkasida, masalan `TrueFalseTypeEditor.tsx`, `MatchingTypeEditor.tsx`, `SliderTypeEditor.tsx`, `ArrangeTypeEditor.tsx`, `ReorderTypeEditor.tsx`, `DropPinTypeEditor.tsx`) — `QuestionForm.tsx`ning ichki type-branching mantig'ini alohida fayllarga bo'lib, har birini mustaqil test qilish va o'qish oson bo'lishi uchun (web'dagi kabi bitta 980-qatorli faylga jamlamaslik — mobil komponentlar odatda ixcham, bu konventsiyaga mos).

Rasm/audio yuklash (`imageUrl`/`audioUrl`) — mavjud media-upload mexanizmi (agar mobilda boshqa joyda rasm yuklash bo'lsa, masalan messenger yoki classroom'da, o'sha komponent/hook qayta ishlatiladi; implementatsiya bosqichida `apps/mobile/src/hooks/` va `apps/mobile/src/components/`da mavjud upload logikasi qidiriladi).

Ekran tuzilishi: savol turini tanlash uchun tepada gorizontal scroll qiladigan pill-tugmalar qatori (web'dagi kabi), tanlangan turga qarab tegishli mini-forma pastda ko'rinadi, "Saqlash" tugmasi `apiAddStudentQuestion`/`apiUpdateStudentQuestion` chaqiradi. Mavjud savollar ro'yxati skrollning davomida, har biri tahrirlash uchun bosilganda forma o'sha savol ma'lumotlari bilan to'ldiriladi (inline edit, alohida ekranga o'tmasdan — `QuestionEditorPage.tsx`dagi `InlineQuestionCard` naqshiga o'xshab).

### 4.5 Test topshirish

O'zgarishsiz — mavjud `TestTakerScreen`/`delivery.ts` orqali, deep link (`jamm://t/:slug`) yoki "Havola nusxalash"dan olingan link boshqa ilovada ochilganda.

## 5. Mening lug'atlarim (mobil)

### 5.1 API klient

`apps/mobile/src/api/word-decks.ts` — web'dagi `apps/frontend/src/api/word-decks.ts` bilan bir xil: `WordDeck`, `DeckWord`, `DeckView` tiplari, `apiFetchWordDecks`, `apiCreateWordDeck`, `apiUpdateWordDeck`, `apiDeleteWordDeck`, `apiListDeckWords`, `apiAddDeckWord`, `apiBulkImportDeckWords`, `apiDeleteDeckWord`, `apiGetDeckBySlug` — mobil `api` instance orqali.

### 5.2 `MyDictionariesScreen.tsx` — deck ro'yxati

`MyTestsScreen`ga o'xshash tuzilma: deck kartalari ro'yxati (`Languages` ikonka), tepada nom kiritish + "Yaratish" tugmasi (inline, modal emas — web'dagi `MyDictionariesPage`dagi kabi). Uzoq bosishda tahrirlash/o'chirish action-sheet.

### 5.3 `WordDeckScreen.tsx` — so'z boshqaruvi

`route.params.deckId` bo'yicha `apiListDeckWords`. Ikkita `Input` (so'z, tarjima) + "Qo'shish" tugmasi, pastda so'zlar ro'yxati (har birida o'chirish tugmasi). "Ommaviy import" tugmasi — bottom-sheet, ko'p qatorli `TextInput` (`so'z - tarjima` format, `CourseChallengeWordsPanel.tsx`dagi parser bilan bir xil, backend allaqachon shu formatni tushunadi — hech qanday frontend parsing kerak emas, xom matn to'g'ridan-to'g'ri `apiBulkImportDeckWords`ga yuboriladi).

Sarlavhada ikkita tugma: **Havola nusxalash/ulashish** (`jamm.uz/d/:slug`) va **Mashq qilish** (→ `DeckPractice`, `{ slug: deck.slug, deckName: deck.name }` bilan — o'z deck'ini ham xuddi ulashgandek sinab ko'rish imkoniyati).

### 5.4 `DeckPracticeScreen.tsx` — mashq (flashcard/test)

`ChallengeWordPracticeScreen.tsx`ning to'g'ridan-to'g'ri moslashtirilgan nusxasi — bir xil `PanResponder`+`Animated` swipe-karta stack va 4-variantli test mantig'i qayta ishlatiladi (fayl strukturasi, animatsiya konstantalari, gesture handler'lar bir xil qoladi). Farqlari:

- Ma'lumot manbai: `route.params.slug` orqali `apiGetDeckBySlug(slug)` — natija `{ id, name, words: [{id, word, translation}] }`, `known` maydoni yo'q.
- Har bir so'z uchun local `known: boolean` state `false`dan boshlanadi (server holatidan emas).
- **Hech qanday progress-yozish API chaqiruvi yo'q** — `ChallengeWordPracticeScreen`dagi `apiSetChallengeWordProgress` chaqiruvlari butunlay olib tashlanadi; swipe/javob natijasi faqat mahalliy `useState`ni yangilaydi.
- Sarlavha (ekran tepasidagi "✦ So'z yodlash" matni) deck nomi bilan almashtiriladi (`route.params.deckName`, agar mavjud bo'lmasa — API javobidagi `deck.name`dan olinadi, chunki deep-link orqali kirganda `deckName` param bo'lmasligi mumkin).
- "Reyting" bo'limi yo'q (challenge'dagi kabi `leaderboard` chaqiruvi umuman yo'q — chunki statistika saqlanmaydi).

## 6. Ruxsat va cheklovlar (mobil ham xuddi web bilan bir xil)

| | Mening testlarim | Mening lug'atlarim |
|---|---|---|
| Yaratuvchi | faqat student | faqat student |
| Kirish (link/deep-link) | login qilgan userlar (JWT interceptor allaqachon shart qiladi) | login qilgan userlar |
| Pin/deadline/onceOnly | UI'da yo'q | tegishli emas |
| Natijalar ko'rish | yo'q (submission-ro'yxat ekrani yaratilmaydi) | tegishli emas (statistika yo'q) |
| Progress saqlanadimi | ha (mavjud `TestTakerScreen`/`delivery.ts` orqali, o'zgarishsiz) | yo'q, faqat ekran hayoti davomida |

## Qamrovdan tashqari (YAGNI)

- iOS uchun Universal Links entitlement fayli (`.entitlements`) — mavjud arxitektura tekshiruvida topilmadi; agar `/d/:slug` deep-link iOS'da ishlamasa, bu alohida, mobil-umumiy muammo (bu spec doirasidan tashqari — `/school-invite/:token` kabi mavjud native route'lar ham xuddi shu cheklovga ega bo'lardi).
- Rasm/audio yuklash uchun yangi upload mexanizmi qurish — mavjud mexanizm (agar mobilda boshqa joyda bo'lsa) qayta ishlatiladi, yangisi yozilmaydi.
- Offline rejim / keshlash — `Mening testlarim`/`Mening lug'atlarim` ekranlari boshqa ekranlar bilan bir xil tarzda `NetworkProvider`/`OfflineBanner`ni qo'llaydimi yoki yo'qmi — bu implementatsiya bosqichida mavjud ekranlar konventsiyasiga qarab hal qilinadi, alohida yangi offline strategiya ixtiro qilinmaydi.
- Android/iOS platformalar orasidagi farq (masalan `Alert.alert` action-sheet uslubi) — mavjud ekranlarda qanday hal qilingan bo'lsa, xuddi shunday davom ettiriladi, yangi abstraksiya qurilmaydi.
