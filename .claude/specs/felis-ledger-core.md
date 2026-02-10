# @minswap/felis-ledger-core

Cardano blockchain primitives. Depends on `felis-ledger-utils`.

**Location:** `packages/ledger-core`

## Core Types

### Address
```typescript
class Address {
  bech32: string
  static fromBech32(s): Address
  static fromHex(s: CborHex<CSLAddress>): Address
  toHex(): CborHex<CSLAddress>
  toStakeAddress(): RewardAddress | null
  toPubKeyHash(): Maybe<PublicKeyHash>
  toPlutusJson(): PlutusData
  static fromPlutusJson(d, networkEnv): Address
  equals(other): boolean
}

class RewardAddress extends Address {
  isPubKey(): boolean
  isScript(): boolean
}
```

### Asset
```typescript
class Asset {
  currencySymbol: Bytes  // 28-byte policy ID
  tokenName: Bytes       // 0-32 bytes
  static fromString(s): Asset       // "policyID.tokenName" or "lovelace"
  static fromBlockFrostString(s): Asset
  toBlockFrostString(): string
  toString(): string
  equals(other): boolean
  compare(other): number
}
const ADA: Asset  // lovelace sentinel
```

### Value (Multi-Asset)
```typescript
class Value {
  get(asset): bigint
  coin(): bigint                    // ADA amount
  set(asset, x): Value
  add(asset, x): Value
  subtract(asset, x): Value
  addAll(other): Value
  subtractAll(other): Value
  has(asset): boolean
  assets(): Asset[]
  canCover(other): boolean
  isAdaOnly(): boolean
  toHex(): CborHex<CSLValue>
  static fromHex(input): Value
  getMinimumLovelace(isScript, networkEnv): bigint
}
```

### UTXO / TxIn / TxOut
```typescript
type Utxo = { input: TxIn; output: TxOut }
type TxIn = { txId: Bytes; index: number }
namespace TxIn {
  fromString(s): TxIn        // "txId#index"
  toString(txIn): string
  compare(a, b): number
  equals(a, b): boolean
  toPlutusJson / fromPlutusJson
}

class TxOut {
  address: Address
  value: Value
  datumSource: Maybe<DatumSource>
  scriptRef: Maybe<ScriptReference>
  static newPubKeyOut({address, value}): TxOut
  static newScriptOut({address, value, datumSource}): TxOut
  getMinimumADA(networkEnv): bigint
  addMinimumADAIfRequired(networkEnv): TxOut
  getInlineDatum(): Result<Bytes, Error>
  toHex() / fromHex()
}

enum DatumSourceType {
  DATUM_HASH       // Plutus V1
  OUTLINE_DATUM    // Hash + datum in witness
  INLINE_DATUM     // Plutus V2+ (inline)
}
```

### Transaction
```typescript
type TxBody = {
  inputs: Utxo[]; outputs: TxOut[]; fee: bigint;
  mint: Value; withdrawals: Withdrawals;
  validity?: ValidityRange; referenceInputs: Utxo[];
  requireSigners: PublicKeyHash[];
}
type Transaction = { body: TxBody; witness: Witness; metadata: Record<string,any> }
```

### Crypto
```typescript
class PrivateKey { toPublic(): PublicKey; toCSL(); toECSL() }
class PublicKey { key: Bytes; toPublicKeyHash(): PublicKeyHash }
class PublicKeyHash { keyHash: Bytes; equals(other): boolean }
```

### Bytes
```typescript
class Bytes {
  hex: string; bytes: Uint8Array
  static fromHex(s) / fromString(s) / fromBase64(s) / fromPlutusJson(d)
  toHex() / toString() / toPlutusJson()
  equals(other) / compare(other) / concat(other)
}
```

### PlutusData (Serialization)
```typescript
type PlutusData = PlutusConstr | PlutusList | PlutusMap | PlutusInt | PlutusBytes
PlutusConstr.unwrap<T>(d, constraints): T
PlutusInt.unwrapToBigInt(d): bigint
PlutusBytes.unwrap(d): string  // hex
```

### NetworkEnvironment
```typescript
enum NetworkEnvironment { MAINNET=764824073, TESTNET_PREVIEW=2, TESTNET_PREPROD=1 }
```

### XJSON — Type-Preserving JSON
```typescript
XJSON.stringify(a): string   // Preserves bigint, BigNumber, Date, Bytes, Asset, Address, Value
XJSON.parse<T>(s): T
```

### Slot/Time Conversion
```typescript
getTimeFromSlotMagic(network, slot): Date
getSlotFromTimeMagic(network, time): number
```

### Protocol Parameters
```typescript
DEFAULT_STABLE_PROTOCOL_PARAMS[networkEnv]: StableProtocolParams
// txFeeFixed, txFeePerByte, utxoCostPerByte, maxTxSize, etc.
```
