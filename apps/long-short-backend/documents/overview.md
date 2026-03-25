# Long-Short Backend Overview

A **Fastify API** that orchestrates leveraged long/short positions on Cardano by coordinating DEX swaps (Minswap) with lending (Liqwid) through a multi-step order state machine.

## Architecture

```
src/
├── cmd/run-api.ts              # Entry point
├── api/
│   ├── server.ts               # Fastify setup & route registration
│   ├── routes/                  # position, liqwid, metadata endpoints
│   ├── schemas.ts              # TypeBox request/response schemas
│   ├── helper.ts               # CIP-8 authentication
│   └── state-machine.ts        # Order building & waiting logic (CORE)
├── config/market.ts            # Market config loading & caching
├── database/                   # Kysely types, Postgres, Redis
├── provider/                   # Cardanoscan, Kupo, Minswap Aggregator
├── repository/                 # Position, Order, MarketConfig repos
├── services/position-service.ts # Business logic orchestration
└── utils/                      # Logger, CIP-8 signature, helpers
```

## Startup Sequence

Entry point: `src/cmd/run-api.ts`

1. Validate environment: `DATABASE_URL`, `CARDANOSCAN_API_KEY`, `NETWORK`
2. Parse network: `"mainnet"` -> MAINNET; else -> TESTNET_PREVIEW
3. Load WASM: `await RustModule.load()` (required for crypto operations)
4. Connect to PostgreSQL via `newKyselyClient(DATABASE_URL)`
5. Load market configs: `loadMarketConfigs(db)` -> in-memory cache
6. Initialize providers: CardanoscanProvider, MinswapAggregatorProvider
7. Start Fastify server: `createApiServer({ port, host, db, networkEnv, cardanoscanProvider })`

Start commands:

```bash
npm start          # node --import tsx src/cmd/run-api.ts
npm run dev        # node --import tsx --watch src/cmd/run-api.ts
```
