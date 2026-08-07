# Violet Enterprise

A commercial cloud POS, inventory, and business management SaaS platform. Businesses register, manage products, run point-of-sale transactions, track inventory and customers, view reports, and manage employees. Includes a Super Admin portal for managing tenants, subscriptions, and platform analytics.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/violet run dev` — run the frontend (uses PORT env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, Framer Motion, Recharts, wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (v3), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Auth: Session token (scrypt password hashing, bearer token, sessions table)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — DB tables (tenants, users, sessions, plans, products, categories, customers, sales, employees, suppliers, settings)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — Bearer token auth middleware
- `artifacts/api-server/src/lib/crypto.ts` — scrypt password hashing
- `artifacts/violet/src/` — React frontend

## Architecture decisions

- Multi-tenant: every DB record has a `tenant_id`; auth middleware enforces tenant isolation
- Auth is session-token based (not JWT): sessions stored in `sessions` table, tokens sent as `Authorization: Bearer <token>`, stored in `localStorage` as `violet_token`
- Orval v8 generates Zod v3 — **do not use `format: email` or `type: integer`** in the OpenAPI spec (generates Zod v4 syntax); use `type: string` and `type: number` instead
- Free tier = one-time upfront purchase, no monthly fee, simple limits (500 products, 500 customers, 2 users, 1 branch)

## Product

- Public landing page with pricing tiers (Free one-time / Starter / Professional / Enterprise)
- Business registration → dashboard → POS → inventory → customers → employees → suppliers → reports → settings
- Super Admin portal at `/admin` (role: super_admin)

## User preferences

- Free tier: simple, for single small stores, one-time upfront cost (no monthly fee). Only basic POS + inventory + reports. Lock employees, multi-branch, advanced features behind paid plans.

## Gotchas

- After any OpenAPI spec change: run `pnpm --filter @workspace/api-spec run codegen` then `pnpm run typecheck:libs`
- After any `lib/*` schema change: run `pnpm run typecheck:libs` before checking artifact packages
- Do not use `type: integer` or `format: email` in openapi.yaml — use `type: number` and `type: string`

## Credentials (dev seed)

- Super admin: `admin@violet.app` / `admin123456`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
