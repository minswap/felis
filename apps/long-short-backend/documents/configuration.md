# Configuration & Environment

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | -- | PostgreSQL connection string |
| `CARDANOSCAN_API_KEY` | Yes | -- | Cardanoscan API key |
| `NETWORK` | No | `"mainnet"` | `"mainnet"` or `"testnet_preview"` |
| `API_PORT` | No | `9999` | HTTP server port |
| `API_HOST` | No | `0.0.0.0` | HTTP server host |

## Market Configuration

Loaded from the `market_config` database table at startup and cached in memory.

```typescript
type MarketConfig = {
  marketId: string;                    // e.g. "ADA-NIGHT"
  assetA: Asset;                       // Base asset (lovelace for ADA)
  assetB: Asset;                       // Quote asset
  ammLpAsset: string;                  // Minswap LP token
  assetAQTokenTicker: string;          // e.g. "qAda"
  assetAQTokenRaw: string;             // policyId of qToken
  assetBQTokenTicker: string;          // e.g. "qNIGHT"
  assetBQTokenRaw: string;
  longCollateralMarketId: string;      // Liqwid market ID for long collateral
  shortCollateralMarketId: string;     // Liqwid market ID for short collateral
  borrowMarketIdLong: string;          // Liqwid market ID for long borrow
  borrowMarketIdShort: string;         // Liqwid market ID for short borrow
  longLeverage: number;                // e.g. 1.5
  shortLeverage: number;               // e.g. 0.5
  minCollateral: bigint;               // Minimum collateral in lovelace
  enable: boolean;
};
```

Hot reload available via `reloadMarketConfigs(db)`.

## Dependencies

Key runtime dependencies:

- **Fastify** v5 -- HTTP server
- **Kysely** v0.28 -- PostgreSQL query builder / ORM
- **TypeBox** v0.34 -- JSON schema validation
- **pg** v8 -- PostgreSQL driver

Cardano-specific:
- `@cardano-ogmios/client` -- Ogmios client
- `@emurgo/cardano-message-signing-nodejs` -- CIP-8 message signing
- Felis workspace packages (see external-integrations.md)

## Docker

PostgreSQL and Redis are available via `docker-compose.yml` at the repo root.
