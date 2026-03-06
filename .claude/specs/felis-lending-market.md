# @minswap/felis-lending-market

Liqwid Finance lending protocol integration. Depends on `felis-ledger-core`, `felis-ledger-utils`.

**Location:** `packages/minswap-lending-market`

## What's here
- `LiqwidProviderV2` — namespace wrapping Liqwid V2 GraphQL API

### Namespaces
- `Transactions` — supply, withdraw, borrow, modifyBorrow, repayLoan, submit (returns CBOR hex)
- `Calculations` — loan health factor, supply/withdraw caps, net APY
- `Data` — query markets, loans, user loans, yield earned
- `signTx()` / `getTxHash()` — sign and hash Liqwid transactions

## Gotchas
- Liqwid V2 API uses `number` for amounts (not `bigint` like the rest of the codebase)
- `MarketId` is a string like "Ada", "MIN", "DJED" (not the market_id from our DB)
- `loanUtxoId` format is `"{txHash}-{outputIndex}"` (dash separator, not hash)
- API endpoints differ per network: `v2.api.liqwid.finance` (mainnet), `v2.api.preprod.liqwid.dev` (preprod), `v2.api.preview.liqwid.dev` (preview)
