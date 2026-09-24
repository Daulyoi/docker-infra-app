#!/bin/bash
set -euo pipefail

# PULL POSTGRES AND REDIS IMAGES
docker pull postgres:18 &
docker pull redis:8.2 &
wait

# CHECK IF NETWORK EXISTS
NETWORK=notes-network
docker network inspect $NETWORK >/dev/null 2>&1 \
  || docker network create $NETWORK

docker build --pull --no-cache -t frontend-image ./frontend & # BUILD FRONTEND IMAGE
docker build --pull --no-cache -t backend-image ./backend & # BUILD BACKEND IMAGE
docker build --pull --no-cache -t worker-image ./worker & # BUILD WORKER IMAGE
wait

echo "Build completed successfully."
