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

Ushbu hujjat yozilgan paytda oxirgi qadam — `.env`ga `LIVEKIT_DOMAIN` qo'shib Caddy'ni qayta ko'tarish — serverda bajarilishi kutilmoqda. Shundan keyin brauzerda darsni ochib mikrofonni yoqib tekshirish kerak: "Ovoz o'chirilgan (server sozlanmagan)" yozuvi ko'rinmasligi kerak.

## Kelajakda shu xil muammoni oldini olish

`network_mode: host` bilan ishlaydigan har qanday yangi xizmat qo'shilsa (masalan boshqa SFU/media-server), xuddi shu `host.docker.internal` + `extra_hosts` patterni ishlatiladi — Caddy konteyner nomlariga emas, faqat shu maxsus hostname'ga ulanadi.
