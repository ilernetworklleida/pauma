#!/usr/bin/env bash
# deploy.sh — maluap
# Dominio destino: maluap.es
set -euo pipefail

DOMAIN="maluap.es"
REMOTE_USER="u862342697"
REMOTE_HOST="185.97.147.162"
REMOTE_PORT="65002"
REMOTE_PATH="/home/${REMOTE_USER}/domains/${DOMAIN}/public_html/"
LOCAL_PATH="./"

rsync -avz --delete \
  --exclude '.git' \
  --exclude '.gitignore' \
  --exclude 'node_modules' \
  --exclude '.env' --exclude '.env.*' \
  --exclude '*.md' \
  --exclude 'deploy.sh' \
  --exclude '.vscode' --exclude '.idea' \
  --exclude 'composer.lock' \
  --exclude 'backup-*' \
  -e "ssh -p ${REMOTE_PORT}" \
  "${LOCAL_PATH}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

echo "[OK] Deploy -> https://${DOMAIN}"
