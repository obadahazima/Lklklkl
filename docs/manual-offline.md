# Manual entry and offline synchronization

## Behavior

- Manual entry does not require AI. The amount is the first field; Arabic/Persian digits,
  thousands separators and decimal amounts are accepted. Invalid calendar dates, nonpositive
  amounts, excess decimal precision and invalid transfers are rejected before queuing and by the API.
- Drafts autosave per signed-in user. Save & add another retains the account, currency, type
  and settlement choice; Ctrl/Cmd+Enter provides the same shortcut on the website.
- A save is acknowledged only after the transaction is durably stored on this device.
  The UI labels it **pending sync** until the server acknowledges it. Financial balances
  are not optimistically increased/decreased by unsynced records.
- Browser storage uses IndexedDB read/write transactions; native storage uses serialized
  AsyncStorage writes. Storage/quota failures keep the form open and are not reported as success.
- A local snapshot retains accounts, clients, trips, preferences and at most 200 recent transactions.
  Existing entities must be downloaded online once. Creating a new account/client/trip still needs internet.
- The service worker precaches the build's hashed JS/CSS and public shell, never authenticated API data.
  Missing JS/CSS gets a 503 response, never HTML disguised as a script.
- A cold browser start without internet opens the local entry form without waiting for Clerk.
  `/offline` also opens that form explicitly. It cannot upload until the normal signed-in app resumes.
  Signing out clears the active offline identity while retaining that user's separate pending queue.
- Native Clerk resource caching supports offline reopening after an online sign-in. This is an
  experimental SDK feature and still needs physical-device testing with expired sessions.
- Version 2026-11-01 updates the privacy disclosure about local data. Sign in online and accept
  the updated notice once before relying on the new offline mode.

## Reliable writes

Each draft has a UUID. The same UUID is preserved when a queued request is retried after
an interrupted connection, timeout or lost response. The API checks `X-Offline-Owner`
against the authenticated user and stores a durable receipt scoped to `(user_id, request_id)`.
PostgreSQL transaction locks serialize competing requests. Transaction creation and receipt
creation commit or roll back together. Replaying a matching request returns its original response;
reusing its key for different data returns 409. Separate drafts intentionally have different ids.

400/404/422 rejections remain visible and can be recovered into an editable draft. A network
failure or 409 conflict is never silently discarded, because a write may already have committed.
Authentication and temporary server failures wait for reconnection/re-authentication.

## Server rollout

Deploy the API before the clients. API startup performs an additive, idempotent migration
for `transaction_receipts` before listening. The database role needs CREATE TABLE permission;
the Drizzle schema also declares this table for schema-managed deployments. Startup fails clearly
if initialization is unavailable rather than accepting writes without deduplication. No existing
transaction columns are altered. Account deletion removes receipts and the device-local record
for that account. Other users' pending device queues are retained.

## Validation

```sh
pnpm run test
pnpm run typecheck
pnpm --filter @workspace/finance-app run build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/finance-mobile exec expo export --platform android --output-dir /tmp/billy-manual-android
```

Regression tests exercise production validation, component submit handlers, the draft hook,
the native storage adapter, restart/retry/user-switch behavior, HTTP receipt replay/rollback and
service-worker asset selection. PostgreSQL/authentication are mocked; these tests do not use
production records or prove a live database migration. Expo export validates JavaScript/Hermes,
not a signed APK/AAB. The legacy all-workspace build also expects Replit deployment-domain
environment variables for its Expo Go hosting script; the Android export does not.

Before release, test on a real device: sign in and load references, disconnect, save two entries,
restart, reconnect and verify both appear exactly once; simulate a lost HTTP acknowledgement;
switch users; reject a stale account reference; verify draft recovery and storage-full errors.
Do not clear app/browser storage before pending transactions finish syncing. Local drafts/queues
are device-local storage, not a replacement for cloud backups or an app-level encrypted vault.
