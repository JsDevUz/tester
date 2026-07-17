# LiveKit deploy — bajarilgan ishlar va production sozlash yo'riqnomasi

## Nima uchun

Jonli dars (classroom) ovoz funksiyasi LiveKit SFU'ga bog'liq. Server (`jamm.uz`, IP `162.55.167.60`) da LiveKit'ni ishga tushirish va Caddy orqali `wss://` bilan ochish jarayonida uchta muammo chiqdi va tuzatildi.

## Topilgan va tuzatilgan muammolar

### 1. `LIVEKIT_API_SECRET` juda qisqa edi

LiveKit serveri xato bilan to'xtardi: `secret is too short, should be at least 32 characters for security`.

**Yechim:** `openssl rand -hex 32` bilan 64 belgili tasodifiy secret generatsiya qilindi va `.env`ga yozildi.

### 2. Caddy `localhost:7880`ga ulanolmasdi (`TLS connect error`)

**Sabab:** `docker-compose.yml`da `caddy` xizmati odatiy Docker bridge tarmog'ida ishlaydi, `livekit` xizmati esa `network_mode: host`da (UDP port range 50000-50200 to'g'ridan-to'g'ri ochilishi uchun). Ikkalasi turli tarmoqlarda bo'lgani sababli Caddy konteyneridan `localhost:7880` deyilganda bu Caddyning **o'z** konteyneriga ishora qilardi, LiveKit'ga emas.

**Yechim (commit `e05e41b`):**
- `docker-compose.yml`: `caddy` xizmatiga `extra_hosts: ["host.docker.internal:host-gateway"]` qo'shildi — bu Caddy konteyneri ichidan host makinaning o'ziga murojaat qilish imkonini beradi.
- `docker/Caddyfile`: yangi server-blok qo'shildi:
  ```
  {$LIVEKIT_DOMAIN:livekit.test.jamm.uz} {
      reverse_proxy host.docker.internal:7880
  }
  ```
- `docker-compose.yml`da `caddy` xizmatiga `LIVEKIT_DOMAIN: ${LIVEKIT_DOMAIN:-}` environment o'zgaruvchisi qo'shildi.

### 3. Caddy "server block without any key is global configuration" xatosi bilan crash-loop bo'lib qoldi

**Sabab:** `.env` faylida `LIVEKIT_DOMAIN` o'zgaruvchisi umuman yo'q edi. `${LIVEKIT_DOMAIN:-}` compose orqali Caddy konteyneriga **bo'sh qiymat bilan** uzatildi. Caddyfile'dagi `{$LIVEKIT_DOMAIN:livekit.test.jamm.uz}` — agar environment o'zgaruvchisi **butunlay mavjud bo'lmasa** fallback (`livekit.test.jamm.uz`) ishlatadi, lekin bo'sh satr sifatida mavjud bo'lsa, Caddy uni "kalitsiz global blok" deb noto'g'ri talqin qildi va konfiguratsiya butunlay buzildi.

**Yechim:** `.env`ga aniq qiymat bilan qator qo'shildi:
```bash
LIVEKIT_DOMAIN=livekit.jamm.uz
```

## Production serverdagi to'liq `.env` LiveKit qismi

```bash
LIVEKIT_API_KEY=lk-mutolaa
LIVEKIT_API_SECRET=adc8f496cb09a08bc3d2e4d4014464ebe17d6e532a2c989d9dd1ce9e0916f7b9
LIVEKIT_URL=wss://livekit.jamm.uz
LIVEKIT_DOMAIN=livekit.jamm.uz
```

## DNS

Cloudflare'da A-record qo'shildi:
```
Turi:   A
Nom:    livekit
Qiymat: 162.55.167.60
Proxy:  DNS only (kulrang bulut — WebSocket uchun shart, orange proxy bilan ishlamaydi)
```

## To'liq ishga tushirish ketma-ketligi (serverda, `/opt/tester` ichida)

```bash
# 1. Eski, qo'lda docker run bilan ko'tarilgan LiveKit konteynerini olib tashlash
docker stop nostalgic_shtern && docker rm nostalgic_shtern

# 2. .env ga LiveKit o'zgaruvchilarini qo'shish (yuqoridagi 4 qator)
nano .env

# 3. Yangi kodni tortib olish
git pull origin main

# 4. LiveKit'ni compose profili orqali ko'tarish
docker compose --profile livekit up -d livekit

# 5. Backend va Caddy'ni yangi env bilan qayta ko'tarish
docker compose up -d --force-recreate caddy backend

# 6. Tekshirish
docker compose logs -f livekit   # "starting LiveKit server" ko'rinishi kerak
docker compose logs -f caddy     # sertifikat olinishi kerak, xato bo'lmasligi kerak
curl -I https://livekit.jamm.uz  # HTTP 426 (Upgrade Required) — bu normal javob
```

## Holat

`.env`ga `LIVEKIT_DOMAIN` qo'shildi, Caddy va backend qayta ko'tarildi. LiveKit + Caddy + DNS zanjiri to'liq ishga tushdi.

## Kelajakda shu xil muammoni oldini olish

`network_mode: host` bilan ishlaydigan har qanday yangi xizmat qo'shilsa (masalan boshqa SFU/media-server), xuddi shu `host.docker.internal` + `extra_hosts` patterni ishlatiladi — Caddy konteyner nomlariga emas, faqat shu maxsus hostname'ga ulanadi.

---

## Video upload: Backblaze B2 CORS sozlash

### Nima uchun

Video upload presigned URL orqali to'g'ridan-to'g'ri object storage'ga (Backblaze B2, S3-compatible API) yuklanadigan qilib o'zgartirilgan edi (tezlik uchun — backend orqali proxy qilinmaydi). Bu brauzerdan bucket'ga to'g'ridan-to'g'ri `PUT` so'rovi yuborishni talab qiladi, buning uchun bucket'da CORS sozlangan bo'lishi shart. Sozlanmagan holda video yuklashda **CORS error** chiqib, "Video tayyorlashda xatolik yuz berdi" ko'rinardi.

### Muammo

Backblaze B2 veb-konsolidagi oddiy CORS UI (Buckets → bucket → CORS Rules) faqat oldindan tayyorlangan variantlarni taklif qiladi (`Share everything with one origin` va h.k.) va bular odatda faqat **o'qish** (GET) operatsiyalariga mo'ljallangan — aniq `s3_put` ruxsatini shu UI orqali qo'shib bo'lmaydi. Shuning uchun `b2` CLI orqali custom CORS qoida yozildi.

### Bajarilgan qadamlar (production server, `jamm.uz`)

#### 1. `b2` CLI o'rnatildi

Tizim Python'i "externally managed" bo'lgani uchun (`pip install` to'g'ridan-to'g'ri ishlamadi), `pipx` orqali o'rnatildi:

```bash
apt-get update && apt-get install -y pipx
pipx install b2
pipx ensurepath
source ~/.bashrc
```

#### 2. Avtorizatsiya

```bash
b2 account authorize
```

`.env`dagi `OBJECT_STORAGE_ACCESS_KEY_ID` (keyID) va `OBJECT_STORAGE_SECRET_ACCESS_KEY` (applicationKey) kiritildi.

#### 3. Bucket holati tekshirildi

```bash
b2 bucket get jammstorage
```

Natija: `bucketType: "allPublic"`, `corsRules: []` (bo'sh).

#### 4. CORS qoida yozildi va qo'llandi

```bash
cat > /tmp/cors-rules.json << 'EOF'
[
  {
    "corsRuleName": "video-upload-direct",
    "allowedOrigins": ["https://jamm.uz"],
    "allowedHeaders": ["content-type"],
    "allowedOperations": ["s3_put", "s3_get", "s3_head"],
    "maxAgeSeconds": 3600
  }
]
EOF

b2 bucket update --cors-rules "$(cat /tmp/cors-rules.json)" jammstorage allPublic
```

**Muhim CLI eslatma:** flag nomi `--cors-rules` (defis bilan), `--corsRules` emas. Argument tartibi: `b2 bucket update [flags] <bucketName> <bucketType>` — `bucketType` (`allPublic`/`allPrivate`) buyruqning oxirida, positional argument sifatida beriladi.

Natija tasdiqlandi: `revision: 3`, `corsRules` massivida `video-upload-direct` qoidasi `s3_put`/`s3_get`/`s3_head` va `https://jamm.uz` origin bilan.

### Bucket'ning yakuniy CORS holati

```json
{
  "bucketName": "jammstorage",
  "bucketType": "allPublic",
  "corsRules": [
    {
      "corsRuleName": "video-upload-direct",
      "allowedOrigins": ["https://jamm.uz"],
      "allowedHeaders": ["content-type"],
      "allowedOperations": ["s3_head", "s3_put", "s3_get"],
      "maxAgeSeconds": 3600
    }
  ]
}
```

### ⚠️ Xavfsizlik — bajarilishi SHART bo'lgan keyingi qadam

CORS sozlash jarayonida `OBJECT_STORAGE_ACCESS_KEY_ID` va `OBJECT_STORAGE_SECRET_ACCESS_KEY` (hamda ulardan generatsiya qilingan vaqtinchalik `accountAuthToken`) suhbat orqali oshkor bo'ldi (terminal chiqishi orqali). Bu kalit `writeFiles`, `deleteFiles`, `writeBuckets` huquqlariga ega — ya'ni **butun bucket'ni o'chirish/yozib almashtirish** imkoniyatiga ega.

**Qilinishi kerak (hali bajarilmagan):**

1. Backblaze konsoli → **Application Keys** → eski keyni (`005d2cc251b4ba80000000001`) **o'chirish**
2. Yangi Application Key yaratish (kamida shu bucket uchun, "read and write" huquqi bilan)
3. `/opt/tester/.env`dagi `OBJECT_STORAGE_ACCESS_KEY_ID` va `OBJECT_STORAGE_SECRET_ACCESS_KEY`ni yangi qiymatlarga almashtirish
4. Backend'ni qayta ko'tarish:
   ```bash
   docker compose up -d --force-recreate backend
   ```

Bu qadam bajarilmaguncha eski kalit hali ham amal qiladi va xavf saqlanib qoladi.

### Boshqa domen/bucket uchun eslatma

Agar kelajakda frontend boshqa domenga ko'chsa yoki yangi subdomain qo'shilsa, CORS qoidasidagi `allowedOrigins` ro'yxatiga o'sha domenni qo'shish kerak (masalan lokal development uchun `http://localhost:5173`):

```bash
b2 bucket update --cors-rules '[{"corsRuleName":"video-upload-direct","allowedOrigins":["https://jamm.uz","http://localhost:5173"],"allowedHeaders":["content-type"],"allowedOperations":["s3_put","s3_get","s3_head"],"maxAgeSeconds":3600}]' jammstorage allPublic
```
