#!/usr/bin/env bash
set -e

if ! command -v docker >/dev/null; then
  echo "Docker is required. Install it first: https://docs.docker.com/engine/install/"
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env not found. Copy .env.example to .env (or use the setup wizard) and fill in your values first."
  exit 1
fi

echo "Pulling the CDM image and starting..."
docker compose pull
docker compose up -d

echo "Waiting for the database to be healthy..."
until [ "$(docker compose ps -q db | xargs docker inspect -f '{{.State.Health.Status}}')" = "healthy" ]; do
  sleep 2
done

echo "Pushing the schema..."
docker compose exec -T app npx prisma db push --skip-generate

DOMAIN=$(grep '^NEXTAUTH_URL=' .env | cut -d '=' -f2- | tr -d '"')
PORT=$(grep '^APP_PORT=' .env | cut -d '=' -f2-)
echo "Done. CDM should be reachable at ${DOMAIN:-<your domain>}"
echo "Local check: http://localhost:${PORT:-3000}"
