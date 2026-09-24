#!/bin/bash
set -eou pipefail

PG_VER=18
REDIS_VER=8.2

echo "[INFO] Destroying services..."
docker rm -f notes-backend
docker rm -f notes-frontend
docker rm -f notes-worker
docker rm -f notes-db
docker rm -f notes-redis
echo "[INFO] Services destroyed."

echo "[INFO] Destroying images..."
docker rmi backend-image frontend-image worker-image postgres:$PG_VER redis:$REDIS_VER
echo "[INFO] Images destroyed."
