# @minswap/felis-build-tx

DEX transaction builder. Depends on `felis-ledger-core`, `felis-ledger-utils`, `felis-tx-builder`, `felis-dex-v2`.

**Location:** `packages/minswap-build-tx`

## What's here
- `DEXOrderTransaction.createBulkOrdersTx()` — main entry point, batches multiple DEX orders into one tx
- Order option types for each V2 step (SwapExactIn, SwapExactOut, Deposit, Withdraw, etc.)
- `Djed` — stablecoin protocol (mint/rate calculations)
- `MetadataMessage` — transaction label constants (DEX_MARKET_ORDER, DEX_LIMIT_ORDER, etc.)
