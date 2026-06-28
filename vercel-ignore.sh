#!/bin/bash

echo "Memeriksa kondisi deployment..."
echo "Branch saat ini (Ref): $VERCEL_GIT_COMMIT_REF"
echo "Target PR: $VERCEL_GIT_PULL_REQUEST_TARGET_BRANCH"

# Kondisi 1 & 2: Push langsung / Merge ke branch 'main' atau 'dev'
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ] || [ "$VERCEL_GIT_COMMIT_REF" = "dev" ]; then
  echo "✅ - Push/Merge terdeteksi di branch '$VERCEL_GIT_COMMIT_REF'. Menjalankan build."
  exit 1;

# Kondisi 3: Pull Request yang ditujukan ke branch 'dev'
elif [ "$VERCEL_GIT_PULL_REQUEST_TARGET_BRANCH" = "dev" ]; then
  echo "✅ - Pull Request menuju branch 'dev' terdeteksi. Menjalankan build."
  exit 1;

# Jika tidak memenuhi kondisi di atas, batalkan build
else
  echo "🛑 - Deployment dibatalkan. Hanya memproses branch main, dev, atau PR ke dev."
  exit 0;
fi
