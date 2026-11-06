# Receivables (الذمم)

The ordinary entry UI offers income (إيرادات), expense (مصروفات) and account transfer. Historical payment/receipt records remain stored; labels and filters group them with expense/income. New writes canonicalize those aliases.

Receivables are separate ledger records (`type=receivable`). A credit sale recognizes revenue once and does not change a cash account. Opening debts and prior loans do not recognize revenue or move cash; loan_now decreases the selected funding account without recognizing an expense. Ordinary account balances retain their historical status behavior; this migration does not reinterpret older pending records as debts.

An incoming transaction with a named client automatically allocates to that client's open receivables in the same currency by date then ID. Allocation amounts use integer cents. A 150 collection against 100 then 200 closes the first and leaves 150 on the second. Collections increase cash and reduce receivables; allocated principal is excluded from revenue. Overpayment and unmatched currencies require review. The dedicated collection form cannot silently turn an unmatched payment into new income. A user with debts in several currencies must specify the collection currency; no receivable conversion is inferred.

All allocations and incoming cash records commit atomically under the per-user advisory lock. Offline operations retain request UUIDs, so retries return the same collection rather than paying twice. Outstanding amounts derive from persisted links, not a mutable paid flag. Deleting a collection reopens the balances; a receivable with collections cannot be deleted. Linked financial edits require deleting/re-recording the collection; client records with receivable history cannot be deleted. Backup/restore remaps allocation IDs and validates references before commit.

The web and native receivables screens share the offline outbox and have a separate persisted debt draft. Offline balances exclude unsynced operations until the server validates them. Voice collection uses the existing review flow: incoming money plus resolved client/account/currency is allocated by the server. New debt registration uses the dedicated receivables form to choose its origin; ambiguous statements about unpaid money are not saved as cash income. Chat also reports actual remaining receivables after collection; linked financial edits/deletion are routed to the protected transaction UI.

Dashboard/trip revenue uses accrual recognition (including credit sales); account balances remain actual funds. No past expense is inferred to be a receivable, and no old balance is backfilled.

Deploy API first. Startup adds nullable debt_kind, due_date and allocations columns with an idempotent transaction and advisory lock. Existing records retain null metadata. An installed native app requires a new APK/AAB release.
