# Long-Short Backend Skills

## Database Operations

### Run Migrations
```bash
cd apps/long-short-backend
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm run:migrate
```

### Create New Migration
```bash
cd apps/long-short-backend
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm kysely migrate:make <migration_name>
```

### Run Seeds
```bash
cd apps/long-short-backend
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm run:seed
```

### Regenerate Database Types
```bash
cd apps/long-short-backend
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm codegen
```

## Development

### Start Dev Server
```bash
cd apps/long-short-backend
DATABASE_URL=postgres://postgres:JBNGlQ9wNFLlYWc2mG@localhost:5432/margin pnpm dev
```

### Build
```bash
cd apps/long-short-backend
pnpm build
```

## Docker

### Build Docker Image
```bash
docker compose build long-short-backend
```

### Start Services
```bash
docker compose up -d
```

### View Logs
```bash
docker compose logs -f long-short-backend
```

### Run Migration in Docker
```bash
docker compose exec long-short-backend pnpm --filter=long-short-backend run:migrate
```

### Run Seed in Docker
```bash
docker compose exec long-short-backend pnpm --filter=long-short-backend run:seed
```

## API Endpoints

- `GET /health` - Health check
- `GET /metadata` - Get market configurations
- `POST /position/create` - Create a new position

### Get Metadata Response
```json
{
  "success": true,
  "data": {
    "markets": [
      {
        "market_id": "ADA-MIN",
        "asset_a": "lovelace",
        "asset_b": "29d222ce...",
        "amm_lp_asset": "...",
        "asset_a_q_token_ticker": "qADA",
        "asset_a_q_token_raw": "...",
        "asset_b_q_token_ticker": "qMIN",
        "asset_b_q_token_raw": "...",
        "collateral_market_id": "ADA",
        "leverage": 2,
        "min_collateral": "100000000"
      }
    ]
  }
}
```

### Create Position Request
```json
{
  "data": {
    "market": "ADA-MIN",
    "side": "LONG" | "SHORT",
    "amount": "100000000"
  },
  "user_address": "addr1...",
  "witness": {
    "key": "<COSEKey hex>",
    "signature": "<COSESign1 hex>"
  }
}
```

**Note:** The `witness` is the CIP-8 signed data of `JSON.stringify(data)`. The signature must be created by signing the hex-encoded JSON string of the `data` object. The `user_address` must match the address that signed the data.

## Database Tables

- `position` - User positions
- `order` - Trading orders
- `market_config` - Market configurations (loaded on startup)

## Market Config Fields

| Field | Type | Description |
|-------|------|-------------|
| market_id | string | Primary key (e.g., "ADA-MIN") |
| asset_a | string | First asset |
| asset_b | string | Second asset |
| amm_lp_asset | string | Minswap LP token |
| asset_a_q_token_ticker | string | Liqwid qToken ticker for asset A |
| asset_a_q_token_raw | string | Liqwid qToken raw asset for asset A |
| asset_b_q_token_ticker | string | Liqwid qToken ticker for asset B |
| asset_b_q_token_raw | string | Liqwid qToken raw asset for asset B |
| collateral_market_id | string | Liqwid market ID |
| leverage | number | Leverage multiplier |
| min_collateral | bigint | Minimum collateral in lovelace |
| enable | boolean | Market enabled |
