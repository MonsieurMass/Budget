#!/bin/bash
set -e
# Deploy Budget — app finance personnelle
# Usage: bash deploy-budget.sh

PROJECT_DIR=~/Documents/Playground/ossema-budget-future
TOKEN="${VERCEL_TOKEN:?Définir la variable VERCEL_TOKEN avant de lancer ce script}"

echo "=== Build Budget ==="
cd "$PROJECT_DIR"
pkill -f "vite" 2>/dev/null || true
sleep 1
npm run build

echo "=== Deploy Budget → Vercel ==="
cd "$PROJECT_DIR/dist"
VERCEL_TOKEN="$TOKEN" npx vercel --prod --yes 2>&1 | tee "$PROJECT_DIR/deploy-budget.log"

echo "=== Done ==="
