# UI / UX review — 2026-11-03

Scope: website routes and shared interactions, desktop/mobile layout, Arabic/English,
light/dark themes, loading/failure/empty states, and offline entry. Code review covers
landing/auth, dashboard, accounts, new/edit/list transactions, clients/statements,
trips/profit reports, assistant/chat, settings, legal and missing-page recovery.
No real financial records were added, edited or deleted during this review.

## Implemented

- Make voice recording the primary visible entry action on the new-transaction screen,
  dashboard and navigation. Keep typed/manual entry accessible. Do not open the manual
  keyboard automatically over the voice action. Show explicit stop/analyzing states.
- Refine the forest-green palette, neutral backgrounds and restrained gold accents;
  increase muted-text contrast. Automated checks cover normal/muted text and primary
  button contrast in both website themes (at least 4.5:1).
- Replace seven tiny mobile navigation items with three frequent destinations and a
  labeled More menu. Retain every destination in the full menu. Add accessible names,
  active-page announcements, keyboard focus containment, Escape dismissal and hidden-menu
  inertness. Reset main scroll position when navigating. Use dynamic viewport height.
- Replace automatic first-visit help interruption with an inline first-account checklist.
  Keep the full help guide available. Add actionable empty-list buttons.
- Show retryable load failures separately from empty lists, retain cached data with an
  explicit warning, and avoid presenting unavailable data as a zero balance.
- Add generic mutation failure feedback where a page has no specific handler.
- Correct the landing-page explanation link: it opens the on-page steps, not sign-in.
  Fix the public mobile-menu direction and use a visible logo on light backgrounds.
- Improve phone-sized controls, input sizes, focus outlines, associated form labels,
  reduced-motion support, and missing-page/runtime-error recovery.
- Improve transaction editing: Arabic decimal input, actual calendar validation,
  source/destination account selection, correct transfer references, and a focus-managed
  edit dialog. Opening balances accept signed Arabic decimals and reject malformed
  amounts instead of silently saving zero.
- Scope floating assistant device history to its signed-in owner, wait for hydration
  before persisting/sending, honor an empty server history, and show clear-history
  failures instead of pretending deletion succeeded. Keep transfers out of the chat's
  aggregate income/expense balance summary.
- Align common sign-in strings and colors with the selected language and product identity.
- Load dashboard, forms, settings and reports as separate chunks. In the local build,
  the primary JS entry changed from about 979 kB (300 kB gzip) to about 572 kB
  (178 kB gzip); report/export libraries load with the relevant routes. This is a bundle
  measurement, not a measured end-to-end latency claim.

## Verification and boundaries

- Existing voice/offline regression tests plus new tests execute the actual edit/save
  handlers, render real list components with failed-query fixtures, and measure palette
  contrast. TypeScript checks and production build must pass before deployment.
- Public pages and their Arabic/English/theme/explanation interactions can be checked in
  the cloud browser. Authentication was stopped at the user's request; no Google password
  or OTP was handled through chat. Signed-in pages were reviewed from source and isolated
  tests, not through a completed live authenticated session.
- A physical Android/iOS device, browser microphone, expired sessions and a full live
  authenticated save/reconnect cycle remain device acceptance checks. Native source has
  the prominent voice action from the preceding change; website visual changes do not
  imply a new native APK/AAB was released.
