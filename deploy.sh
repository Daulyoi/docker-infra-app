#!/bin/bash
set -eou pipefail
# Deploy script for the generated project


if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
    echo "[ERROR] Usage: $0 <pem location> <server>"
    exit 1
fi

pem_location="$1"

if [ ! -f "$pem_location" ]; then
    echo "[ERROR] PEM file not found: $pem_location"
    exit 1
fi

server="$2"

echo "[INFO] Deploying..."

# Build the project
docker compose build

# Push the project to dockerhub
docker compose push

# Ship the compose file to the server
scp -i "$pem_location" docker-compose.yaml ec2-user@"$server":~/

# Pull the latest version of the compose on the server
ssh -i "$pem_location" ec2-user@"$server" "docker compose pull"

# Restart the compose on the server
ssh -i "$pem_location" ec2-user@"$server" "docker compose up -d"

# Check the status of the compose on the server
ssh -i "$pem_location" ec2-user@"$server" "docker compose ps"
# Wait for the compose to be ready
ssh -i "$pem_location" ec2-user@"$server" "docker compose ps | grep 'Up'"
while [ "$(ssh -i "$pem_location" ec2-user@"$server" "docker compose ps | grep 'Up' | wc -l")" -eq 0 ]; do
    echo "[INFO] Waiting for compose to be ready..."
    sleep 5
done

echo "[INFO] Compose is ready!"

echo "[INFO] Deploy complete!"
