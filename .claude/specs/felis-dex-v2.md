# @minswap/felis-dex-v2

DEX V2 protocol types and calculations. Depends on `felis-ledger-core`, `felis-ledger-utils`.

**Location:** `packages/minswap-dex-v2`

## What's here
- `OrderV2` — 11 step types (SWAP_EXACT_IN, STOP_LOSS, OCO, DEPOSIT, WITHDRAW, PARTIAL_SWAP, MULTI_ROUTING, etc.)
- `PoolV2` — liquidity pool state, reserves, fees (denominator=10000)
- `DexV2Calculation` — swap/deposit/withdraw math, price impact, multi-routing
- `OrderV2Datum` — Plutus serialization (fromPlutusJson/toPlutusJson, fromDataHex/toDataHex)
- Config helpers: `getDexV2Configs()`, `getDexV2PoolAddresses()`, `buildDexV2OrderAddress()`
- `BATCHER_FEE_DEX_V2` — fee schedule per step type
