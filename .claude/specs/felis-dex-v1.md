# @minswap/felis-dex-v1

Minswap DEX V1 protocol types. Depends on `felis-ledger-core`, `felis-ledger-utils`.

**Location:** `packages/minswap-dex-v1`

## Purpose
Handles DEX V1 order parsing and validation. V1 is the legacy DEX protocol — mainly used for backward compatibility and syncing historical orders.

## Key Exports

### Order
```typescript
class Order {
  datum: OrderDatum
  orderInfo: OrderInfo  // { type: "SWAP", swapAsset, swapAmount, toAsset }

  static fromUtxo(utxo, datum, networkEnv): Result<Order, Error>
}

type OrderDatum = {
  sender: Address
  receiver: Address
  step: OrderStep
  batcherFee: bigint
  outputADA: bigint
}
```

### StepType
```typescript
enum StepType {
  SWAP_EXACT_IN
  SWAP_EXACT_OUT
  DEPOSIT
  WITHDRAW
  ZAP_IN
  // ... others
}
```

### Scripts
Contains compiled Plutus V1 scripts for mainnet and testnet (order validators, vesting scripts).

### Constants
DEX V1 configuration data for mainnet/testnet:
- Script hashes, addresses
- Factory tokens, pool tokens
- Batcher fee configurations

## Usage
Primarily consumed by the syncer package for parsing V1 swap orders from blockchain transactions.

```typescript
import { Order, StepType } from "@minswap/felis-dex-v1";
const orderResult = Order.fromUtxo(utxo, datum, networkEnv);
```
