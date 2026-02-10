# @minswap/felis-tx-builder

High-level Cardano transaction composition. Depends on `felis-ledger-core`, `felis-ledger-utils`, `felis-cip`.

**Location:** `packages/tx-builder`

## TxBuilder — Fluent Transaction Builder

```typescript
const txb = new TxBuilder(networkEnv);

// Inputs
txb.readFrom(...utxos)                              // Reference inputs (read-only)
txb.collectFromPubKey(...utxos)                      // Spend from pubkey
txb.collectFromPlutusContract(utxos, redeemer, datum?) // Spend from script

// Outputs
txb.payTo(...outputs)                                // Payment outputs
txb.addSigner(address) / addSignerKey(keyHash)       // Required signers

// Minting
txb.mintAssets(value, redeemer?)                      // Mint/burn tokens

// Time
txb.validFrom(slot) / validTo(slot)
txb.validFromUnixTime(ts) / validToUnixTime(ts)

// Scripts
txb.attachValidator(validator)                        // Native/PlutusV1/V2/V3

// Metadata
txb.addMessageMetadata("msg", data)

// Build
const result = await txb.complete({
  changeAddress, provider, walletUtxos,
  coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
});
```

## TxComplete — Signing & Assembly
```typescript
txComplete.signWithPrivateKey(...privateKeys)         // Sign and assemble
txComplete.partialSignWithPrivateKey(...keys)          // Get partial witness
txComplete.assemble(witnesses)                         // Assemble external witnesses
```

## Build Options
```typescript
type TxBuilderBuildOptions = {
  changeAddress: Address;
  provider: ITxBuilderProvider;          // getUnstableProtocolParams()
  walletUtxos: Utxo[];
  walletCollaterals?: Utxo[];
  coinSelectionAlgorithm: CoinSelectionAlgorithm;
  extraFee?: bigint;
}
```

## CoinSelectionAlgorithm
```typescript
enum CoinSelectionAlgorithm {
  MINSWAP         // Smart selection + change splitting
  SPEND_ALL       // Single change output
  SPEND_ALL_V2    // Enhanced spend-all
}
```

## Utilities
```typescript
// UTXO Selection
UtxoSelection.selectUtxos(required, available, splitChange, changeAddr, networkEnv)
UtxoSelection.selectCollaterals({walletCollaterals, walletUtxos, ...})

// Fee Calculation
TxBuilderUtils.maxTxSizeFee(networkEnv): bigint
TxBuilderUtils.calContractFee(networkEnv, exUnit): bigint
TxBuilderUtils.calReferenceInputsFee({inputs, referenceInputs, referenceFeeCfg}): bigint

// Change Management
ChangeOutputBuilder.buildChangeOut({networkEnv, txDraft, changeAddress, walletUtxos, protocolParams})

// Transaction Chaining
TxDraft.extractUtxoState({txId, txDraft, changeAddress, walletUtxos}): UtxoState
```

## EmulatorProvider
Off-chain provider for testing (implements ITxBuilderProvider without blockchain).

## Key Constants
```
MAX_TOKEN_BUNDLE_SIZE = 20
DEFAULT_COLLATERAL_AMOUNT = 5_000_000n (5 ADA)
```
