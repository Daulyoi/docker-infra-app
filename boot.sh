#!/usr/bin/env bash
set -euo pipefail

# Ensure script is run from project root
cd "$(dirname "$0")"

NETWORK="notes-network"
docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK"

echo "[INFO] Stopping any existing containers..."
docker rm -f notes-db notes-redis notes-backend notes-frontend notes-worker >/dev/null 2>&1 || true

echo "[INFO] Starting PostgreSQL..."
docker run -d \
    --name notes-db \
    --network "$NETWORK" \
    --network-alias db \
    -p 127.0.0.1:5432:5432 \
    -e POSTGRES_USER=notes \
    -e POSTGRES_PASSWORD=notespass \
    -e POSTGRES_DB=notesdb \
    --volume postgres-data:/var/lib/postgresql \
    --volume "$(pwd)/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
    --restart unless-stopped \
    postgres:18

echo "[INFO] Starting Redis..."
docker run -d \
    --name notes-redis \
    --network "$NETWORK" \
    --network-alias cache \
    -p 127.0.0.1:6379:6379 \
    --restart unless-stopped \
    redis:8.2

echo "[INFO] Starting Backend..."
docker run -d \
    --name notes-backend \
    --network "$NETWORK" \
    -p 127.0.0.1:3000:3000 \
    -e DB_HOST=db \
    -e REDIS_HOST=cache \
    --restart unless-stopped \
    backend-image

echo "[INFO] Starting Frontend..."
docker run -d \
    --name notes-frontend \
    -p 127.0.0.1:8080:80 \
    --network "$NETWORK" \
    --restart unless-stopped \
    frontend-image

echo "[INFO] Starting Worker..."
docker run -d \
    --name notes-worker \
    --network "$NETWORK" \
    -e DB_HOST=db \
    --restart unless-stopped \
    worker-image

echo "[INFO] All services booted successfully."
