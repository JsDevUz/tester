# Groups/Payments Teacher UI + Student "My Courses" Page — Design Spec

## Maqsad

Avvalgi bosqichda (Groups + Pricing Plans + Monthly Payment Cycle) backend/store to'liq qurildi, lekin yakuniy whole-branch review muhim bo'shliqni aniqladi: hech qanday UI o'qituvchiga talabaga tarif belgilash, to'lov qabul qilish yoki majburiy yopishga imkon bermaydi, va talaba tomonida o'z kurslarini ko'radigan sahifa yo'q. Ushbu bosqich shu ikkala bo'shliqni to'ldiradi — to'lov tsikli endi haqiqatan ham boshidan oxirigacha ishlaydi.

## 1. Backend qo'shimchasi — talaba uchun "mening kurslarim"

Yangi endpoint, `apps/backend/src/groups/groups.controller.ts`ga qo'shiladi (`GroupsService`ga tegishli metod bilan):

`GET /my/courses` — `JwtAuthGuard` + `@Roles('student')`, talaba tokenidagi `sub` orqali uning barcha `group_members` yozuvlarini topib, har biri uchun:
```typescript
{
  courseId: string;
  courseTitle: string;
  groupName: string;
  selectedPlanName: string | null;
  latestPaymentStatus: 'pending' | 'partial' | 'paid' | 'debt' | null;
  hasAccess: boolean; // StudentAccessService.assertStudentLessonAccess natijasi
}
```

`StudentAccessService` (`apps/backend/src/payments/student-access.service.ts`, avvalgi bosqichda qurilgan, hali hech qayerda ishlatilmagan) shu yerda birinchi marta iste'mol qilinadi — `GroupsModule` uni `PaymentsModule`dan import qiladi.

## 2. Frontend — `apps/frontend/src/api/groups.ts`ga qo'shimcha

```typescript
export interface ApiMyCourse {
  courseId: string;
  courseTitle: string;
  groupName: string;
  selectedPlanName: string | null;
  latestPaymentStatus: 'pending' | 'partial' | 'paid' | 'debt' | null;
  hasAccess: boolean;
}

export async function apiGetMyCourses(): Promise<ApiMyCourse[]> {
  const res = await client.get('/my/courses');
  return res.data;
}
```

## 3. O'qituvchi tomoni — `CourseGroupsPage.tsx`ga qo'shimchalar

Har bir talaba qatoriga (guruh ichki ko'rinishida, "O'quvchilar" tabida):

- **Tarif tanlash `<select>`** — guruhning `pricingPlans` ro'yxatidan (bu ma'lumot hozircha `courseStore.ts`da yo'q — `Group`ga `plans: PricingPlan[]` maydoni qo'shiladi, `groupId` bo'yicha filtrlangan tariflar `loadCourses`da `launches.plans`dan hisoblanadi). Tanlanganda `setMemberPlan` chaqiriladi.
- **"To'lov qabul qilish" tugmasi** — faqat `selectedPlanId` bor a'zolar uchun ko'rinadi. Bosilganda modal ochiladi: summa (majburiy) + chegirma (ixtiyoriy) maydonlari, tasdiqlanganda `recordPayment` chaqiriladi.
- **"Majburiy yopish" toggle** — `setMemberForcedClosed`.
- Guruh "Sozlamalar" tabiga yangi bo'lim: **"To'lovlar tarixi"** — `loadGroupPayments` orqali guruhning barcha oylik yozuvlarini jadval sifatida ko'rsatadi (talaba nomi, oy, kutilayotgan/to'langan summa, holat).

## 4. Talaba tomoni — yangi "Mening kurslarim" sahifasi

`apps/frontend/src/pages/MyCoursesPage.tsx` — yangi sahifa, `apiGetMyCourses`ni chaqiradi. Har bir kurs uchun karta: kurs nomi, guruh nomi, to'lov holati belgisi (rang bilan), tarif nomi (agar bor bo'lsa) yoki "Tarif hali belgilanmagan" xabari.

`App.tsx`da: `HomeRoute` komponenti `admin?.role === 'student'` bo'lganda hozir `<StudentHistoryPage />` qaytaradi — bu o'zgartirilmaydi (test tarixi alohida, muhim funksiya). O'rniga, talaba uchun **yangi marshrut** qo'shiladi: `/my-courses`, va `Toolbar`/navigatsiyaga (talaba ko'radigan) havola qo'shiladi. `MyCoursesPage.tsx` `hasAccess: false` bo'lgan kurslar uchun darslarni ko'rsatmaydi, faqat holatni ko'rsatadi (darslarni to'liq ko'rish sahifasi ushbu spec doirasidan tashqarida — bu alohida, kelajakdagi "talaba dars ko'rish" loyihasi).

## Global cheklovlar

- Video/HLS himoyasi bu spec doirasidan tashqarida qoladi.
- Talaba tomonidan darslarni to'liq ko'rish (kontent bloklarini render qilish) bu spec doirasidan tashqarida — faqat kirish huquqi holatini ko'rsatish qamrab olinadi.
- Manual browser QA foydalanuvchi tomonidan bajariladi.
- Backend build/test (96 test) yashil qolishi, frontend build toza bo'lishi kerak.
