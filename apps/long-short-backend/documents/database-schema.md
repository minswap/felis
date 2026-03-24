# Database Schema

Technology: **Kysely ORM + PostgreSQL**

Migrations located in `.config/migrations/` (12 migration files).

## Tables

### `position`

```sql
CREATE TABLE position (
  id BIGSERIAL PRIMARY KEY,
  market_id VARCHAR(64) NOT NULL,        -- FK -> market_config.market_id
  user_address VARCHAR(128) NOT NULL,
  side VARCHAR(8) NOT NULL,              -- LONG | SHORT
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING | OPEN | CLOSING | CLOSED
  amount_in NUMERIC NOT NULL,            -- Collateral (lovelace)
  amount_borrow NUMERIC NOT NULL,        -- Borrow amount
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  closed_at TIMESTAMP
);

-- Unique constraint: (user_address, market_id) WHERE closed_at IS NULL
-- Indexes: (market_id), (user_address), (closed_at)
```

### `order`

```sql
CREATE TABLE "order" (
  id BIGSERIAL PRIMARY KEY,
  position_id BIGINT NOT NULL,
  order_type VARCHAR(32) NOT NULL,       -- LONG_BUY, SHORT_SUPPLY, etc.
  asset_in VARCHAR(128),
  amount_in NUMERIC,
  asset_out VARCHAR(128),
  amount_out NUMERIC,
  built_tx_id VARCHAR(64),               -- Hash after local build
  built_valid_to TIMESTAMP,              -- Transaction expiry
  created_tx_id VARCHAR(64),             -- Hash when confirmed on-chain
  created_tx_index INTEGER,              -- Output index
  waiting BOOLEAN DEFAULT FALSE          -- True while awaiting confirmation
);

-- Indexes: (position_id), (created_tx_id)
```

### `market_config`

```sql
CREATE TABLE market_config (
  market_id VARCHAR(64) PRIMARY KEY,
  asset_a VARCHAR(128) NOT NULL,
  asset_b VARCHAR(128) NOT NULL,
  amm_lp_asset VARCHAR(128) NOT NULL,
  asset_a_q_token_ticker VARCHAR(32) NOT NULL,
  asset_a_q_token_raw VARCHAR(128) NOT NULL,
  asset_b_q_token_ticker VARCHAR(32) NOT NULL,
  asset_b_q_token_raw VARCHAR(128) NOT NULL,
  long_collateral_market_id VARCHAR(64) NOT NULL,
  short_collateral_market_id VARCHAR(64),
  borrow_market_id_long VARCHAR(64),
  borrow_market_id_short VARCHAR(64),
  long_leverage NUMERIC NOT NULL,
  short_leverage NUMERIC NOT NULL,
  min_collateral NUMERIC NOT NULL,
  enable BOOLEAN DEFAULT TRUE
);

-- Index: (enable)
```

## Migration Commands

```bash
pnpm --filter=long-short-backend run migrate:latest   # Apply all pending migrations
pnpm --filter=long-short-backend run migrate:down      # Rollback last migration
pnpm --filter=long-short-backend run codegen           # Regenerate src/database/db.d.ts
```

## Notes

- Position IDs are `BIGSERIAL` -- always use `BigInt(row.id)` when mapping rows
- DB types are defined in `src/database/db.d.ts`, use `Generated<T>` for columns with defaults
- `json-bigint` is used for JSON serialization with BigInt values (never native `JSON.stringify`)
