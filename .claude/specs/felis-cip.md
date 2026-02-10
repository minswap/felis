# @minswap/felis-cip

Cardano Improvement Proposals implementation. Depends on `felis-ledger-core`, `felis-ledger-utils`.

**Location:** `packages/cip`

## Modules

### Bip32 — HD Wallet Key Derivation
```typescript
namespace Bip32 {
  deriveAddress({ bip32PublicKeyHex, deriveOffsets, networkEnv }): Address[]
  genPubKeyHashes(accountKey): Set<string>
  filterUtxos(publicKey, utxos): Utxo[]
  extractPublicKey(seed): CSLBip32PublicKey
  extractBip32PrivateKey(seed): string
  extractPrivateKey(options): PrivateKey
}
```

### Bip39 — Mnemonic Wallet Creation
```typescript
type BaseAddressWallet = { address: Address; rewardAddress: RewardAddress; paymentKey: PrivateKey; stakeKey: PrivateKey }
type EnterpriseAddressWallet = { address: Address; paymentKey: PrivateKey }

baseAddressWalletFromSeed(seed, networkEnv, options?): BaseAddressWallet
enterpriseAddressWalletFromSeed(seed, networkEnv, options?): EnterpriseAddressWallet
baseWalletFromEntropy(entropyHex, networkId): BaseAddressWallet
```

### CIP-25 — NFT Metadata Standard
```typescript
type CIP25NFT = { asset: Asset; name: string; image: string; mediaType?: string; files?: CIP25File[] }
type CIP25Metadata = { [policyId: string]: { [assetName: string]: Omit<CIP25NFT, "asset"> } }
```

### CIP-68 — Token Standard (Reference NFTs)
```typescript
enum Cip68UserTokenLabel { NFT = "000de140", FT = "0014df10" }

namespace CIP68 {
  isRefNFT(asset): boolean
  isNFT(asset): boolean
  isFT(asset): boolean
  isCip68(assetNameHex): boolean
  fromDataHex(datum, label): Cip68UserTokenAsset
  toDataHex(metadata): string
  mintCip68Token(options): Cip68MintTokenResult
  buildFTFromRefNFT(refNft): Maybe<Asset>
}
```
