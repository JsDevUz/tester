#!/bin/sh
set -e

npm run db:migrate --workspace=apps/backend

# To'g'ridan-to'g'ri node'ni exec qilamiz (npm run orqali emas) — npm CLI
# ba'zan SIGTERM'ni child process'ga o'z vaqtida forward qilmaydi, bu esa
# graceful shutdown (ClassroomService.onApplicationShutdown — aktiv doska
# holatini DB'ga saqlash) ishga tushishiga ulgurmasdan process o'lib
# ketishiga olib kelishi mumkin.
exec node apps/backend/dist/src/main
