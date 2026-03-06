# @minswap/felis-tx-builder

High-level Cardano transaction composition. Depends on `felis-ledger-core`, `felis-ledger-utils`, `felis-cip`.

**Location:** `packages/tx-builder`

## What's here
- `TxBuilder` — fluent API: collectFrom, payTo, mintAssets, validFrom/To, attachValidator, complete()
- `TxComplete` — signing (signWithPrivateKey, partialSign, assemble)
- `CoinSelectionAlgorithm` — MINSWAP (smart + change splitting), SPEND_ALL, SPEND_ALL_V2
- `UtxoSelection` — UTXO selection and collateral selection
- `EmulatorProvider` — off-chain provider for testing
