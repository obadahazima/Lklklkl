# Billy Bills AI

Voice-first personal finance app: accounts, transactions, clients, trips, multi-currency, with an AI assistant (Gemini) that records and edits entries from voice or text.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env (API): `DATABASE_URL`, `GEMINI_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `ALLOWED_ORIGINS` (set in production)
- Mobile env: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_WEB_URL` (website URL for privacy/terms links)

## Where things live

- `artifacts/api-server` — Express API (Railway). `routes/account.ts` = `DELETE /api/me` (account deletion)
- `artifacts/finance-app` — web (Vite/React, Vercel). Legal pages in `src/pages/legal.tsx` (fill in the TODO constants)
- `artifacts/finance-mobile` — Expo React Native app
- `lib/db` — Drizzle schema; `lib/api-spec` — OpenAPI source of truth

## Gotchas

- AI delete tools require `confirmed: true` (enforced server-side in `routes/ai.ts`).
- Adding a new table with `user_id`? Also delete its rows in `routes/account.ts`.
