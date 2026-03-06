# Long-Short Backend

Cardano leveraged long/short trading backend. Users supply collateral, borrow via [Liqwid](https://liqwid.finance/) lending, and swap via [Minswap](https://minswap.org/) DEX to create leveraged positions.

## Tech Stack

- **Fastify** - HTTP server
- **Kysely** - PostgreSQL query builder (type-safe)
- **TypeBox** - Request/response schema validation
- **CIP-8** - Cardano message signing for authentication
- **Workspace packages**: `@repo/felis-ledger-core`, `@repo/felis-ledger-utils`, `@repo/felis-tx-builder`, `@repo/minswap-build-tx`, `@repo/minswap-lending-market`

## Quick Start

### Prerequisites

- PostgreSQL (Docker or local)
- Node.js >= 22
- pnpm 9+

### Setup

```bash
# From monorepo root
pnpm install
pnpm build

# Set environment variables (see below)

# Run migrations
pnpm --filter=long-short-backend run run:migrate

# Seed market config
pnpm --filter=long-short-backend run run:seed

# Start dev server
pnpm --filter=long-short-backend dev
```

### Docker (PostgreSQL + Redis)

```bash
# From monorepo root
docker compose up -d
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `CARDANOSCAN_API_KEY` | Yes | - | Cardanoscan API key |
| `NETWORK` | No | `mainnet` | `mainnet` or `testnet_preview` |
| `API_PORT` | No | `9999` | HTTP server port |
| `API_HOST` | No | `0.0.0.0` | HTTP server host |

## Database Schema

Three tables: `position`, `order`, `market_config`.

### position

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `market_id` | varchar | Market identifier (e.g. `ADA-NIGHT`) |
| `user_address` | varchar | Cardano bech32 address |
| `side` | varchar | `LONG` or `SHORT` |
| `status` | varchar | `PENDING` / `OPEN` / `CLOSING` / `CLOSED` |
| `amount_in` | numeric | Collateral amount (lovelace) |
| `amount_borrow` | numeric | Amount to borrow |
| `created_at` | timestamp | Position creation time |
| `closed_at` | timestamp | When position was closed (null if open) |

Constraint: only one open position per user per market.

### order

Each position has a sequence of orders that execute in order.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key (also determines execution order) |
| `position_id` | bigint | FK to position |
| `order_type` | varchar | e.g. `LONG_BUY`, `SHORT_SUPPLY` |
| `asset_in` | varchar | Input asset (nullable, filled by prior order's waiting fn) |
| `amount_in` | numeric | Input amount (nullable) |
| `asset_out` | varchar | Output asset (nullable) |
| `amount_out` | numeric | Output amount (set after confirmation) |
| `built_tx_id` | varchar | Transaction hash after local build |
| `built_valid_to` | timestamp | Transaction expiry time |
| `created_tx_id` | varchar | Transaction hash when confirmed on-chain |
| `created_tx_index` | int | Output index in confirmed tx |
| `waiting` | boolean | `true` while waiting for output to be spent |

### market_config

| Column | Type | Description |
|--------|------|-------------|
| `market_id` | varchar | PK, e.g. `ADA-NIGHT` |
| `asset_a` | varchar | Base asset (`lovelace` for ADA) |
| `asset_b` | varchar | Quote asset (policyId.tokenName) |
| `amm_lp_asset` | varchar | Minswap LP token |
| `asset_a_q_token_ticker` | varchar | Liqwid qToken ticker for A (e.g. `qAda`) |
| `asset_a_q_token_raw` | varchar | Liqwid qToken policyId for A |
| `asset_b_q_token_ticker` | varchar | Liqwid qToken ticker for B (e.g. `qNIGHT`) |
| `asset_b_q_token_raw` | varchar | Liqwid qToken policyId for B |
| `long_collateral_market_id` | varchar | Liqwid market ID for LONG collateral |
| `short_collateral_market_id` | varchar | Liqwid market ID for SHORT collateral |
| `borrow_market_id_long` | varchar | Liqwid market ID for LONG borrow |
| `borrow_market_id_short` | varchar | Liqwid market ID for SHORT borrow |
| `long_leverage` | numeric | LONG leverage multiplier (e.g. 1.5) |
| `short_leverage` | numeric | SHORT leverage multiplier (e.g. 0.5) |
| `min_collateral` | numeric | Minimum collateral in lovelace |
| `enable` | boolean | Enable/disable market |

## API Endpoints

### Authentication

All POST endpoints require CIP-8 signature authentication:

```json
{
  "data": { "market_id": "ADA-NIGHT", "..." : "..." },
  "user_address": "addr1q...",
  "witness": {
    "key": "a40101...",
    "signature": "844da2..."
  }
}
```

The client signs `JSON.stringify(data)` using their wallet's payment key (CIP-8 format). The server verifies the signature matches the `user_address`.

### Endpoints

#### `GET /health`
Health check. Returns `{ status: "ok" }`.

#### `GET /metadata`
Returns all enabled market configurations. No auth required.

#### `POST /position/create`
Create a new leveraged position.

```json
// Request data
{ "market_id": "ADA-NIGHT", "side": "SHORT", "amount_in": "600000000" }

// Response
{ "success": true, "data": { "id": "1", "market_id": "ADA-NIGHT", "side": "SHORT", "status": "PENDING", ... } }
```

#### `GET /position/get?user_address=addr1q...`
Get user's open position. No auth required.

#### `POST /position/build-tx`
Build the next transaction in the order sequence. Call repeatedly until position reaches target status.

```json
// Request data
{ "market_id": "ADA-NIGHT", "utxos": ["828258..."] }

// Response (transaction ready)
{ "success": true, "data": { "tx_raw": "84a4...", "tx_id": "abc123...", "order_type": "SHORT_SUPPLY" } }

// Response (waiting for confirmation)
{ "success": true, "data": { "waiting": true, "order_type": "SHORT_SUPPLY", "message": "..." } }
```

#### `POST /position/close`
Initiate closing of an OPEN position.

```json
// Request data
{ "market_id": "ADA-NIGHT" }
```

#### `POST /liqwid/submit`
Submit a signed Liqwid transaction.

```json
// Request data
{ "raw_tx": "84a4...", "witness_set": "a100..." }
```

## Architecture

```
src/
├── cmd/run-api.ts          # Entry point: init WASM, DB, providers, start server
├── api/
│   ├── server.ts           # Fastify setup, route registration
│   ├── routes/             # HTTP endpoint handlers
│   ├── schemas.ts          # TypeBox request/response schemas
│   ├── helper.ts           # CIP-8 authentication
│   └── state-machine.ts    # Order build & waiting logic (core)
├── config/market.ts        # Market config loading & cache
├── database/
│   ├── db.d.ts             # Generated Kysely types
│   └── postgres.ts         # DB connection
├── provider/
│   ├── cardanoscan.ts      # On-chain tx queries
│   ├── kupo.ts             # UTXO indexer
│   └── minswap-aggregator.ts  # Swap price estimation
├── repository/             # Data access layer
│   ├── position-repository.ts
│   └── order-repository.ts
├── services/
│   └── position-service.ts # Business logic orchestration
└── utils/                  # Logger, signature, hashing
```

### Layer Flow

```
HTTP Request → Route Handler → Authentication (CIP-8)
  → PositionService (business logic)
    → OrderRepository / PositionRepository (data access)
    → StateMachine (tx building / waiting)
      → Providers (Cardanoscan, Liqwid, Minswap Aggregator)
```

## State Machine

The state machine is the core concept. Each position is a chain of orders that execute sequentially. The client calls `build-tx` repeatedly to advance through the chain.

### Position Lifecycle

```
PENDING → OPEN → CLOSING → CLOSED
```

- **PENDING**: Orders created, waiting for all opening orders to complete
- **OPEN**: All opening orders complete, position is active
- **CLOSING**: Close requested, closing orders in progress
- **CLOSED**: All closing orders complete

### LONG Order Flow

**Opening** (4 orders):
```
LONG_BUY       → DEX swap: ADA → Asset B
LONG_SUPPLY    → Supply Asset B to Liqwid → receive qB
LONG_BORROW    → Borrow ADA using qB collateral
LONG_BUY_MORE  → DEX swap: borrowed ADA → Asset B  → position OPEN
```

**Closing** (4 orders):
```
LONG_SELL      → DEX swap: Asset B → ADA
LONG_REPAY     → Repay ADA loan, redeem qB collateral
LONG_WITHDRAW  → Withdraw Asset B from Liqwid
LONG_SELL_ALL  → DEX swap: remaining Asset B → ADA  → position CLOSED
```

### SHORT Order Flow

**Opening** (3 orders):
```
SHORT_SUPPLY   → Supply ADA to Liqwid → receive qADA
SHORT_BORROW   → Borrow Asset B using qADA collateral
SHORT_SELL     → DEX swap: Asset B → ADA              → position OPEN
```

**Closing** (3 orders):
```
SHORT_BUY      → DEX swap: ADA → Asset B (buy back)
SHORT_REPAY    → Repay Asset B loan, redeem qADA collateral
SHORT_WITHDRAW → Withdraw ADA from Liqwid              → position CLOSED
```

### Transaction Lifecycle

Each order goes through this lifecycle:

```
1. build-tx called → StateMachine builds tx → built_tx_id set
2. Client signs & submits tx to chain
3. Next build-tx call → finds tx on-chain → created_tx_id set, waiting = true
4. Next build-tx call → waiting function checks if output is spent
   → If spent: extract amounts, transition to next order (or complete position)
   → If not spent: return "waiting" message
```

### How `buildTx()` Works

```
1. Check for waiting order (created_tx_id set, waiting = true)
   → Call waiting function
   → If confirmed: transition to next order or complete position
   → If not confirmed: return waiting message

2. Find next unhandled order (has assetIn/amountIn/assetOut, no created_tx_id)

3. If order has built_tx_id:
   → Search for it on-chain
   → If found: set created_tx_id, return waiting
   → If not found & expired: rebuild
   → If not found & not expired: return waiting with remaining time

4. Build new transaction using StateMachine handler
   → Set built_tx_id and built_valid_to
   → Return tx_raw for client to sign
```

## Market Configuration

### Liqwid Integration Fields

- **qToken ticker** (`asset_a_q_token_ticker`): Used as `marketId` when calling Liqwid supply API (e.g. `"qAda"`, `"qNIGHT"`)
- **qToken raw** (`asset_a_q_token_raw`): The on-chain policyId of the qToken, used for matching UTXOs and as `assetOut` in orders
- **Collateral market ID** (`long_collateral_market_id`): Liqwid market ID for withdraw (e.g. `"NIGHT"`, `"Ada"`)
- **Borrow market ID** (`borrow_market_id_long`): Liqwid market ID for borrow (e.g. `"Ada"`, `"NIGHT"`)

### Leverage

- **LONG**: `amount_borrow = amount_in * (leverage - 1) + 4 ADA fee`
  - Example: 600 ADA at 1.5x → borrow 304 ADA
- **SHORT**: `amount_borrow` = aggregator estimate of `amount_in * leverage` ADA worth of Asset B
  - Example: 600 ADA at 0.5x → estimate 300 ADA worth of NIGHT → borrow that amount

## Development Guide

### Scripts

```bash
pnpm --filter=long-short-backend dev          # Start with watch mode
pnpm --filter=long-short-backend build        # TypeScript compile
pnpm --filter=long-short-backend test         # Run tests
pnpm --filter=long-short-backend run run:migrate  # Apply migrations
pnpm --filter=long-short-backend run run:seed     # Seed market_config
pnpm --filter=long-short-backend run codegen      # Regenerate db.d.ts from schema
```

### Adding a New Market

1. Insert a row into `market_config` table (or add to seed file)
2. All Liqwid market IDs and qToken values must match the Liqwid protocol exactly (case-sensitive)
3. Restart server to reload market config cache

### Running Migrations

```bash
# Create new migration
# File: .config/migrations/{timestamp}_{description}.ts

# Apply
pnpm --filter=long-short-backend run run:migrate

# After migration, regenerate types
pnpm --filter=long-short-backend run codegen
```

### Key Files (in order of importance)

1. **`src/api/state-machine.ts`** - Core order build & waiting logic
2. **`src/services/position-service.ts`** - Business logic orchestration
3. **`src/repository/order-repository.ts`** - Order data access and transitions
4. **`src/api/routes/position.ts`** - HTTP endpoint handlers
5. **`src/config/market.ts`** - Market config loading
6. **`src/provider/cardanoscan.ts`** - On-chain transaction queries
7. **`src/cmd/run-api.ts`** - App initialization sequence

### Common Patterns

- All Cardano amounts use `bigint` (lovelace), but Liqwid API uses `number`
- Repository functions accept `Kysely<DB> | Transaction<DB>` for transaction support
- Database columns are `snake_case`, TypeScript types are `camelCase`
- Addresses use `.toHex()` for Cardanoscan API, bech32 for Liqwid API
- Asset format: `policyId.tokenName` internally, `policyId + tokenName` (no dot) for Minswap aggregator, `"lovelace"` for ADA
