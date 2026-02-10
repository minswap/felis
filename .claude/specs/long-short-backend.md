# long-short-backend

Leveraged long/short trading API. Integrates Minswap DEX with Liqwid lending protocol.

**Location:** `apps/long-short-backend`

## Database Schema

### position
```sql
id              bigserial PK
market_id       varchar       -- FK to market_config
user_address    varchar       -- Cardano bech32 address
side            varchar       -- "LONG" | "SHORT"
status          varchar       -- "PENDING" | "OPEN" | "CLOSING" | "CLOSED"
amount_in       numeric       -- Initial collateral amount
amount_borrow   numeric       -- Amount borrowed from Liqwid
created_at      timestamp
closed_at       timestamp?    -- Set when CLOSED
-- Unique: one open position per user per market (closed_at IS NULL)
```

### order
```sql
id                bigserial PK
position_id       bigint        -- References position.id
order_type        varchar       -- LONG_BUY, LONG_SUPPLY, etc.
asset_in          varchar?      -- Input asset (set when order is ready)
amount_in         numeric?
asset_out         varchar?
amount_out        numeric?      -- Set after output is consumed
created_tx_id     varchar?      -- Transaction hash confirmed on chain
created_tx_index  integer?      -- Output index
built_tx_id       varchar?      -- Transaction hash when built (not yet confirmed)
built_outputs_hash varchar?     -- Hash of change outputs
built_valid_to    timestamp?    -- Transaction expiry
waiting           boolean       -- True when confirmed, waiting for output spend
```

### market_config
```sql
market_id                varchar PK    -- e.g. "ADA-MIN"
asset_a / asset_b        varchar       -- Trading pair assets
amm_lp_asset             varchar       -- Minswap LP token
asset_a_q_token_ticker   varchar       -- Liqwid qToken ticker (e.g. "Ada")
asset_a_q_token_raw      varchar       -- Liqwid qToken raw asset string
asset_b_q_token_ticker   varchar       -- e.g. "MIN"
asset_b_q_token_raw      varchar
collateral_market_id     varchar       -- Liqwid CollateralId for supply
borrow_market_id_long    varchar       -- Liqwid MarketId for long borrow
borrow_market_id_short   varchar       -- Liqwid MarketId for short borrow
leverage                 numeric       -- Leverage multiplier
min_collateral           numeric       -- Minimum collateral required
enable                   boolean
```

## Order State Machine

### Long Position — Open (4 orders)
```
LONG_BUY       → Buy asset B with ADA via DEX swap
LONG_SUPPLY    → Supply asset B to Liqwid, receive qToken
LONG_BORROW    → Borrow ADA against qToken collateral
LONG_BUY_MORE  → Buy more asset B with borrowed ADA → position OPEN
```

### Long Position — Close (4 orders)
```
LONG_SELL      → Sell asset B for ADA via DEX swap
LONG_REPAY     → Repay loan to Liqwid, redeem qToken collateral
LONG_WITHDRAW  → Withdraw underlying asset B from Liqwid
LONG_SELL_ALL  → Sell all remaining asset B for ADA → position CLOSED
```

### Transaction Lifecycle
```
1. Build tx    → save built_tx_id, built_outputs_hash, built_valid_to
2. User signs & submits externally
3. Search chain → update created_tx_id, created_tx_index, waiting = true
4. Wait for output to be spent (DEX batcher or Liqwid)
5. Extract output amount → transition to next order, waiting = false
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/metadata` | No | Get enabled market configs |
| GET | `/position/get?user_address=` | No | Get user's open positions |
| POST | `/position/create` | CIP-8 | Create new leveraged position |
| POST | `/position/build-tx` | CIP-8 | Build next transaction in order chain |
| POST | `/position/close` | CIP-8 | Close an open position |
| POST | `/liqwid/submit` | CIP-8 | Submit signed Liqwid transaction |

### Authentication (CIP-8)
```typescript
// Request format for authenticated endpoints
{
  data: { /* payload */ },
  user_address: "addr1...",
  witness: {
    key: "a401...",        // CBOR-encoded COSEKey
    signature: "84582a..." // CBOR-encoded COSESign1
  }
}
// Backend SHA256-hashes JSON.stringify(data), verifies against signature
```

### Create Position Request
```typescript
{ data: { market_id: string; amount_in: string }, user_address, witness }
// Validates: market supported, amount >= min_collateral, no existing open position
// Creates position + 4 opening orders
// amount_borrow = amount_in * (leverage - 1) + 4_000_000n (fee buffer)
```

### Build Tx Request
```typescript
{ data: { position_id: string }, user_address, witness }
// Returns: { tx_raw: string; tx_id: string } or error message
// Handles: waiting check → unhandled order → chain search → build/rebuild
```

### Close Position Request
```typescript
{ data: { position_id: string }, user_address, witness }
// Validates: position exists, status OPEN, user owns it
// Creates 4 closing orders, sets status CLOSING
```

## State Machine Build Functions

### DEX Orders (LONG_BUY, LONG_BUY_MORE, LONG_SELL, LONG_SELL_ALL)
```typescript
// Uses DEXOrderTransaction.createBulkOrdersTx()
// Direction: A_TO_B for buy, B_TO_A for sell
// Returns: { txRaw, txId, outputsHash, validTo }
```

### LONG_SUPPLY
```typescript
// Uses LiqwidProvider.getSupplyTransaction() (V1 for supply)
// Returns: { txRaw, txId, validTo }
```

### LONG_BORROW
```typescript
// Uses LiqwidProviderV2.Transactions.borrow()
// Collateral: qToken from LONG_SUPPLY step
// Returns: { txRaw, txId, validTo }
```

### LONG_REPAY
```typescript
// Uses LiqwidProviderV2.Transactions.repayLoan()
// loanUtxoId format: "{txHash}-{outputIndex}"
// Redeems qToken collateral
// Returns: { txRaw, txId, validTo }
```

### LONG_WITHDRAW
```typescript
// Uses LiqwidProviderV2.Transactions.withdraw()
// Amount: supplyAmountOut from LONG_SUPPLY order
// Returns: { txRaw, txId, validTo }
```

## Waiting Functions

### DEX Order Waiting (LONG_BUY, LONG_SELL, etc.)
```typescript
// Uses CardanoscanProvider.findTransactionHasSpent(address, txHash, outputIndex)
// Extracts received token amount from spending transaction outputs
// Transition: completes current order, prepares next order with asset/amount
```

### Liqwid Order Waiting (LONG_SUPPLY, LONG_BORROW, etc.)
```typescript
// Uses CardanoscanProvider.findTransactionByHash(address, txHash)
// Extracts relevant output (qToken, borrowed amount, etc.)
// Transition: completes current order, prepares next order
```

## Repository Layer

### PositionRepository
```typescript
createPosition(db, params): Promise<Position>
getPositionById(db, id): Promise<Position | null>
getOpenPositionByUser(db, address): Promise<Position | null>
getOpenPositionByUserAndMarket(db, address, marketId): Promise<Position | null>
getUserOpenPositions(db, address): Promise<Position[]>
getUserPositions(db, address, opts): Promise<Position[]>
updatePositionStatus(db, id, status): Promise<void>  // sets closed_at if CLOSED
```

### OrderRepository
```typescript
createOrder(db, params) / createOrders(db, params[])
getOrdersByPositionId(db, positionId): Promise<Order[]>
getNextUnhandledOrder(db, positionId): Promise<Order | null>  // asset_in != null, created_tx_id == null
getWaitingOrder(db, positionId): Promise<Order | null>         // created_tx_id != null, waiting == true
updateOrderBuiltTx(db, id, { builtTxId, outputsHash, validTo })
updateOrderCreatedTx(db, id, { txId, txIndex })
transitionToNextOrder(db, currentId, nextId, { amountOut, assetIn, amountIn })
completeOrder(db, id, amountOut)
```

### MarketConfigRepository
```typescript
getMarketConfigRowById(db, id): Promise<MarketConfig | null>
getMarketConfigRowByIdOrThrow(db, id): Promise<MarketConfig>
```

## Provider Layer

### CardanoscanProvider
```typescript
constructor(baseUrl: string, apiKey: string)
findTransactionByHash(address, txHash, pageSize?, maxPage?): Promise<Transaction | null>
findTransactionHasSpent(address, txHash, outputIndex, pageSize?, maxPage?): Promise<Transaction | null>
getTransactionList(addressHex, pageNo, limit): Promise<Transaction[]>
// Uses address.toHex() for API, apiKey header, pageNo 1-indexed, limit max 50
```

## Configuration

### Environment Variables
```
DATABASE_URL          PostgreSQL connection (required)
CARDANOSCAN_API_KEY   API key (required)
API_PORT              Default: 9999
API_HOST              Default: "0.0.0.0"
NETWORK               "mainnet" | "testnet" (default: "mainnet")
```

### Market Config Cache
```typescript
loadMarketConfigs(db)        // Load from DB at startup
getEnabledMarketConfigs()    // Get cached enabled markets
getMarketConfig(marketId)    // Get single market config
isSupportedMarket(marketId)  // Check if supported and enabled
reloadMarketConfigs(db)      // Hot reload
```

## Key Files
```
src/api/state-machine.ts     -- Build/waiting functions per order type
src/services/position-service.ts -- Core business logic (create, buildTx, close)
src/api/routes/position.ts   -- API route handlers
src/api/schemas.ts           -- TypeBox request/response schemas
src/api/helper.ts            -- CIP-8 authentication
src/repository/              -- Database access layer
src/provider/cardanoscan.ts  -- On-chain transaction search
src/config/market.ts         -- Market config cache
src/cmd/run-api.ts           -- Entry point
```
