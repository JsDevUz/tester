# Payments Page Backend Integration — Design Spec

## Maqsad

`PaymentsPage.tsx` (hozircha `PAYMENT_ROWS` mock massiv bilan ishlaydi) ni haqiqiy backend ma'lumotlariga ulash — o'qituvchi bu yerda barcha kurslari/guruhlari bo'yicha barcha to'lov yozuvlarini bitta markazlashgan ro'yxatda ko'radi, filtrlaydi, va mavjud (cron orqali avtomatik yaratilgan) `pending`/`partial` yozuvlarga to'lov kiritadi.

**Muhim tushuncha:** `monthly_payments` yozuvlari FAQAT kunlik `PaymentsCronService` orqali avtomatik yaratiladi (guruhning belgilangan `paymentDay`sida, tarif belgilangan har bir a'zo uchun). Bu sahifa hech qanday yangi to'lov yozuvi "yaratmaydi" — faqat mavjud yozuvlarga summa kiritadi (`recordPayment`).

## 1. Backend o'zgarishlari

### Schema qo'shimchasi — `monthly_payments`

```typescript
export const monthlyPayments = pgTable('monthly_payments', {
  // ...mavjud ustunlar...
  paymentMethod: text('payment_method'), // nullable: 'cash' | 'click' | 'payme' | 'card' | 'other'
  note: text('note'), // nullable, ixtiyoriy izoh
});
```

Migratsiya: ikkita nullable ustun qo'shiladi, mavjud ma'lumotlarga ta'sir qilmaydi.

### `PaymentsService.recordPayment` yangilanishi

```typescript
async recordPayment(
  paymentId: string,
  adminId: string,
  amount: number,
  discount?: number,
  method?: string,
  note?: string,
) {
  // ...mavjud mantiq..., set() ga paymentMethod/note ham qo'shiladi (agar berilgan bo'lsa)
}
```

`RecordPaymentDto`ga `@IsOptional() @IsIn(['cash','click','payme','card','other']) method?: string` va `@IsOptional() @IsString() note?: string` qo'shiladi.

### Yangi endpoint — `GET /payments`

`PaymentsController`ga qo'shiladi (`@Roles('teacher', 'super')`):

```typescript
@Get('payments')
findAll(@Req() req: any) {
  return this.paymentsService.findAllForAdmin(req.admin.id);
}
```

`PaymentsService.findAllForAdmin(adminId)`: o'qituvchining barcha `courses` → `groups` → `groupMembers` → `monthlyPayments` zanjirini bitta so'rov to'plami orqali yig'ib, har bir yozuvga quyidagi kontekstni qo'shib qaytaradi:

```typescript
{
  id: string;
  groupMemberId: string;
  periodMonth: string;
  expectedAmount: number;
  discountAmount: number;
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid' | 'debt';
  paymentMethod: string | null;
  note: string | null;
  updatedAt: string;
  studentName: string;
  studentPhone: string | null;
  courseTitle: string;
  groupName: string;
  planName: string | null;
}
```

## 2. Frontend o'zgarishlari

### `apps/frontend/src/api/payments.ts`

```typescript
export interface ApiPaymentRow extends ApiMonthlyPayment {
  paymentMethod: string | null;
  note: string | null;
  studentName: string;
  studentPhone: string | null;
  courseTitle: string;
  groupName: string;
  planName: string | null;
}

export async function apiListAllPayments(): Promise<ApiPaymentRow[]> { ... }

export async function apiRecordPayment(
  paymentId: string,
  amount: number,
  discount?: number,
  method?: string,
  note?: string,
): Promise<ApiMonthlyPayment> { ... }
```

### `PaymentsPage.tsx` qayta qurilishi

- `PAYMENT_ROWS` mock massiv o'chiriladi. Komponent yuklanganda `apiListAllPayments()` chaqiradi, natijani local state'da saqlaydi.
- `COURSE_OPTIONS`/`GROUP_OPTIONS`/`TARIFF_OPTIONS`/`MONTH_OPTIONS` — qattiq kodlangan massivlar o'rniga, yuklangan `rows`dan `Set` orqali noyob qiymatlar hisoblanadi.
- Statistik kartalar (`paidTotal`, `debtTotal`, `pendingCount`, va h.k.) — real `rows`dan hisoblanadi (bu qism deyarli o'zgarishsiz qoladi, faqat `rows` manbai o'zgaradi).
- **"To'lov qo'shish" modali** (`PaymentModal`) butunlay qayta quriladi:
  - Talaba/oy bo'yicha qidiruv — endi mavjud `rows`dan **faqat `status === 'pending' || status === 'partial'`** bo'lganlarini filtrlaydi (yangi yozuv "yaratish" emas, mavjudini tanlash).
  - Tanlangan yozuv haqida ma'lumot ko'rsatiladi (talaba, kurs, guruh, tarif, oy, kutilayotgan summa).
  - Summa (majburiy), method (ixtiyoriy dropdown), note (ixtiyoriy) kiritiladi.
  - Tasdiqlanganda `apiRecordPayment(row.id, amount, discount, method, note)` chaqiriladi, keyin ro'yxat qayta yuklanadi (`apiListAllPayments()`).
  - Agar hech qanday `pending`/`partial` yozuv bo'lmasa — "Hozircha to'lov kutilayotgan yozuv yo'q" xabari ko'rsatiladi, forma yashiriladi.

## Global cheklovlar

- Yangi to'lov yozuvi hech qachon qo'lda yaratilmaydi — faqat cron orqali.
- `paymentMethod`/`note` ixtiyoriy, `recordPayment` ularsiz ham ishlaydi (orqaga moslik — `CourseGroupsPage.tsx`dagi mavjud chaqiruv o'zgarishsiz qoladi).
- Manual browser QA foydalanuvchi tomonidan bajariladi.
- Backend build/test (96 test) yashil qolishi, frontend build toza bo'lishi kerak.
