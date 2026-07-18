#!/usr/bin/env bash
# VPS'da cron orqali ishga tushadi: Postgres dump oladi va Telegram bot orqali
# super adminga yuboradi. Loyiha ildizidagi .env faylidan sozlamalarni o'qiydi.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
DB_CONTAINER="test-platform-db-1"
BACKUP_DIR="$PROJECT_DIR/backups"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER .env da topilmadi}"
: "${POSTGRES_DB:?POSTGRES_DB .env da topilmadi}"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN .env da topilmadi}"
: "${SUPER_ADMIN_CHAT_ID:?SUPER_ADMIN_CHAT_ID .env da topilmadi}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y-%m-%d_%H-%M)"
DUMP_FILE="$BACKUP_DIR/${POSTGRES_DB}_${STAMP}.sql.gz"

docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$DUMP_FILE"

curl -sS -f -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
  -F "chat_id=${SUPER_ADMIN_CHAT_ID}" \
  -F "caption=DB backup: ${POSTGRES_DB} — ${STAMP} (Asia/Tashkent)" \
  -F "document=@${DUMP_FILE}"

# Faqat oxirgi 14 kunlik dumplarni saqlash, disk to'lib ketmasin
find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -mtime +14 -delete
