# Convertly Supabase Backend Flow

This version makes **all conversions go through the backend**.

## Architecture

Frontend on Cloudflare:
- uploads file to Supabase Storage
- creates row in `convertly_jobs`
- calls backend `/jobs/:id/process`
- watches job status
- downloads output from Supabase

Backend:
- downloads source from Supabase Storage
- converts with FFmpeg / LibreOffice / Poppler / Sharp / 7zip
- uploads result to `convertly-outputs`
- updates job status

## Supabase

URL:

```txt
https://emnswbljofmtxwuhneru.supabase.co
```

Publishable key is already in `frontend/.env.example`.

You must add the **service role key** manually to:

```txt
backend/.env
```

as:

```txt
SUPABASE_SERVICE_ROLE_KEY=...
```

Never put service role key in the frontend.

## Local run

Terminal 1:

```bash
cd backend
cp .env.example .env
# edit .env and add SUPABASE_SERVICE_ROLE_KEY
./start.sh
```

Terminal 2:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Cloudflare

Deploy only `frontend`.

Build command:

```bash
npm run build
```

Output directory:

```bash
out
```

Cloudflare environment variables:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://emnswbljofmtxwuhneru.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_BTqgwDPrTgf6WrzraFphEg_Esk0jKB7
NEXT_PUBLIC_BACKEND_URL=https://YOUR-BACKEND-DOMAIN.com
```

## Backend hosting

Use Railway/Fly.io/Render/VPS with Docker.
