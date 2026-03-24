# API Endpoints

## Routes

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/health` | GET | No | Health check, silent logging |
| `/metadata` | GET | No | List all enabled markets + Liqwid APYs |
| `/position/get` | GET | No | Fetch user's open position by address |
| `/position/create` | POST | CIP-8 | Create new leveraged position |
| `/position/build-tx` | POST | CIP-8 | Build next transaction in order sequence |
| `/position/close` | POST | CIP-8 | Initiate closing of open position |
| `/liqwid/submit` | POST | CIP-8 | Submit signed Liqwid transaction |

## Authentication (CIP-8)

Authenticated endpoints require a signed payload:

```json
{
  "data": { /* order data */ },
  "user_address": "addr1q...",
  "witness": {
    "key": "a40101...",
    "signature": "844da2..."
  }
}
```

Verification flow (in `src/api/helper.ts`):
- SHA256 hash of `JSON.stringify(data)` must match the CIP-8 signature
- The `key` field is a COSEKey hex
- The `signature` field is a COSESign1 hex

## Endpoint Details

### GET /metadata

Returns all enabled market configs with Liqwid APY data. No authentication required.

### GET /position/get

Query params: `user_address`

Returns the user's open position (if any) for the given address.

### POST /position/create

Creates a new leveraged position. Inserts the position record and pre-creates all order steps for the position lifecycle.

- LONG positions: 4 opening orders (LONG_BUY, LONG_SUPPLY, LONG_BORROW, LONG_BUY_MORE)
- SHORT positions: 3 opening orders (SHORT_SUPPLY, SHORT_BORROW, SHORT_SELL)

### POST /position/build-tx

Core endpoint. Builds the next transaction in the order sequence:
1. Checks for waiting orders (awaiting on-chain confirmation)
2. Finds next unhandled order
3. Builds or rebuilds the transaction as needed
4. Returns `tx_raw` for client to sign and submit

### POST /position/close

Initiates closing of an open position. Creates closing order steps:
- LONG: LONG_SELL, LONG_REPAY, LONG_WITHDRAW, LONG_SELL_ALL
- SHORT: SHORT_BUY, SHORT_REPAY, SHORT_WITHDRAW

### POST /liqwid/submit

Submits a signed Liqwid transaction to the blockchain.
