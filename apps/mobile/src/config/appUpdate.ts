// MUHIM: kutubxonaning TypeScript tiplari (`export * from './types'`) va
// haqiqiy runtime export'lari (`lib/commonjs/index.js`) NOM JIHATIDAN mos
// kelmaydi — "AndroidUpdateType" faqat .d.ts darajasida mavjud, tsc buni
// tekshirishda xato bermaydi, lekin runtime'da bu nom `undefined` bo'lib
// chiqadi (real ism — "IAUUpdateKind"). Bu nomuvofiqlik ilova ishga
// tushishi bilanoq "Cannot read property 'FLEXIBLE' of undefined" bilan
// crash bo'lishiga sabab bo'lgan edi (production'da tasdiqlangan). Shuning
// uchun to'g'ri (runtime'da haqiqatan mavjud) nom ishlatiladi.
import {IAUUpdateKind} from 'sp-react-native-in-app-updates';

// Kelajakda kritik xavfsizlik yangilanishi chiqsa, bu qiymatni IMMEDIATE'ga
// o'zgartirish kifoya — kod boshqa joyda o'zgartirilmaydi. IMMEDIATE'da
// Google to'liq ekranli dialog ko'rsatadi, foydalanuvchi yangilamasdan
// ilovadan foydalana olmaydi; FLEXIBLE esa fon rejimida yuklaydi, ilova
// ishlashda davom etadi.
export const APP_UPDATE_TYPE: IAUUpdateKind = IAUUpdateKind.FLEXIBLE;
