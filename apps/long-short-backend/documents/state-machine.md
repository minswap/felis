# Order State Machine

## Position Status Flow

```
PENDING -> OPEN -> CLOSING -> CLOSED
```

## LONG Position Lifecycle

### Opening Sequence (4 orders)

```
1. LONG_BUY        -> Swap ADA -> Asset B (DEX swap A_TO_B)
2. LONG_SUPPLY     -> Supply Asset B to Liqwid -> receive qB collateral
3. LONG_BORROW     -> Borrow ADA using qB as collateral (Liqwid V2)
4. LONG_BUY_MORE   -> Swap borrowed ADA -> Asset B (DEX swap A_TO_B)
   -> Position status transitions to OPEN
```

### Closing Sequence (4 orders)

```
1. LONG_SELL       -> Swap Asset B -> ADA (DEX swap B_TO_A)
2. LONG_REPAY      -> Repay ADA loan, redeem qB collateral
3. LONG_WITHDRAW   -> Withdraw Asset B from Liqwid
4. LONG_SELL_ALL   -> Swap remaining Asset B -> ADA (DEX swap B_TO_A)
   -> Position status transitions to CLOSED
```

## SHORT Position Lifecycle

### Opening Sequence (3 orders)

```
1. SHORT_SUPPLY    -> Supply ADA to Liqwid -> receive qADA collateral
2. SHORT_BORROW    -> Borrow Asset B using qADA as collateral
3. SHORT_SELL      -> Swap Asset B -> ADA (DEX swap B_TO_A)
   -> Position status transitions to OPEN
```

### Closing Sequence (3 orders)

```
1. SHORT_BUY       -> Swap ADA -> Asset B (DEX swap A_TO_B) to buy back
2. SHORT_REPAY     -> Repay Asset B loan, redeem qADA collateral
3. SHORT_WITHDRAW  -> Withdraw ADA from Liqwid
   -> Position status transitions to CLOSED
```

## Transaction Lifecycle (per order)

```
1. build-tx called
   -> StateMachine handler builds tx -> built_tx_id set

2. Client signs & submits tx to blockchain

3. Next build-tx call
   -> Cardanoscan API finds tx on-chain
   -> created_tx_id set, waiting = true

4. Next build-tx call
   -> waiting function checks if output is spent
   -> If spent: extract amounts, update next order's asset_in/amount_in
   -> If not spent: return "waiting" status with remaining time
```

## buildTx() Algorithm

```
1. Check for waiting order (created_tx_id set, waiting = true)
   a. Call waiting function for order type (e.g., waitingLongBuy)
   b. If confirmed: transition to next order or complete position
   c. If not confirmed: return waiting message

2. Find next unhandled order
   (has assetIn/amountIn/assetOut, created_tx_id is null/empty)

3. If order has built_tx_id:
   a. Search for it on Cardanoscan
   b. If found: set created_tx_id, return waiting
   c. If not found & expired: rebuild
   d. If not found & not expired: return waiting with time remaining

4. Build new transaction
   a. Call appropriate StateMachine handler
   b. Set built_tx_id and built_valid_to
   c. Return tx_raw for client to sign
```

## State Machine Handlers

Located in `src/api/state-machine.ts`. Each handler returns `BuiltResult = { txRaw, txId, validTo }`.

**LONG handlers:**
- `handleLongBuy` / `waitingLongBuy`
- `handleLongSupply` / `waitingLongSupply`
- `handleLongBorrow` / `waitingLongBorrow`
- `handleLongBuyMore` / `waitingLongBuyMore`
- `handleLongSell` / `waitingLongSell`
- `handleLongRepay` / `waitingLongRepay`
- `handleLongWithdraw` / `waitingLongWithdraw`

**SHORT handlers:**
- `handleShortSupply` / `waitingShortSupply`
- `handleShortBorrow` / `waitingShortBorrow`
- `handleShortSell` / `waitingShortSell`
- `handleShortBuy` / `waitingShortBuy`
- `handleShortRepay` / `waitingShortRepay`
- `handleShortWithdraw` / `waitingShortWithdraw`

## Leverage Calculation

- **LONG**: `amountBorrow = amountIn * (longLeverage - 1) + 4_000_000` (lovelace)
  - Example: 600 ADA at 1.5x -> borrow 304 ADA
- **SHORT**: `amountBorrow = aggregator.estimate(amountIn * shortLeverage)` (in asset B units)
  - Example: 600 ADA at 0.5x -> estimate 300 ADA worth of asset B -> borrow that amount
