# Opening balance snapshots and historical transactions

An account can store an optional openingBalanceDate (local YYYY-MM-DD). This date describes the entered balance; it never automatically excludes transactions. Existing accounts retain null dates, and existing transactions retain false flags.

Each transaction can explicitly mark includedInOpeningBalance. When true, the source/account cash effect is skipped. A transfer has a separate destinationIncludedInOpeningBalance flag for its destination, since the two entered balances may reflect different histories. Financial reports, revenue/expense classification, dates and receivable allocation links remain intact. Changing a collection's cash-inclusion flag does not repay or reopen any debt.

The web supports account dates and inclusion choices in manual entry, voice review, transaction editing, cold offline entry and receivable collections. Native source supports the same forms and a creation date for accounts. Inclusion choices persist in drafts/outbox, are sent as booleans and survive backup/restore. Resetting an entry or parsing new speech clears old choices. Backdated transactions with a known snapshot date display an older-transaction hint. Accounts without dates still allow explicit inclusion, avoiding guesses about historical balances.

To fix a previously entered expense that was already reflected in the entered bank balance: edit that transaction, select the inclusion checkbox for that bank, and save. Do not delete the historical expense or add a fake income.

Deploy the API first. Startup adds nullable accounts.opening_balance_date and non-null false-default transaction inclusion flags in an idempotent, advisory-locked migration. No old record is reclassified or excluded automatically. AI account context uses the same flags; chat creation asks about a backdated source snapshot instead of guessing.
