# Amaliyot bo'limi — ko'p turdagi bloklar — Dizayn

## Maqsad

Dars tahrirlash sahifasidagi "Amaliyot" bo'limini kengaytirish: hozir faqat "Test" turidagi blok qo'llab-quvvatlanadi, endi **Rasm, Fayl, Audio** turlari ham qo'shiladi. Bu uch tur — o'qituvchi tomonidan o'quvchiga topshiriq matni ko'rsatish uchun (masalan "Yangi mavzu bo'yicha 50ta gap tuzib daftarga yozing va uni rasmga olib yuklang"). Bu bosqichda faqat **o'qituvchi tomoni** (muhitni tayyorlash) qamrab olinadi — o'quvchi javobini fayl/rasm/audio sifatida yuklash interfeysi keyingi, alohida bosqichda ishlanadi.

## Ma'lumotlar modeli

`apps/frontend/src/stores/courseStore.ts`:

```typescript
export type PracticeBlockType = 'test' | 'image' | 'file' | 'audio';

export interface PracticeBlock {
  id: string;
  type: PracticeBlockType;
  testId: string | null;   // faqat type === 'test' uchun ma'noli
  description: string;     // faqat type === 'image' | 'file' | 'audio' uchun (topshiriq matni); 'test' uchun bo'sh string
}
```

`addPracticeBlock`ning imzosi o'zgaradi: `addPracticeBlock(courseId, moduleId, lessonId, type: PracticeBlockType)` — yaratilgan blok `{ id: newId(), type, testId: null, description: '' }`.

Yangi store amali: `setPracticeBlockDescription(courseId, moduleId, lessonId, blockId, description: string)` — mavjud `setPracticeBlockTest`ning bir xil CRUD naqshiga mos.

`setPracticeBlockTest` o'zgarishsiz qoladi (faqat `type === 'test'` bloklarga tegishli, lekin funksiya turni tekshirmaydi — chaqiruvchi tomon to'g'ri blokka to'g'ri amalni chaqirishga ishonch bildiradi, xuddi hozirgi kod naqshiga mos).

## Komponentlar

- `apps/frontend/src/components/course/PracticeBlockPicker.tsx` — yangi, `apps/frontend/src/components/course/BlockPicker.tsx`ning vizual naqshiga mos (kartochkalar qatori). To'rtta faol kartochka: **Test, Rasm, Fayl, Audio**. Bosilganda darhol `onPickType(type)` callback chaqiradi — fayl tanlash oynasi ochilmaydi (bu bosqichda fayl yuklash yo'q).
- `apps/frontend/src/components/course/PracticeBlockView.tsx` — turga qarab shartli render:
  - `type === 'test'`: hozirgidek, "Testni tanlang" `<select>`.
  - `type === 'image' | 'file' | 'audio'`: sarlavha ikonkasi va label turga mos o'zgaradi (Rasm/Fayl/Audio ikonkalari), tarkibida bitta `<textarea>` — "Topshiriq matni" label bilan, placeholder: "Masalan: Yangi mavzu bo'yicha 50ta gap tuzib daftarga yozing va uni rasmga olib yuklang", `value={block.description}`, `onChange` orqali `onChangeDescription(value)` callback.
  - Sarlavhadagi tur nomi (hozir statik "Test" matni) endi `TYPE_META` xaritasidan olinadi (label + icon har tur uchun).
  - Reorder (yuqoriga/pastga) va o'chirish tugmalari barcha turlar uchun o'zgarishsiz.
- `apps/frontend/src/components/course/PracticeSection.tsx` — "+ Test qo'shish" tugmasi `PracticeBlockPicker`ga almashtiriladi. `addPracticeBlock` chaqiruvi endi tanlangan turni uzatadi.

## Qamrovdan tashqari

- Fayl/rasm/audio yuklash (na o'qituvchi namunaviy fayl, na o'quvchi javob fayli).
- Talaba tomonidagi Amaliyot bajarish interfeysi (javob yuklash joyi).
- Backend integratsiyasi (bu barcha `courseStore` frontend-only qismiga tegishli, avvalgi speclardagi kabi).

## Test strategiyasi

Avvalgidek: `tsc -b && vite build` orqali tip tekshiruvi (bu loyihada frontend test suite yo'q). Qo'lda tekshirish: Amaliyotga har 4 turdagi blok qo'shish → Test bloki select bilan, qolgan uchtasi textarea bilan ishlashini tekshirish → reorder/o'chirish → matn kiritib saqlanishini tekshirish (boshqa blokka o'tib qaytganda matn saqlanib qolishi).
