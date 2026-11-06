# Credit accounts

Credit opening balance represents debt: entering either 500 or -500 saves -500. The form shows the exact signed value before saving. Ordinary accounts retain signed balances. Existing accounts are not automatically rewritten by the migration or by a PATCH that omits initialBalance.

An optional total credit limit uses the account currency. A 2000 limit and -500 balance show 1500 available. Spending reduces availability; a repayment recorded as a transfer into the credit account increases it. An over-limit balance shows zero available and a warning; recording actual spending is still allowed. The limit does not add assets to totals. Switching away from credit clears the limit.

Deploy the API before the clients: startup adds the nullable accounts.credit_limit column with an idempotent advisory-locked migration before accepting traffic. No existing balances are changed. This feature models a single total credit limit, not a separate cash-advance facility, interest, or billing cycles.
