# Docker orqali VPS deploy

Bu loyiha Docker Compose bilan uchta asosiy servisda yuradi:

- `db`: PostgreSQL
- `backend`: NestJS API, ichki port `3000`
- `web`: Nginx orqali React build va `/api/*` proxy

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

Server IP bilan boshlayotgan bo'lsangiz:

```env
FRONTEND_URL=http://YOUR_SERVER_IP
VITE_API_URL=
```

`VITE_API_URL` bo'sh tursa frontend API'ga shu domen/IP ichidagi `/api/v1` orqali boradi.

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
