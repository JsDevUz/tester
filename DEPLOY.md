# Docker orqali VPS deploy

Bu loyiha Docker Compose bilan uchta asosiy servisda yuradi:

- `db`: PostgreSQL
- `backend`: NestJS API, ichki port `3000`
- `web`: Nginx orqali React build va `/api/*` proxy
- `caddy`: HTTPS reverse proxy, tashqi `80` va `443`

## 1. VPS tayyorlash

Ubuntu serverda:

```bash
apt update
apt install -y docker.io docker-compose-plugin git
systemctl enable --now docker
```

Repo'ni VPS ga olib kiring:

```bash
git clone YOUR_REPO_URL test-platform
cd test-platform
```

## 2. Production env

```bash
cp .env.production.example .env
nano .env
```

Quyidagilarni albatta almashtiring:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `FRONTEND_URL`
- `DOMAIN`
- `ACME_EMAIL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_BUCKET_NAME`
- `OBJECT_STORAGE_PUBLIC_BASE_URL`

Domain bilan ishlatayotgan bo'lsangiz:

```env
DOMAIN=test.jamm.uz
ACME_EMAIL=admin@example.com
FRONTEND_URL=https://test.jamm.uz
APP_URL=https://test.jamm.uz
VITE_API_URL=
VITE_TELEGRAM_BOT_USERNAME=YourBotUsername
```

Fayl, rasm va videolarni yuklash uchun S3-compatible object storage ham
sozlanishi shart. Masalan, Backblaze B2 uchun:

```env
OBJECT_STORAGE_ENDPOINT=https://s3.us-east-005.backblazeb2.com
OBJECT_STORAGE_REGION=us-east-005
OBJECT_STORAGE_ACCESS_KEY_ID=your-key-id
OBJECT_STORAGE_SECRET_ACCESS_KEY=your-application-key
OBJECT_STORAGE_BUCKET_NAME=your-bucket-name
OBJECT_STORAGE_PUBLIC_BASE_URL=https://files.example.com
```

`OBJECT_STORAGE_BUCKET_NAME` — B2 boshqaruv panelidagi bucket nomining aynan
o‘zi bo‘lishi kerak. Qiymatlar o‘zgargach backend konteynerini qayta yarating:

```bash
docker compose up -d --force-recreate backend
```

`VITE_API_URL` bo'sh tursa frontend API'ga shu domen/IP ichidagi `/api/v1` orqali boradi.

Telegram webhookni bot token va secret bilan ulang:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://test.jamm.uz/api/v1/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

## 3. Build va ishga tushirish

```bash
docker compose build
docker compose up -d db
docker compose run --rm migrate
docker compose run --rm seed
docker compose up -d
```

Tekshirish:

```bash
docker compose ps
docker compose logs -f backend
```

Brauzerda oching:

```text
http://YOUR_SERVER_IP
```

## Keyingi deploylar

Kod yangilansa:

```bash
git pull
docker compose build
docker compose run --rm migrate
docker compose up -d
```

Agar admin allaqachon yaratilgan bo'lsa, `seed` qayta ishga tushganda mavjud adminni o'tkazib yuboradi.

## Foydali buyruqlar

```bash
docker compose logs -f web
docker compose logs -f backend
docker compose restart backend
docker compose down
```

Ma'lumotlar `postgres_data` volume ichida saqlanadi. `docker compose down -v` ishlatsangiz database ham o'chadi.

## Jonli dars ovozi (LiveKit)

Jonli dars (PDF + chizish + davomat) ovozsiz ham ishlaydi. Ovoz uchun LiveKit kerak:

1. `.env` ga qo'shing:

```bash
LIVEKIT_API_KEY=<istalgan-kalit-nomi>          # masalan: lk-mutolaa
LIVEKIT_API_SECRET=<uzun-tasodifiy-satr>       # openssl rand -hex 32
LIVEKIT_URL=wss://livekit.SIZNING-DOMEN.uz     # yoki ws://SERVER_IP:7880 (faqat test uchun)
```

2. LiveKit serverni ishga tushiring (host tarmog'ida ishlaydi):

```bash
docker compose --profile livekit up -d livekit
docker compose restart backend
```

3. Firewall'da oching: `7880/tcp`, `7881/tcp`, `50000-50200/udp`.

4. Production'da `wss://` uchun Caddyfile'ga subdomain qo'shing:

```
livekit.SIZNING-DOMEN.uz {
    reverse_proxy localhost:7880
}
```

Brauzer mikrofonga faqat HTTPS sahifada ruxsat beradi, shuning uchun productionda `LIVEKIT_URL` albatta `wss://` bo'lishi kerak. Konfiguratsiya: `docker/livekit.yaml`.
