# Minswap Lending Market – Long/Short

**Status: ✅ Project Complete** — all milestones (1–6) delivered and approved.

The Minswap Lending Market brings leveraged long/short trading to Cardano by combining Minswap DEX V2 swaps with Liqwid lending. Users open and manage leveraged positions through a single, integrated interface, with the full multi-step lifecycle automated by a backend state machine.

## Live Interface

**👉 [https://app.minswap.org/margin](https://app.minswap.org/margin)** — open, monitor, and close leveraged long/short positions directly on Minswap.

## Project Catalyst — Funded Proposal

This work was delivered under a Project Catalyst proposal across six milestones:

| Milestone | Deliverable | Status |
|-----------|-------------|--------|
| 1–2 | Proof-of-Concept: core SDK integration, Nitro Wallet, minimal UI | ✅ Complete |
| 3 | UI integration for long positions | ✅ Complete |
| 4 | UI integration for short positions | ✅ Complete |
| 5 | Testing, hardening, and deployment | ✅ Complete |
| 6 | User feedback collection and close-out | ✅ Complete |

The sections below document the Milestone 3 and 4 deliverables in detail and remain as a record of the work.

## Close-out — Results & Reports

### Quantitative Measures (last 30 days)

| Metric | Value |
|--------|-------|
| Users accessing the service | 272 |
| Active users | 149 |
| Number of actions (deposit/withdraw/open/close) | 338 |
| Volume | over 13,000 ₳ |

### Qualitative Measures & Reports

- **User feedback survey:** [Feedback form & responses](https://docs.google.com/document/d/16d_1bOlg0DM6XJ0mB-26BHv4DM0hiaCObzNYRGBrUY0/edit#heading=h.srgofhhd2rlv)
- **Final close-out report:** [Close-out report](https://docs.google.com/document/d/16d_1bOlg0DM6XJ0mB-26BHv4DM0hiaCObzNYRGBrUY0/edit#heading=h.xsfxdz1dyxq4)
- **Final close-out video:** [Watch on YouTube](https://www.youtube.com/watch?v=pecnO8oxWs0)

---

## What changed since Milestone 1, 2

Milestone 1–2 delivered a **Proof-of-Concept** with hardcoded values, minimal UI, and the core SDK integration.

Milestone 3–4 delivers a **production-grade system** with:
- A full backend server (API, database, state machine) that orchestrates multi-step leveraged positions end-to-end.
- A polished trading interface integrated into the Minswap page at `/margin`, replacing the POC.
- Real-time data feeds for asset prices, lending rates, and position health.
- Educational content and risk warnings for short position mechanics.

---

## "A tour" of what I accomplished in Milestone 3

### Milestone Outputs

#### _User-friendly interface for executing long position strategies._

- **Production Backend Infrastructure**: Built a Fastify API server with PostgreSQL database, handling the full lifecycle of long positions — from opening to closing — through an automated state machine.
- **Integrated Trading UI**: A single-page interface at `/margin` where users can open, monitor, and close long positions without ever leaving Minswap or visiting Liqwid directly.
- **Real-time Data Feeds**: Live asset prices, lending APY rates, position health factor, liquidation price, and unrealized PnL — all visible in the interface.

### Acceptance Criteria

#### _Users can initiate and manage long positions through a single, intuitive interface._

- Users open a long position by selecting the market (e.g., ADA-MIN), entering their collateral amount, and clicking "Open Long Position".
- The backend state machine automatically orchestrates the full 4-step opening sequence:
  1. **LONG_BUY** — Swap ADA → MIN on Minswap DEX V2
  2. **LONG_SUPPLY** — Supply MIN to Liqwid as collateral
  3. **LONG_BORROW** — Borrow ADA against the supplied collateral
  4. **LONG_BUY_MORE** — Use borrowed ADA to buy additional MIN (leverage)
- Users manage their open position from the same interface: view current P&L, health factor, interest accrued, and entry/liquidation prices.
- Closing a position triggers the automated 4-step closing sequence:
  1. **LONG_SELL** — Sell MIN → ADA
  2. **LONG_REPAY** — Repay the loan to Liqwid
  3. **LONG_WITHDRAW** — Withdraw collateral from Liqwid
  4. **LONG_SELL_ALL** — Sell remaining MIN to capture profit
- The interface also supports **fractional repay** flows (LONG_REPAY_FRACTION → LONG_WITHDRAW_FRACTION → LONG_SELL_FREED) for partial position management.

#### _Latest data feeds provide accurate information on asset prices, lending rates, and position health._

The interface displays live data feeds including:
- **Asset Price**: Current ADA/MIN price from the Minswap aggregator
- **Lending Rates**: Supply APY and Borrow APY fetched from Liqwid V2 API
- **Position Health**: Health factor from Liqwid's `loansForUser` API
- **Entry Price**: Calculated from the user's actual swap execution data
- **Liquidation Price**: Derived from the current price and health factor
- **Unrealized PnL**: Current token value minus total invested (collateral + borrowed amount)
- **Accrued Interest**: Outstanding borrow interest from Liqwid

All data is served through the backend API endpoint `GET /position/get`, which computes these metrics on each request using live on-chain and Liqwid data.

---

## "A tour" of what I accomplished in Milestone 4

### Milestone Outputs

#### _User-friendly interface for executing short position strategies._

- **Short Position Trading**: Users can open and close short positions from the same `/margin` interface, with full automation of the 3-step opening and 3-step closing sequences.
- **Risk & Educational Content**: The interface includes warnings about short position mechanics, liquidation scenarios, and leverage risks.

### Acceptance Criteria

#### _Users can initiate and manage short positions through a single, intuitive interface._

- Users open a short position by selecting the market, entering their ADA collateral, and clicking "Open Short Position".
- The backend state machine automatically orchestrates the 3-step opening sequence:
  1. **SHORT_SUPPLY** — Supply ADA to Liqwid as collateral
  2. **SHORT_BORROW** — Borrow MIN against the ADA collateral
  3. **SHORT_SELL** — Sell borrowed MIN → ADA on Minswap DEX V2
- Closing a short position triggers the automated 3-step closing sequence:
  1. **SHORT_BUY** — Buy back MIN with ADA
  2. **SHORT_REPAY** — Repay the borrowed MIN to Liqwid
  3. **SHORT_WITHDRAW** — Withdraw ADA collateral from Liqwid
- Users can monitor their short position with the same real-time metrics: entry price, current price, unrealized PnL, health factor, interest, and liquidation price.

#### _Educational resources explaining short position mechanics and risks are integrated into the interface._

- The interface displays clear warnings explaining:
  - How short positions work (borrow token → sell → buy back cheaper → profit)
  - Liquidation risk: when the token price rises, the position may be liquidated
  - Leverage mechanics and the relationship between collateral and borrowed amount
  - Interest accrual on borrowed assets
- Risk indicators are color-coded (green for healthy, red for at-risk positions)
- Position health factor is prominently displayed to help users understand their liquidation proximity

---

## Backend Infrastructure

The backend is the core new component built for Milestone 3–4. It replaces the POC's client-side logic with a server-side system.

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/metadata` | GET | Returns enabled market configs with current Liqwid APY data |
| `/position/get` | GET | Fetch user's open position with live trading metrics |
| `/position/create` | POST | Create a new LONG or SHORT position |
| `/position/build-tx` | POST | Build the next transaction in the position lifecycle |
| `/position/close` | POST | Initiate closing sequence for an open position |
| `/liqwid/submit` | POST | Submit a Liqwid lending transaction to the chain |

All POST endpoints require **CIP-8 signature authentication** — the user signs a message with their wallet to prove ownership, ensuring non-custodial security.

### Database Schema

Three tables in PostgreSQL:

- **position** — Tracks each position's market, side (LONG/SHORT), status (PENDING → OPEN → CLOSING → CLOSED), collateral amount, and borrow amount.
- **order** — Tracks each step in the position lifecycle with its order type, built transaction, on-chain confirmation, and input/output amounts.
- **market_config** — Stores market parameters: asset pairs, Liqwid market IDs, qToken mappings, leverage multipliers, and minimum collateral.

### State Machine

The state machine orchestrates multi-step leveraged positions automatically:

```
LONG Opening:  LONG_BUY → LONG_SUPPLY → LONG_BORROW → LONG_BUY_MORE
LONG Closing:  LONG_SELL → LONG_REPAY → LONG_WITHDRAW → LONG_SELL_ALL
SHORT Opening: SHORT_SUPPLY → SHORT_BORROW → SHORT_SELL
SHORT Closing: SHORT_BUY → SHORT_REPAY → SHORT_WITHDRAW
```

Each order step:
1. Builds an unsigned transaction (DEX swap or Liqwid lending operation)
2. Returns it to the frontend for signing
3. Waits for on-chain confirmation via Cardanoscan
4. Extracts output amounts and transitions to the next order

### Position Metrics (Real-time)

The `GET /position/get` endpoint returns live trading metrics computed from multiple data sources:

| Metric | Source | Description |
|--------|--------|-------------|
| `entry_price` | Order history (DB) | Weighted average price from BUY/SELL orders |
| `health` | Liqwid V2 `loansForUser` | Current health factor of the lending position |
| `interest` | Liqwid V2 `loansForUser` | Accrued borrow interest in lovelace |
| `unrealized_pnl` | Minswap Aggregator + DB | Current value minus cost basis |
| `liq_price` | Derived from health + price | Estimated price at which liquidation occurs |

---

## Technical Details

- [Long-Short Backend Server](apps/long-short-backend/)
- [State Machine](apps/long-short-backend/src/api/state-machine.ts) — 2000+ lines orchestrating all order types
- [Position Service](apps/long-short-backend/src/services/position-service.ts) — Business logic for position lifecycle and metrics
- [API Schemas](apps/long-short-backend/src/api/schemas.ts) — TypeBox request/response validation
- [Database Migrations](apps/long-short-backend/.config/migrations/)
- [Liqwid SDK](packages/minswap-lending-market/src/lending-market.ts) — LiqwidProviderV2 integration
- [Minswap SDK](packages/minswap-build-tx/) — DEX V2 order building
- [Transaction Builder SDK](packages/tx-builder/) — Low-level Cardano transaction construction

## Nitro Wallet

Same non-custodial Nitro Wallet from Milestone 1–2:
- Private key persists on the user's device only
- Auto-sign within user-granted scope for seamless multi-step flows
- No data sent to backend — fully non-custodial
