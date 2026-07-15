# Daichi AgriFlow — Backend API

Express + Prisma. All REST APIs live here.

## Setup

```bash
# From repo root (erp-daichi/)
npm install

cp .env.example .env
cp ../frontend/.env.example ../frontend/.env
# Use the same secret for JWT_SECRET (backend) and NEXTAUTH_SECRET (frontend)
```

## Database

```bash
npm run db:push
npm run db:seed:products
npm run db:seed:field
```

(Run from repo root, or `npm run db:push` from this folder.)

## Run

| Command (repo root) | Description |
|---------------------|-------------|
| `npm run dev` | API + UI together |
| `npm run dev:backend` | API only → http://localhost:4000 |
| `npm run dev:frontend` | UI only → http://localhost:3000 |

Health check: http://localhost:4000/health

## Default logins (after seed)

| Email | Password | Role |
|-------|----------|------|
| admin@xenvolt.com | password123 | Admin |
| sales@xenvolt.com | password123 | Sales |
| logistics@xenvolt.com | password123 | Logistics |

## Production

1. Set `DATABASE_URL` to PostgreSQL in `.env`
2. Set `NEXT_PUBLIC_API_URL` in `frontend/.env`
3. Configure SMTP in `.env` for emails

## Dealer Form Sync (ERP)

This backend can sync dealer applications from the external Daichi Dealer Form API.

Required `.env` variables:

- `DAICHI_API_BASE_URL` (example: `https://daichi-international-backend.onrender.com/api`)
- `DAICHI_ADMIN_EMAIL`
- `DAICHI_ADMIN_PASSWORD`
- `DAICHI_SYNC_INTERVAL_MINUTES` (default 15)
- `DAICHI_SYNC_STATUS_FILTER` (default `SUBMITTED`)

Behavior:

- Scheduler starts with the API server and polls every `DAICHI_SYNC_INTERVAL_MINUTES`
- Sync is idempotent using external dealer ID + source `updatedAt`
- Dealer documents are stored as metadata only (no file bytes)

Manual trigger (for cron/ops):

- `POST /api/sync/daichi/run`
- Header: `Authorization: Bearer <CRON_SECRET>`
