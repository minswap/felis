# Services & Repositories

## PositionService

**File:** `src/services/position-service.ts`

Business logic orchestration layer. Main methods:

### createPosition(input)
Creates a position record and pre-creates all order steps:
- LONG: 4 orders (LONG_BUY, LONG_SUPPLY, LONG_BORROW, LONG_BUY_MORE)
- SHORT: 3 orders (SHORT_SUPPLY, SHORT_BORROW, SHORT_SELL)

### buildTx(input)
Core workflow:
1. Check for waiting order -> confirm or return waiting status
2. Find next unhandled order -> build or rebuild transaction
3. Return `tx_raw` for client signing

### closePosition(input)
Initiates closing order sequence:
- LONG: LONG_SELL, LONG_REPAY, LONG_WITHDRAW, LONG_SELL_ALL
- SHORT: SHORT_BUY, SHORT_REPAY, SHORT_WITHDRAW

### getPositionMetrics(position)
Calculates: entry_price, liquidation_price, interest, unrealized_pnl, health.

---

## Repositories

### OrderRepository

**File:** `src/repository/order-repository.ts`

| Method | Description |
|--------|-------------|
| `createOrder(s)` | Insert order(s) into DB |
| `getOrdersByPositionId` | Fetch all orders for a position |
| `getNextUnhandledOrder` | Find next order to execute (has asset_in, no created_tx_id) |
| `getWaitingOrder` | Find order with waiting = true |
| `updateOrderBuiltTx` | Set built_tx_id, built_valid_to after building |
| `updateOrderCreatedTx` | Set created_tx_id, created_tx_index when confirmed on-chain |
| `updateOrderNextDetails` | Update asset_in/amount_in from previous order's output |

### PositionRepository

**File:** `src/repository/position-repository.ts`

| Method | Description |
|--------|-------------|
| `createPosition` | Insert position with status PENDING |
| `getOpenPositionByUser` | Find user's open position |
| `getOpenPositionByUserAndMarket` | Find position for specific market |
| `updatePositionStatus` | Transition status (auto-sets closed_at if CLOSED) |

### MarketConfigRepository

**File:** `src/repository/market-config-repository.ts`

Handles CRUD for the `market_config` table.

---

## Market Config Cache

**File:** `src/config/market.ts`

In-memory cache for market configurations:

| Function | Description |
|----------|-------------|
| `loadMarketConfigs(db)` | Load all markets into cache (called at startup) |
| `getEnabledMarketConfigs()` | Returns enabled markets only |
| `getMarketConfig(marketId)` | Get single market from cache |
| `isSupportedMarket(marketId)` | Check if market is enabled |
| `reloadMarketConfigs(db)` | Hot reload cache |
