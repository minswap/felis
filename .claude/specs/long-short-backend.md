# long-short-backend

Leveraged long/short trading API. Integrates Minswap DEX with Liqwid lending.

**Location:** `apps/long-short-backend`

## Key files
```
src/api/state-machine.ts      -- Build/waiting functions per order type
src/services/position-service.ts -- Core business logic (create, buildTx, close)
src/api/routes/position.ts    -- API route handlers
src/api/schemas.ts            -- TypeBox request/response schemas
src/api/helper.ts             -- CIP-8 authentication
src/repository/               -- Database access layer
src/provider/cardanoscan.ts   -- On-chain transaction search
src/config/market.ts          -- Market config cache
src/cmd/run-api.ts            -- Entry point
```

## Order state machine (non-obvious flow)
**Open LONG:** LONG_BUY → LONG_SUPPLY → LONG_BORROW → LONG_BUY_MORE
**Close LONG:** LONG_SELL → LONG_REPAY → LONG_WITHDRAW → LONG_SELL_ALL

Each order goes through: build tx → user signs → confirm on chain → wait for output spend → next order.

## Gotchas
- LONG_SUPPLY uses LiqwidProvider V1, all other Liqwid ops use V2
- `amount_borrow = amount_in * (leverage - 1) + 4_000_000n` (fee buffer)
- Check waiting orders BEFORE finding unhandled orders in buildTx flow
- `built_valid_to` determines when to rebuild an expired transaction
