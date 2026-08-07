#!/bin/sh
set -e

# ── Validate required env vars ────────────────────────────────────────────────
if [ -z "$SESSION_SECRET" ]; then
  echo "ERROR: SESSION_SECRET is not set."
  echo "       Generate one with:  openssl rand -hex 32"
  echo "       Then set it in your .env file."
  exit 1
fi

SECRET_LEN=$(printf '%s' "$SESSION_SECRET" | wc -c)
if [ "$SECRET_LEN" -lt 32 ]; then
  echo "ERROR: SESSION_SECRET is too short (${SECRET_LEN} chars). Minimum is 32."
  echo "       Generate a strong secret with:  openssl rand -hex 32"
  exit 1
fi

if [ "$SESSION_SECRET" = "changeme" ] || \
   [ "$SESSION_SECRET" = "secret" ] || \
   [ "$SESSION_SECRET" = "REPLACE_WITH_A_LONG_RANDOM_STRING_AT_LEAST_32_CHARS" ]; then
  echo "ERROR: SESSION_SECRET is set to a placeholder. Replace it with a real random value."
  exit 1
fi

if [ -z "$ADMIN_EMAIL" ]; then
  echo "ERROR: ADMIN_EMAIL is required (your login email, e.g. you@example.com)"
  exit 1
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  echo "ERROR: ADMIN_PASSWORD is required"
  exit 1
fi

# ── Wait for PostgreSQL to be ready ──────────────────────────────────────────
echo "▶  Waiting for database..."
RETRIES=30
until psql "$DATABASE_URL" -c '\q' > /dev/null 2>&1 || [ "$RETRIES" -eq 0 ]; do
  echo "   Database not ready yet, retrying in 2s... ($RETRIES attempts left)"
  sleep 2
  RETRIES=$((RETRIES - 1))
done
if [ "$RETRIES" -eq 0 ]; then
  echo "ERROR: Could not connect to the database after multiple retries."
  echo "       Check that DATABASE_URL is correct and the database is running."
  exit 1
fi
echo "   Database is ready."

# ── Apply database schema (idempotent) ────────────────────────────────────────
echo "▶  Applying database schema..."
psql "$DATABASE_URL" -f /app/schema.sql -v ON_ERROR_STOP=0 -q
echo "   Schema applied."

# ── Run seed (idempotent) ─────────────────────────────────────────────────────
echo "▶  Running seed..."
node /app/seed.mjs
echo "   Seed complete."

# ── Start API server ──────────────────────────────────────────────────────────
echo "▶  Starting Violet Enterprise..."
exec node --enable-source-maps /app/dist/index.mjs
