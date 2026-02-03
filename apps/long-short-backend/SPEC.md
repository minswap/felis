# Isolated Margin Trading Backend - Specification

## Overview

An isolated-margin leveraged trading backend for Cardano DEX, integrated with Liqwid lending protocol. Each position has its own dedicated margin (collateral), isolating risk per trade.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer (HTTP/WS)                       │
├─────────────────────────────────────────────────────────────────┤
│                         Service Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Position   │  │    Order    │  │ Liquidation │              │
│  │  Service    │  │   Service   │  │   Engine    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                        Core Layer                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Margin    │  │    Price    │  │    Risk     │              │
│  │ Calculator  │  │   Oracle    │  │  Manager    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                      Integration Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Minswap   │  │   Liqwid    │  │  Blockchain │              │
│  │   DEX V2    │  │   Lending   │  │   Syncer    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                       Data Layer                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  PostgreSQL │  │    Redis    │  │   Ogmios    │              │
│  │  (Positions)│  │   (Cache)   │  │   (Chain)   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Isolated Margin
- Each position has its own dedicated collateral
- Losses are limited to the margin allocated to that specific position
- Positions cannot affect each other's margin

### Position Types
- **Long**: Profit when price goes up (borrow quote asset, buy base asset)
- **Short**: Profit when price goes down (borrow base asset, sell for quote asset)

### Leverage
- Supported leverage: 2x, 3x, 5x, 10x (configurable per market)
- Higher leverage = higher liquidation risk

---

## Database Schema

### Tables

#### `position`
| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `user_address` | VARCHAR(128) | User's Cardano address |
| `market` | VARCHAR(128) | Trading pair (e.g., "ADA/DJED") |
| `side` | VARCHAR(8) | "LONG" or "SHORT" |
| `status` | VARCHAR(16) | "OPEN", "CLOSED", "LIQUIDATED" |
| `leverage` | NUMERIC | Leverage multiplier |
| `collateral_asset` | VARCHAR(128) | Asset used as collateral |
| `collateral_amount` | NUMERIC | Amount of collateral |
| `entry_price` | NUMERIC | Average entry price |
| `position_size` | NUMERIC | Size of position in base asset |
| `borrowed_amount` | NUMERIC | Amount borrowed from Liqwid |
| `liquidation_price` | NUMERIC | Price at which position gets liquidated |
| `take_profit_price` | NUMERIC | Optional TP price |
| `stop_loss_price` | NUMERIC | Optional SL price |
| `realized_pnl` | NUMERIC | Realized profit/loss |
| `unrealized_pnl` | NUMERIC | Unrealized profit/loss |
| `funding_paid` | NUMERIC | Cumulative funding fees paid |
| `liqwid_supply_id` | VARCHAR(128) | Liqwid supply position reference |
| `liqwid_borrow_id` | VARCHAR(128) | Liqwid borrow position reference |
| `created_at` | TIMESTAMP | Position creation time |
| `updated_at` | TIMESTAMP | Last update time |
| `closed_at` | TIMESTAMP | Position close time |

#### `order`
| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `position_id` | BIGINT | Reference to position (nullable for new positions) |
| `user_address` | VARCHAR(128) | User's Cardano address |
| `market` | VARCHAR(128) | Trading pair |
| `order_type` | VARCHAR(16) | "MARKET", "LIMIT", "STOP_MARKET", "STOP_LIMIT" |
| `side` | VARCHAR(8) | "LONG" or "SHORT" |
| `action` | VARCHAR(16) | "OPEN", "CLOSE", "INCREASE", "DECREASE" |
| `status` | VARCHAR(16) | "PENDING", "FILLED", "CANCELLED", "EXPIRED" |
| `leverage` | NUMERIC | Leverage for new positions |
| `collateral_amount` | NUMERIC | Collateral amount |
| `size` | NUMERIC | Order size |
| `price` | NUMERIC | Limit price (for limit orders) |
| `trigger_price` | NUMERIC | Trigger price (for stop orders) |
| `slippage_tolerance` | NUMERIC | Max slippage % |
| `tx_hash` | VARCHAR(64) | On-chain transaction hash |
| `filled_price` | NUMERIC | Actual fill price |
| `filled_at` | TIMESTAMP | Fill timestamp |
| `expires_at` | TIMESTAMP | Order expiration |
| `created_at` | TIMESTAMP | Order creation time |

#### `liquidation`
| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `position_id` | BIGINT | Liquidated position |
| `liquidator_address` | VARCHAR(128) | Liquidator's address |
| `liquidation_price` | NUMERIC | Price at liquidation |
| `penalty_amount` | NUMERIC | Liquidation penalty |
| `remaining_collateral` | NUMERIC | Returned to user |
| `tx_hash` | VARCHAR(64) | Liquidation tx hash |
| `created_at` | TIMESTAMP | Liquidation time |

#### `market_config`
| Column | Type | Description |
|--------|------|-------------|
| `market` | VARCHAR(128) | Primary key - trading pair |
| `base_asset` | VARCHAR(128) | Base asset |
| `quote_asset` | VARCHAR(128) | Quote asset |
| `lp_asset` | VARCHAR(128) | Minswap LP asset |
| `max_leverage` | NUMERIC | Maximum allowed leverage |
| `min_collateral` | NUMERIC | Minimum collateral |
| `maintenance_margin_rate` | NUMERIC | Maintenance margin % |
| `liquidation_fee_rate` | NUMERIC | Liquidation penalty % |
| `taker_fee_rate` | NUMERIC | Taker fee % |
| `maker_fee_rate` | NUMERIC | Maker fee % |
| `funding_rate_interval` | INTEGER | Funding rate interval (hours) |
| `enabled` | BOOLEAN | Market enabled |

#### `price_history`
| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `market` | VARCHAR(128) | Trading pair |
| `price` | NUMERIC | Price |
| `source` | VARCHAR(32) | "DEX", "ORACLE" |
| `slot` | BIGINT | Cardano slot |
| `timestamp` | TIMESTAMP | Time |

---

## Services

### 1. Position Service

Manages position lifecycle.

```typescript
interface PositionService {
  // Open a new position
  openPosition(params: {
    userAddress: string;
    market: string;
    side: "LONG" | "SHORT";
    collateralAmount: bigint;
    leverage: number;
    slippageTolerance: number;
  }): Promise<Position>;

  // Close an existing position
  closePosition(params: {
    positionId: bigint;
    slippageTolerance: number;
  }): Promise<Position>;

  // Increase position size
  increasePosition(params: {
    positionId: bigint;
    additionalCollateral: bigint;
  }): Promise<Position>;

  // Decrease position size (partial close)
  decreasePosition(params: {
    positionId: bigint;
    closePercent: number;
  }): Promise<Position>;

  // Add margin to position
  addMargin(params: {
    positionId: bigint;
    amount: bigint;
  }): Promise<Position>;

  // Get position details
  getPosition(positionId: bigint): Promise<Position | null>;

  // Get user's open positions
  getUserPositions(userAddress: string): Promise<Position[]>;

  // Calculate unrealized PnL
  calculateUnrealizedPnL(position: Position, currentPrice: bigint): bigint;
}
```

### 2. Order Service

Handles order placement and execution.

```typescript
interface OrderService {
  // Place a market order
  placeMarketOrder(params: {
    userAddress: string;
    market: string;
    side: "LONG" | "SHORT";
    action: "OPEN" | "CLOSE";
    size: bigint;
    leverage?: number;
    collateralAmount?: bigint;
  }): Promise<Order>;

  // Place a limit order
  placeLimitOrder(params: {
    userAddress: string;
    market: string;
    side: "LONG" | "SHORT";
    action: "OPEN" | "CLOSE";
    size: bigint;
    price: bigint;
    leverage?: number;
    collateralAmount?: bigint;
    expiresAt?: Date;
  }): Promise<Order>;

  // Cancel an order
  cancelOrder(orderId: bigint): Promise<void>;

  // Get order status
  getOrder(orderId: bigint): Promise<Order | null>;

  // Get user's pending orders
  getPendingOrders(userAddress: string): Promise<Order[]>;
}
```

### 3. Liquidation Engine

Monitors and executes liquidations.

```typescript
interface LiquidationEngine {
  // Check if position should be liquidated
  shouldLiquidate(position: Position, currentPrice: bigint): boolean;

  // Calculate liquidation price
  calculateLiquidationPrice(position: Position): bigint;

  // Execute liquidation
  liquidate(positionId: bigint): Promise<Liquidation>;

  // Get liquidatable positions
  getLiquidatablePositions(): Promise<Position[]>;

  // Start monitoring loop
  startMonitoring(): void;

  // Stop monitoring
  stopMonitoring(): void;
}
```

### 4. Margin Calculator

Handles margin calculations.

```typescript
interface MarginCalculator {
  // Calculate initial margin required
  calculateInitialMargin(params: {
    positionSize: bigint;
    entryPrice: bigint;
    leverage: number;
  }): bigint;

  // Calculate maintenance margin
  calculateMaintenanceMargin(params: {
    positionSize: bigint;
    entryPrice: bigint;
    maintenanceMarginRate: number;
  }): bigint;

  // Calculate available margin
  calculateAvailableMargin(position: Position): bigint;

  // Calculate margin ratio
  calculateMarginRatio(position: Position, currentPrice: bigint): number;

  // Check if position is healthy
  isPositionHealthy(position: Position, currentPrice: bigint): boolean;
}
```

### 5. Price Oracle

Fetches and validates prices.

```typescript
interface PriceOracle {
  // Get current price from DEX
  getCurrentPrice(market: string): Promise<bigint>;

  // Get TWAP (Time-Weighted Average Price)
  getTWAP(market: string, period: number): Promise<bigint>;

  // Get price from external oracle (e.g., Charli3)
  getOraclePrice(market: string): Promise<bigint>;

  // Get validated price (combines DEX + oracle)
  getValidatedPrice(market: string): Promise<bigint>;

  // Subscribe to price updates
  subscribePriceUpdates(market: string, callback: (price: bigint) => void): void;
}
```

### 6. Liqwid Integration

Handles borrowing/lending through Liqwid.

```typescript
interface LiqwidService {
  // Supply collateral to Liqwid
  supplyCollateral(params: {
    userAddress: string;
    asset: string;
    amount: bigint;
  }): Promise<{ supplyId: string; txHash: string }>;

  // Borrow from Liqwid
  borrow(params: {
    userAddress: string;
    asset: string;
    amount: bigint;
    collateralSupplyId: string;
  }): Promise<{ borrowId: string; txHash: string }>;

  // Repay borrowed amount
  repay(params: {
    borrowId: string;
    amount: bigint;
  }): Promise<{ txHash: string }>;

  // Withdraw collateral
  withdrawCollateral(params: {
    supplyId: string;
    amount: bigint;
  }): Promise<{ txHash: string }>;

  // Get borrow rate
  getBorrowRate(asset: string): Promise<number>;

  // Get supply rate
  getSupplyRate(asset: string): Promise<number>;
}
```

---

## API Endpoints

### HTTP API

#### Positions
```
POST   /api/v1/positions              # Open new position
GET    /api/v1/positions/:id          # Get position by ID
GET    /api/v1/positions              # List user positions
POST   /api/v1/positions/:id/close    # Close position
POST   /api/v1/positions/:id/margin   # Add margin
DELETE /api/v1/positions/:id          # Cancel pending position
```

#### Orders
```
POST   /api/v1/orders                 # Place order
GET    /api/v1/orders/:id             # Get order by ID
GET    /api/v1/orders                 # List user orders
DELETE /api/v1/orders/:id             # Cancel order
```

#### Markets
```
GET    /api/v1/markets                # List all markets
GET    /api/v1/markets/:market        # Get market details
GET    /api/v1/markets/:market/price  # Get current price
GET    /api/v1/markets/:market/depth  # Get order book depth
```

#### Account
```
GET    /api/v1/account/balance        # Get account balance
GET    /api/v1/account/history        # Get trade history
GET    /api/v1/account/pnl            # Get PnL summary
```

### WebSocket API

```typescript
// Subscribe to price updates
{ "type": "subscribe", "channel": "price", "market": "ADA/DJED" }

// Subscribe to position updates
{ "type": "subscribe", "channel": "positions", "address": "addr1..." }

// Subscribe to order updates
{ "type": "subscribe", "channel": "orders", "address": "addr1..." }

// Subscribe to liquidation events
{ "type": "subscribe", "channel": "liquidations" }
```

---

## Flow Diagrams

### Open Long Position

```
User                  Backend               Liqwid                Minswap DEX
  │                      │                     │                       │
  │ Open Long ADA/DJED   │                     │                       │
  │ Collateral: 100 DJED │                     │                       │
  │ Leverage: 3x         │                     │                       │
  │─────────────────────>│                     │                       │
  │                      │                     │                       │
  │                      │ Supply 100 DJED     │                       │
  │                      │────────────────────>│                       │
  │                      │                     │                       │
  │                      │ Borrow 200 DJED     │                       │
  │                      │────────────────────>│                       │
  │                      │                     │                       │
  │                      │                     │  Swap 300 DJED → ADA  │
  │                      │────────────────────────────────────────────>│
  │                      │                     │                       │
  │                      │ Position Created    │                       │
  │<─────────────────────│                     │                       │
  │                      │                     │                       │
```

### Close Long Position

```
User                  Backend               Liqwid                Minswap DEX
  │                      │                     │                       │
  │ Close Position       │                     │                       │
  │─────────────────────>│                     │                       │
  │                      │                     │                       │
  │                      │                     │   Swap ADA → DJED     │
  │                      │────────────────────────────────────────────>│
  │                      │                     │                       │
  │                      │ Repay 200 DJED      │                       │
  │                      │ + Interest          │                       │
  │                      │────────────────────>│                       │
  │                      │                     │                       │
  │                      │ Withdraw Collateral │                       │
  │                      │────────────────────>│                       │
  │                      │                     │                       │
  │                      │ Return profit/loss  │                       │
  │<─────────────────────│ to user             │                       │
  │                      │                     │                       │
```

### Liquidation Flow

```
Liquidator            Backend               Liqwid                Minswap DEX
  │                      │                     │                       │
  │                      │ Monitor Positions   │                       │
  │                      │ (price < liq price) │                       │
  │                      │                     │                       │
  │ Trigger Liquidation  │                     │                       │
  │─────────────────────>│                     │                       │
  │                      │                     │                       │
  │                      │                     │   Swap ADA → DJED     │
  │                      │────────────────────────────────────────────>│
  │                      │                     │                       │
  │                      │ Repay Loan          │                       │
  │                      │────────────────────>│                       │
  │                      │                     │                       │
  │                      │ Liquidation penalty │                       │
  │ Receive reward       │ to liquidator       │                       │
  │<─────────────────────│                     │                       │
  │                      │                     │                       │
  │                      │ Remaining collateral│                       │
  │                      │ to user (if any)    │                       │
  │                      │                     │                       │
```

---

## Configuration

### Environment Variables

```env
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/margin_trading

# Redis
REDIS_URL=redis://localhost:6379

# Blockchain
OGMIOS_HOST=localhost:1337
KUPO_URL=http://localhost:1442
NETWORK_ENV=TESTNET_PREVIEW

# Liqwid
LIQWID_API_URL=https://api.liqwid.finance
LIQWID_CONTRACT_ADDRESS=addr1...

# Risk Management
MAX_LEVERAGE=10
MAINTENANCE_MARGIN_RATE=0.05
LIQUIDATION_FEE_RATE=0.025

# API
API_PORT=9999
WS_PORT=9998
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Database schema migrations
- [ ] Position & Order models
- [ ] Basic CRUD operations
- [ ] Price oracle integration (DEX prices)

### Phase 2: Position Management
- [ ] Open position flow
- [ ] Close position flow
- [ ] Margin calculator
- [ ] PnL calculation

### Phase 3: Liqwid Integration
- [ ] Supply collateral
- [ ] Borrow assets
- [ ] Repay loans
- [ ] Interest calculation

### Phase 4: Liquidation Engine
- [ ] Liquidation price calculation
- [ ] Position health monitoring
- [ ] Automated liquidation
- [ ] Liquidation rewards

### Phase 5: Advanced Features
- [ ] Limit orders
- [ ] Stop-loss / Take-profit
- [ ] Partial close
- [ ] Multi-collateral support

### Phase 6: API & Monitoring
- [ ] REST API
- [ ] WebSocket API
- [ ] Health checks
- [ ] Metrics & alerts

---

## Risk Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Max Leverage | 10x | Maximum leverage allowed |
| Maintenance Margin | 5% | Minimum margin to avoid liquidation |
| Liquidation Fee | 2.5% | Penalty for liquidation |
| Min Collateral | 10 ADA | Minimum position collateral |
| Max Position Size | 100,000 ADA | Maximum single position |
| Funding Rate Interval | 8 hours | Funding rate calculation period |

---

## Security Considerations

1. **Signature Verification**: All user actions require valid Cardano signatures
2. **Rate Limiting**: API rate limits per address
3. **Slippage Protection**: Maximum slippage enforced on swaps
4. **Oracle Validation**: Price from DEX validated against external oracle
5. **Circuit Breakers**: Halt trading if price deviation > threshold
6. **Audit Trail**: All actions logged with timestamps
