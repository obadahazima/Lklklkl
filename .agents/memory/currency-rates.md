---
name: Currency rate convention
description: How exchange rates are stored, displayed, and corrected in Qayd AI
---

## Auto-refresh System
- Server: `GET /api/exchange-rates` (authenticated, requires Clerk session cookie)
- Server cache TTL: 10 minutes (down from 1 hour)
- Web context: fetches on mount + `visibilitychange` → when user returns to tab
- Mobile context: fetches on mount + `AppState "active"` → when app comes to foreground
- Falls back to `manualRates` silently on 401 (unauthenticated) or network error
- Both dashboards get `effectiveRates` from `useSettings()` context — no local computation

## Convention
All rates stored as `rates[CODE] = X` meaning "how many AED per 1 unit of CODE".
- AED is always 1 (anchor currency).
- `toAed(amount, currency) = amount * rates[currency]`
- `fromAed(aedAmt, primary) = aedAmt / rates[primary]`

## Weak Currencies (CURRENCY_UNITS)
Defined in both `settings-context.tsx` (web) and `SettingsContext.tsx` (mobile):
```
SYP: 10,000  → display "10,000 SYP = X AED" (rate ~0.000282)
LBP: 100,000 → display "100,000 LBP = X AED" (rate ~0.000041)
IQD: 1,000   → display "1,000 IQD = X AED"   (rate ~0.00281)
```
Helpers: `getRateUnit(code)`, `rateToDisplay(code, rate)`, `displayToRate(code, displayVal)`

## Auto-correction (correctRates)
On app load, if stored SYP > 0.01 it's reset to 0.000282 (old bug had 0.033).
Same for LBP > 0.001 → 0.000041.

## Settings UI
- Web (`settings.tsx`): always shows "N CODE = X AED", filter `currencies.filter(c => c !== "AED")`
- Mobile (`settings.tsx`): same — filter `c !== "AED"`, use CURRENCY_UNITS helpers
- Both: `handleSaveRates` always forces `AED: 1`

**Why:** Old code showed rates relative to primaryCurrency which was confusing & had a bug where "1 AED = X AED" appeared. Now always vs AED.
