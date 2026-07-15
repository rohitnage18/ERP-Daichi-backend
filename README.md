# ERP-Daichi Backend API

Express + MongoDB. All REST APIs live here.

## Setup

```bash
npm install
cp .env.example .env
# Use the same secret for JWT_SECRET (backend) and NEXTAUTH_SECRET (frontend)
```

## Database

```bash
npm run db:seed:mongo
```

## Run

| Command | Description |
|---------|-------------|
| `npm run dev` | API → http://localhost:4000 |
| `npm run build` | Compile TypeScript |
| `npm start` | Production server |

Health check: http://localhost:4000/health

## Default logins (after seed)

| Email | Password | Role |
|-------|----------|------|
| admin@xenvolt.com | password123 | Admin |
| sales@xenvolt.com | password123 | Sales |
| logistics@xenvolt.com | password123 | Logistics |

## Production (Render)

1. Set `DATABASE_URL` to MongoDB Atlas in env vars
2. Set `JWT_SECRET`, `FRONTEND_URL` (Vercel URL)
3. Configure SMTP env vars for emails (optional)

## Dealer Form Sync (ERP)

This backend syncs dealer applications from the external Daichi Dealer Form API.

Required env variables:

- `DAICHI_API_BASE_URL` (example: `https://daichi-international-backend.onrender.com/api`)
- `DAICHI_ADMIN_EMAIL`
- `DAICHI_ADMIN_PASSWORD`
- `DAICHI_SYNC_INTERVAL_MINUTES` (default 2)
- `DAICHI_SYNC_STATUS_FILTER` (default `ALL`)

Behavior:

- Scheduler starts with the API server and polls every `DAICHI_SYNC_INTERVAL_MINUTES`
- Sync is idempotent using external dealer ID + source `updatedAt`
- Dealer documents are stored as metadata only (no file bytes)

Manual trigger (for cron/ops):

- `POST /api/sync/daichi/run`
- Header: `Authorization: Bearer <CRON_SECRET>`
