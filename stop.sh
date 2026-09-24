#!/bin/bash
set -eou pipefail

echo "[INFO] Stopping services..."
docker stop notes-backend
docker stop notes-frontend
docker stop notes-worker
docker stop notes-db
docker stop notes-redis
echo "[INFO] Services stopped successfully."
