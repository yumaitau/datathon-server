#!/bin/sh
set -e
# Apply migrations, then seed demo data according to SEED:
#   if-empty (default) seed only a fresh database
#   always             wipe and reseed on every start (reset the demo)
#   never              leave data alone
pnpm prisma migrate deploy
case "${SEED:-if-empty}" in
  always) pnpm tsx prisma/seed.ts ;;
  if-empty) pnpm tsx prisma/seed.ts --if-empty ;;
  never) ;;
esac
exec "$@"
