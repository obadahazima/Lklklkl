---
name: Clerk Auth Setup
description: Clerk Auth with Google OAuth is configured. All API routes require auth. userId column added to all DB tables.
---

## Setup Done
- Clerk provisioned via `setupClerkWhitelabelAuth()` — keys auto-set in secrets
- All DB tables have `user_id TEXT NOT NULL DEFAULT ''` column (migration already applied)
- All API routes use `requireAuth` middleware → filter by `req.userId`
- Frontend: `ClerkProvider` in App.tsx wraps everything; `SettingsProvider` is inside it

## Important Patterns
- `requireAuth` middleware is in `artifacts/api-server/src/middlewares/requireAuth.ts`
- Every route uses `router.use(requireAuth)` at the top
- All DB queries filter by `eq(table.userId, req.userId)` 
- New records always include `userId: req.userId` in INSERT

## Frontend Structure
- "/" → landing page (signed out) or dashboard (signed in)  
- "/sign-in/*?" and "/sign-up/*?" → Clerk pages
- All other routes wrapped in `<ProtectedRoute>` → redirects to "/" if signed out
- `ProtectedRoute` wraps children in `<Layout>` only when signed in

## Tailwind v4 Clerk CSS
- Added `@layer theme, base, clerk, components, utilities;` before `@import "tailwindcss"` in index.css
- Added `@import '@clerk/themes/shadcn.css'` after
- `tailwindcss({ optimize: false })` set in vite.config.ts

**Why:** Tailwind v4 @layer ordering causes Clerk styles to break in prod without the layer declaration and optimize:false.
