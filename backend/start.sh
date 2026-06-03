#!/bin/bash
set -e
echo "Convertly Supabase Backend"
if command -v brew >/dev/null 2>&1; then
  command -v ffmpeg >/dev/null 2>&1 || brew install ffmpeg
  command -v pdftoppm >/dev/null 2>&1 || brew install poppler
  command -v soffice >/dev/null 2>&1 || brew install --cask libreoffice
  command -v 7z >/dev/null 2>&1 || brew install p7zip
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Edit backend/.env and add SUPABASE_SERVICE_ROLE_KEY before production."
fi
npm install
npm run check || true
npm run dev
