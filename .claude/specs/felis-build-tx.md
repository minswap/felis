# @minswap/felis-build-tx

DEX transaction builder. Depends on `felis-ledger-core`, `felis-ledger-utils`, `felis-tx-builder`, `felis-dex-v2`.

**Location:** `packages/minswap-build-tx`

## DEXOrderTransaction — DEX Order Building

### Main Entry Point
```typescript
DEXOrderTransaction.createBulkOrdersTx(options: BulkOrdersOption): TxBuilder

type BulkOrdersOption = {
  networkEnv: NetworkEnvironment
  sender: Address
  orderOptions: MultiDEXOrderOptions[]  // Array of orders to batch
  outerTxb?: TxBuilder                  // Reuse existing builder
  receiver?: Address                     // Optional alternate receiver
}
```

### Order Option Types
```typescript
type V2SwapExactInOptions = {
  lpAsset: Asset; version: DexVersion.DEX_V2;
  type: OrderV2StepType.SWAP_EXACT_IN;
  assetIn: Asset; amountIn: bigint;
  minimumAmountOut: bigint; direction: OrderV2Direction;
  killOnFailed: boolean; isLimitOrder: boolean;
}

// Also: V2SwapExactOutOptions, V2DepositOptions, V2WithdrawOptions,
// V2StopOptions, V2OCOOptions, V2ZapOutOptions, V2PartialSwapOptions,
// V2WithdrawImbalanceOptions, V2MultiRoutingOptions
```

### Helper Functions
```typescript
DEXOrderTransaction.buildOrderValue(option): Value    // Calculate UTxO value needed
DEXOrderTransaction.buildV2OrderStep(option): OrderV2Step  // Convert to Plutus step
DEXOrderTransaction.getOrderMetadata(option): string   // Transaction label
```

## Djed — Stablecoin Protocol

```typescript
namespace Djed {
  getConfig(networkEnv): Config              // Lazy singleton
  getPoolData(poolUtxo): PoolData            // ADA reserve, DJED/SHEN circulation
  getOracleData(oracleUtxo): OracleData      // Exchange rate, price bounds

  estimateMintShen(options): EstimateResult   // Calculate with slippage
  mintShen(options): TxBuilder                // Build mint transaction

  namespace Rate {
    shenAdaRate(params): BigNumber
    shen2ada(options): BigNumber
    ada2shen(options): BigNumber
  }

  namespace DexFee {
    getFee(amount, networkEnv): bigint        // min(max(ceil(amount * pct), min), max)
  }
}
```

## MetadataMessage — Transaction Labels

```typescript
// DEX: DEX_MARKET_ORDER, DEX_LIMIT_ORDER, DEX_STOP_ORDER, DEX_OCO_ORDER
// Liquidity: DEX_DEPOSIT_ORDER, DEX_WITHDRAW_ORDER, DEX_ZAP_IN_ORDER
// Advanced: DEX_PARTIAL_SWAP_ORDER, DEX_ROUTING_ORDER, DEX_MIXED_ORDERS
// Farming: STAKE_LIQUIDITY_V2, HARVEST_V2
```

## Usage Example
```typescript
const txb = DEXOrderTransaction.createBulkOrdersTx({
  networkEnv: NetworkEnvironment.MAINNET,
  sender: Address.fromBech32("addr1..."),
  orderOptions: [{
    lpAsset: Asset.fromString("..."),
    version: DexVersion.DEX_V2,
    type: OrderV2StepType.SWAP_EXACT_IN,
    assetIn: ADA,
    amountIn: 100_000_000n,
    minimumAmountOut: 1n,
    direction: OrderV2Direction.A_TO_B,
    killOnFailed: false,
    isLimitOrder: false,
  }],
});

const result = await txb.complete({
  changeAddress: sender,
  provider,
  walletUtxos,
  coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
});
```
