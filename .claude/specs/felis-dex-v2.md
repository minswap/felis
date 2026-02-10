# @minswap/felis-dex-v2

Minswap DEX V2 protocol types and calculations. Depends on `felis-ledger-core`, `felis-ledger-utils`.

**Location:** `packages/minswap-dex-v2`

## OrderV2 — DEX Orders

### Order Types (OrderV2StepType)
```typescript
enum OrderV2StepType {
  SWAP_EXACT_IN=0, SWAP_EXACT_OUT=1, STOP_LOSS=2, OCO=3,
  DEPOSIT=4, WITHDRAW=5, ZAP_OUT=6, PARTIAL_SWAP=7,
  WITHDRAW_IMBALANCE=8, SWAP_MULTI_ROUTING=9, DONATION=10
}
enum OrderV2Direction { A_TO_B, B_TO_A }
enum DexVersion { DEX_V1, DEX_V2, STABLESWAP }
```

### OrderV2 Class
```typescript
class OrderV2 extends BaseUtxoModel {
  static new(constr): Result<OrderV2, InvalidOrder>
  static fromUtxo(utxo): Result<OrderV2, InvalidOrder>
  owner: Address
  lpAsset: Asset
  canceller: Address
  isExpired(currentSlot): boolean
  getSwapAmount() / getDepositAmount() / getWithdrawAmount()
}
```

### OrderV2Datum (Plutus Serialization)
```typescript
type OrderV2Datum = {
  author: OrderV2Author       // canceller, refundReceiver, successReceiver
  lpAsset: Asset
  step: OrderV2Step            // Discriminated union of 11 types
  maxBatcherFee: bigint
  expiredOptions?: OrderV2ExpirySetting
}
namespace OrderV2Datum {
  fromPlutusJson(d) / toPlutusJson(d)
  fromDataHex(hex, networkEnv) / toDataHex(d)
}
```

## PoolV2 — Liquidity Pools

```typescript
class PoolV2 extends BaseUtxoModel {
  static fromUtxo(utxo): Result<PoolV2, Error>
  assetA: Asset; assetB: Asset; lpAsset: Asset
  totalLiquidity: bigint
  datumReserveA/B: bigint; valueReserveA/B: bigint
  baseFee: { feeANumerator: bigint; feeBNumerator: bigint }  // denominator=10000
  getDirectionByAssetIn(asset): OrderV2Direction
  cloneNewPoolState(newReserves): PoolV2
  static computeLpAsset(assetA, assetB): Asset  // SHA3 derived
}
```

## DexV2Calculation — Math Engine

```typescript
namespace DexV2Calculation {
  // Swaps
  calculateSwapExactIn(options): { amountOut, newReserves, volume, fee }
  calculateSwapExactOut(options): Result<{ necessaryAmountIn, ... }, Error>
  calculateAmountOut({reserveIn, reserveOut, amountIn, tradingFeeNum}): bigint
  calculateAmountIn({reserveIn, reserveOut, amountOut, tradingFeeNum}): bigint

  // Liquidity
  calculateInitialLiquidity(amountA, amountB): bigint  // sqrt(a*b)
  calculateDeposit(options): { lpAmount, ... }
  calculateWithdraw(options): { amountA, amountB }
  calculateWithdrawAmount(options): { withdrawnA, withdrawnB }

  // Advanced
  calculateZapOut(options): { swapAmount, amountOut }
  calculatePartialSwap(options): Result<{ swapableAmount, amountOut }, Error>
  calculateSwapMultiRouting(options): { amountOut, midPrice }

  // Analytics
  calculatePriceImpact(options): Result<number, Error>  // Percentage
  calculateEarnedFeeIn(options): bigint
}
```

## Configuration

```typescript
getDexV2Configs(networkEnv): DexV2Config
getDexV2PoolAddresses(networkEnv): string[]
getDefaultDexV2OrderAddress(networkEnv): string
getDexV2OrderScriptHash(networkEnv): string
buildDexV2OrderAddress(networkEnv, stakeCredential): string
```

## Batcher Fees
```typescript
BATCHER_FEE_DEX_V2: Record<OrderV2StepType, bigint>
// Swaps: 700_000, Deposits: 750_000, Routing: 900_000, etc.
```

## Error Handling
```typescript
class InvalidOrder { txIn; address; owner; error: OrderError }
enum ErrorCode { MISSING_DATUM_HASH, INVALID_PARAMETER, EXPIRED, ... }
```
