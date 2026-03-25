# External Integrations

## Cardanoscan Provider

**File:** `src/provider/cardanoscan.ts`

On-chain transaction queries to confirm built transactions.

- `getTransactionList(options)` -- Fetch transactions for an address

**URLs:**
- Mainnet: `https://api.cardanoscan.io/api/v1`
- Preview: `https://api-preview.cardanoscan.io/api/v1`

**Auth:** Header `apiKey: {CARDANOSCAN_API_KEY}`

**Note:** Use `address.toHex()` (not bech32) for Cardanoscan API calls.

## Liqwid V2 Provider

**Package:** `@minswap/felis-lending-market`

Lending protocol integration for supply, borrow, repay, and withdraw operations.

Key methods:
- `LiqwidProviderV2.Transactions.borrow()` -- Build borrow transaction
- `LiqwidProviderV2.Data.markets()` -- Fetch market APY data
- `LiqwidProviderV2.Data.loansForUser()` -- Fetch active loans

Legacy `LiqwidProvider` (V1) used for supply transactions.

## Minswap Aggregator

**File:** `src/provider/minswap-aggregator.ts`

Price estimation for swaps.

- `estimate(request)` -- GET swap output amount

**URLs:**
- Mainnet: `https://aggr-monorepo-mainnet-prod.minswap.org/aggregator/estimate`
- Preview: `https://aggr.dev-3.minswap.org/aggregator/estimate`

Used to estimate SHORT borrow amounts: `amount_in * shortLeverage` ADA worth of asset B.

## Felis Workspace Libraries

Core Cardano and trading infrastructure from the monorepo:

| Package | Purpose |
|---------|---------|
| `@minswap/felis-ledger-core` | Address, Asset, Utxo, NetworkEnvironment |
| `@minswap/felis-ledger-utils` | RustModule, Duration, Result, crypto |
| `@minswap/felis-tx-builder` | TxBuilder, CoinSelectionAlgorithm |
| `@minswap/felis-build-tx` | DEXOrderTransaction for Minswap orders |
| `@minswap/felis-dex-v2` | OrderV2, DexVersion, swap direction enums |
| `@minswap/felis-lending-market` | LiqwidProviderV2 for Liqwid lending |
