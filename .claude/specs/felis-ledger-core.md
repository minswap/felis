# @minswap/felis-ledger-core

Cardano blockchain primitives. Depends on `felis-ledger-utils`.

**Location:** `packages/ledger-core`

## What's here
- `Address` — bech32/hex conversion, stake address extraction, PlutusJson serialization
- `Asset` — policy ID + token name, `ADA` constant for lovelace
- `Value` — multi-asset container (get/set/add/subtract/canCover)
- `TxIn` / `TxOut` / `Utxo` — transaction inputs/outputs
- `Transaction` / `TxBody` — full transaction types
- `PrivateKey` / `PublicKey` / `PublicKeyHash` — crypto keys
- `Bytes` — hex/string/base64 wrapper
- `PlutusData` — Plutus serialization (Constr, List, Map, Int, Bytes)
- `NetworkEnvironment` — MAINNET (764824073), TESTNET_PREVIEW (2), TESTNET_PREPROD (1)
- `XJSON` — type-preserving JSON (bigint, Date, Bytes, Asset, Address, Value)
- `getTimeFromSlotMagic` / `getSlotFromTimeMagic` — slot/time conversion
