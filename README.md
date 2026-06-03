# Convertly

Clean file converter system.

This repository now contains a deployable converter setup:

- `frontend/` — Cloudflare Pages static UI
- `backend/` — Node/Express conversion backend
- Supabase — storage, jobs and output history

## Frontend deployment on Cloudflare Pages

Use these settings:

```txt
Root directory: frontend
Build command: npm run build
Output directory: out
```

Cloudflare environment variables:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://emnswbljofmtxwuhneru.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_BTqgwDPrTgf6WrzraFphEg_Esk0jKB7
NEXT_PUBLIC_BACKEND_URL=https://YOUR-BACKEND-URL.com
```

## Backend deployment

Deploy the `backend/` folder on Railway, Render, Fly.io or a VPS.

Required backend environment variables:

```txt
PORT=8787
FRONTEND_ORIGIN=https://YOUR-CLOUDFLARE-PAGES-DOMAIN.pages.dev
SUPABASE_URL=https://emnswbljofmtxwuhneru.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_SERVICE_ROLE_KEY
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in the frontend.
