#!/bin/bash

echo "Memeriksa kondisi deployment..."
echo "Branch saat ini (Ref): $VERCEL_GIT_COMMIT_REF"
echo "Target PR: $VERCEL_GIT_PULL_REQUEST_TARGET_BRANCH"

# Kondisi 1 & 2: Push langsung / Merge ke branch 'main' atau 'dev'
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ] || [ "$VERCEL_GIT_COMMIT_REF" = "dev" ]; then
  echo "✅ - Push/Merge terdeteksi di branch '$VERCEL_GIT_COMMIT_REF'. Menjalankan build."
  exit 1;
fi

# If this is a PR deployment
if [[ -n "$VERCEL_GIT_PULL_REQUEST_ID" ]]; then
  BASE_BRANCH=$(curl -s \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$VERCEL_GIT_REPO_OWNER/$VERCEL_GIT_REPO_SLUG/pulls/$VERCEL_GIT_PULL_REQUEST_ID" \
    | jq -r '.base.ref')

  if [[ "$BASE_BRANCH" == "dev" ]]; then
    exit 1
  fi
fi

# Jika tidak memenuhi kondisi di atas, batalkan build
echo "🛑 - Deployment dibatalkan. Hanya memproses branch main, dev, atau PR ke dev."
exit 0;

