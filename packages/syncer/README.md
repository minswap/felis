# @repo/syncer

A library for parsing Cardano DEX transactions from various protocols. This package provides syncers that can extract order and pool creation information from raw transactions.

## Installation

```bash
pnpm add @repo/syncer
```

## Prerequisites

Before using the syncers, you must initialize the WASM module:

```typescript
import { RustModule } from "@repo/ledger-utils";

await RustModule.load();
```

## Available Syncers

| Syncer | Protocol | CREATE_ORDER | CREATE_POOL |
|--------|----------|--------------|-------------|
| `MinswapV1Syncer` | Minswap DEX V1 | Yes | No |
| `MinswapV2Syncer` | Minswap DEX V2 | Yes | Yes |
| `MinswapStableswapSyncer` | Minswap Stableswap | Yes | Yes |
| `SundaeSwapV1Syncer` | SundaeSwap V1 | Yes | No |
| `SundaeSwapV3Syncer` | SundaeSwap V3 | Yes | Yes |
| `WingridersV1Syncer` | WingRiders V1 | Yes | No |
| `WingridersV2Syncer` | WingRiders V2 | Yes | No |
| `SplashSyncer` | Splash | Yes | No |

## Core Types

### Transaction

The `Transaction` type is the input format for all syncers. Convert from CSL (Cardano Serialization Lib) transaction:

```typescript
import { Transaction } from "@repo/syncer";
import { RustModule } from "@repo/ledger-utils";

// From CBOR hex
const cslTx = RustModule.getE.Transaction.from_hex(txCborHex);
const tx: Transaction = Transaction.fromECSL(cslTx);
```

**Transaction Structure:**

```typescript
type Transaction = {
  body: {
    inputs: TxIn[];
    outputs: TxOut[];
    referenceInputs: TxIn[];
    mint: Value;
  };
  witnessSet: {
    plutusData: Record<PlutusDataHash, Bytes>;
  };
};
```

### Output Types (Wrapped Strings)

All syncers return data as string-wrapped types for easy serialization:

```typescript
type WrapNum = string;     // BigInt as string, e.g. "3000000000"
type WrapAsset = string;   // Asset ID, e.g. "lovelace" or "policyId.assetName"
type WrapAddress = string; // Bech32 address, e.g. "addr1..."
```

## Usage Examples

### MinswapV1Syncer

```typescript
import { MinswapV1Syncer, Transaction } from "@repo/syncer";
import { NetworkEnvironment } from "@repo/ledger-core";

const result = MinswapV1Syncer.parseTx({
  tx: transaction,
  networkEnv: NetworkEnvironment.MAINNET,
});

if (result) {
  if (result.type === MinswapV1Syncer.TxType.CREATE_ORDER) {
    for (const order of result.newOrders) {
      console.log("Sender:", order.sender);
      console.log("Asset In:", order.assetIn);
      console.log("Amount In:", order.amountIn);
      console.log("Asset Out:", order.assetOut);
      console.log("Minimum Receive:", order.minimumReceive);
    }
  }
}
```

### MinswapV2Syncer

MinswapV2Syncer requires a `MapPool` to resolve LP assets to their underlying pair:

```typescript
import { MinswapV2Syncer, Transaction } from "@repo/syncer";
import { NetworkEnvironment } from "@repo/ledger-core";

// MapPool: LP asset string -> { assetA, assetB }
const mapPool: MinswapV2Syncer.MapPool = {
  "policyId.lpAssetName": {
    assetA: "lovelace",
    assetB: "policyId.tokenName",
  },
};

const result = MinswapV2Syncer.parseTx({
  tx: transaction,
  mapPool: mapPool,
  networkEnv: NetworkEnvironment.MAINNET,
});

if (result) {
  switch (result.type) {
    case MinswapV2Syncer.TxType.CREATE_ORDER:
      for (const order of result.newOrders) {
        console.log("LP Asset:", order.lpAsset);
        console.log("Asset In:", order.assetIn);
        console.log("Amount In:", order.amountIn);
        console.log("DEX Fee:", order.dexFee);
      }
      break;

    case MinswapV2Syncer.TxType.CREATE_POOL:
      console.log("LP Asset:", result.lpAsset);
      console.log("Asset A:", result.assetA);
      console.log("Asset B:", result.assetB);
      console.log("Reserve A:", result.reserveA);
      console.log("Reserve B:", result.reserveB);
      break;
  }
}
```

### MinswapStableswapSyncer

Stableswap syncer doesn't require a MapPool - pool configs are loaded from the package:

```typescript
import { MinswapStableswapSyncer, Transaction } from "@repo/syncer";
import { NetworkEnvironment } from "@repo/ledger-core";

const result = MinswapStableswapSyncer.parseTx({
  tx: transaction,
  networkEnv: NetworkEnvironment.MAINNET,
});

if (result) {
  switch (result.type) {
    case MinswapStableswapSyncer.TxType.CREATE_ORDER:
      for (const order of result.newOrders) {
        console.log("LP Asset:", order.lpAsset);
        console.log("Asset In:", order.assetIn);
        console.log("Amount In:", order.amountIn);
        console.log("Asset Out:", order.assetOut);
        console.log("Batcher Fee:", order.batcherFee);
      }
      break;

    case MinswapStableswapSyncer.TxType.CREATE_POOL:
      console.log("LP Asset:", result.lpAsset);
      console.log("Assets:", result.assets);
      console.log("Balances:", result.balances);
      console.log("Amp Coefficient:", result.amplificationCoefficient);
      break;
  }
}
```

### SundaeSwapV3Syncer

```typescript
import { SundaeSwapV3Syncer, Transaction } from "@repo/syncer";
import { NetworkEnvironment } from "@repo/ledger-core";

// MapPool: pool ident hex -> { assetA, assetB }
const mapPool: SundaeSwapV3Syncer.MapPool = {
  "1f04...": {
    assetA: "lovelace",
    assetB: "policyId.tokenName",
  },
};

const result = SundaeSwapV3Syncer.parseTx({
  tx: transaction,
  mapPool: mapPool,
  networkEnv: NetworkEnvironment.MAINNET,
});

if (result) {
  switch (result.type) {
    case SundaeSwapV3Syncer.TxType.CREATE_ORDER:
      for (const order of result.newOrders) {
        console.log("Asset In:", order.assetIn);
        console.log("Max Protocol Fee:", order.maxProtocolFee);
      }
      break;

    case SundaeSwapV3Syncer.TxType.CREATE_POOL:
      console.log("Pool Ident:", result.poolIdent);
      console.log("Bid Fee %:", result.bidFeePercent);
      console.log("Ask Fee %:", result.askFeePercent);
      break;
  }
}
```

## Helper Functions

The `Helper` namespace provides utility functions for quick transaction filtering:

```typescript
import { Helper, Transaction } from "@repo/syncer";

// Check if transaction pays to any address in a set
const addressSet = new Set(["addr1...", "addr2..."]);
if (Helper.hasPaidTo(tx, addressSet)) {
  // Transaction has output to one of these addresses
}

// Check if transaction pays to a specific script hash
if (Helper.hasPaidToScript(tx, "scriptHashHex")) {
  // Transaction has output to this script
}

// Check if transaction pays to any script in a set
const scriptHashSet = new Set(["hash1...", "hash2..."]);
if (Helper.hasPaidToScripts(tx, scriptHashSet)) {
  // Transaction has output to one of these scripts
}

// Check if transaction references specific UTXOs
const refSet = new Set(["txId#index", "txId2#index2"]);
if (Helper.hasReferenceTo(tx, refSet)) {
  // Transaction references one of these UTXOs
}
```

## Output Type Reference

### TxCreateOrder (Common Fields)

All order types include these fields:

| Field | Type | Description |
|-------|------|-------------|
| `sender` | `WrapAddress` | Address that created the order |
| `receiver` | `WrapAddress` | Address to receive output |
| `assetIn` | `WrapAsset` | Asset being swapped |
| `amountIn` | `WrapNum` | Amount being swapped |
| `assetOut` | `WrapAsset` | Asset to receive |
| `minimumReceive` | `WrapNum` | Minimum acceptable output |
| `deposit` | `WrapNum` | ADA deposit (returned after execution) |

### Protocol-Specific Order Fields

| Protocol | Additional Fields |
|----------|------------------|
| MinswapV1 | `dexFee` |
| MinswapV2 | `lpAsset`, `dexFee` |
| MinswapStableswap | `lpAsset`, `batcherFee` |
| SundaeSwapV1 | `scooperFee` |
| SundaeSwapV3 | `maxProtocolFee` |
| WingRiders | `dexFee` |
| Splash | `dexFee` |

### TxCreatePool

Pool creation output varies by protocol:

**MinswapV2:**
```typescript
{
  type: "CREATE_POOL";
  lpAsset: WrapAsset;
  assetA: WrapAsset;
  assetB: WrapAsset;
  reserveA: WrapNum;
  reserveB: WrapNum;
  reserveLP: WrapNum;
  tradingFeeAPercent: WrapNum;
  tradingFeeBPercent: WrapNum;
}
```

**MinswapStableswap:**
```typescript
{
  type: "CREATE_POOL";
  lpAsset: WrapAsset;
  assets: WrapAsset[];       // Multi-asset pool (2-3 assets)
  balances: WrapNum[];       // Balance for each asset
  totalLiquidity: WrapNum;
  amplificationCoefficient: WrapNum;
  fee: WrapNum;
  adminFee: WrapNum;
  feeDenominator: WrapNum;
}
```

**SundaeSwapV3:**
```typescript
{
  type: "CREATE_POOL";
  poolIdent: string;         // Pool identifier hex
  lpAsset: WrapAsset;
  assetA: WrapAsset;
  assetB: WrapAsset;
  reserveA: WrapNum;
  reserveB: WrapNum;
  reserveLP: WrapNum;
  bidFeePercent: WrapNum;
  askFeePercent: WrapNum;
}
```

## Integration Pattern

Typical integration flow for syncing transactions:

```typescript
import { RustModule } from "@repo/ledger-utils";
import { NetworkEnvironment } from "@repo/ledger-core";
import {
  Transaction,
  Helper,
  MinswapV1Syncer,
  MinswapV2Syncer,
  MinswapStableswapSyncer,
} from "@repo/syncer";

// Initialize WASM
await RustModule.load();

// Get transaction from your data source (e.g., Ogmios, Blockfrost)
const txCborHex = "84a400...";

// Parse transaction
const cslTx = RustModule.getE.Transaction.from_hex(txCborHex);
const tx = Transaction.fromECSL(cslTx);

// Try each syncer
const networkEnv = NetworkEnvironment.MAINNET;

// Minswap V1
const v1Result = MinswapV1Syncer.parseTx({ tx, networkEnv });
if (v1Result) {
  console.log("Minswap V1 transaction:", v1Result);
}

// Minswap V2 (requires mapPool)
const v2Result = MinswapV2Syncer.parseTx({ tx, mapPool, networkEnv });
if (v2Result) {
  console.log("Minswap V2 transaction:", v2Result);
}

// Minswap Stableswap
const stableResult = MinswapStableswapSyncer.parseTx({ tx, networkEnv });
if (stableResult) {
  console.log("Minswap Stableswap transaction:", stableResult);
}
```

## Notes

- All amounts are in lovelace (1 ADA = 1,000,000 lovelace)
- Asset format: `"lovelace"` for ADA, `"policyId.assetNameHex"` for tokens
- Returns `null` if transaction doesn't match the protocol
- Each syncer only parses swap/exchange orders (not deposits, withdrawals, etc.)
