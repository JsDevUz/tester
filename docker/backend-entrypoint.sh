#!/bin/sh
set -e

npm run db:migrate --workspace=apps/backend

exec npm run start:prod --workspace=apps/backend
