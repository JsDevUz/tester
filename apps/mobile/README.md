# BirKod Student Mobile

React Native CLI (iOS + Android) student ilovasi. UI NativeWind/Tailwind bilan yozilgan.

## Offline-first

Online ochilgan kurslar, dars kontenti, amaliyot tarixi, chatlar va xabarlar AsyncStorage snapshot sifatida saqlanadi. So'rov ishlamasa ilova avtomatik oxirgi snapshotni read-only ko'rsatadi. WebView sahifalari platforma HTTP cache'idan foydalanadi.

Online talab qilinadi: birinchi login, ma'lumot yangilash, darsni tugatish, test/topshiriq yuborish, xabar yuborish, jonli musobaqa va classroom meet.

## Ishga tushirish

```bash
npm install
npm run start --workspace=apps/mobile
npm run ios --workspace=apps/mobile
# yoki
npm run android --workspace=apps/mobile
```

Local backend uchun iOS `localhost`, Android emulator `10.0.2.2` ishlatadi. Release'da `.env.example` dagi URL'larni production domeniga sozlang.
