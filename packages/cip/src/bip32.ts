import invariant from "@minswap/tiny-invariant";
import {
  Address,
  AddressType,
  Bytes,
  type CardanoAddress,
  CredentialType,
  type NetworkEnvironment,
  networkEnvironmentToNetworkID,
  PrivateKey,
  type Utxo,
} from "@repo/ledger-core";
import {
  type CSLBip32PrivateKey,
  type CSLBip32PublicKey,
  Maybe,
  RustModule,
  safeFreeRustObjects,
} from "@repo/ledger-utils";
import { mnemonicToEntropy } from "bip39";

/**
 * https://medium.com/@oyinoladapo5/understanding-hierarchical-deterministic-bip32-wallet-part1-6d7b428e4bdc
 * Single Seed, Multiple Addresses: minswap support this.
 */
export namespace Bip32 {
  const harden = (num: number): number => 0x80000000 + num;

  export function deriveAddress({
    bip32PublicKeyHex,
    deriveOffsets,
    networkEnv,
  }: {
    bip32PublicKeyHex: string;
    deriveOffsets: number[];
    networkEnv: NetworkEnvironment;
  }): Address[] {
    const CSL = RustModule.get;
    const network = networkEnvironmentToNetworkID(networkEnv);
    const accountKey = CSL.Bip32PublicKey.from_hex(bip32PublicKeyHex);
    const firstDerived = accountKey.derive(0);
    const addresses: Address[] = [];

    for (const offset of deriveOffsets) {
      // ref to bip39.ts
      const secondDerived = firstDerived.derive(offset);
      const paymentKey = secondDerived.to_raw_key();
      const paymentKeyHash = paymentKey.hash();
      const rawPaymentKeyHash = paymentKeyHash.to_hex();
      const cardanoAddress: CardanoAddress = {
        type: AddressType.ENTERPRISE_ADDRESS,
        network,
        payment: {
          type: CredentialType.PUB_KEY_CREDENTIAL,
          payload: Bytes.fromHex(rawPaymentKeyHash),
        },
      };
      const address = Address.fromCardanoAddress(cardanoAddress);
      addresses.push(address);
      safeFreeRustObjects(secondDerived, paymentKey, paymentKeyHash);
    }

    safeFreeRustObjects(accountKey, firstDerived);
    return addresses;
  }

  export function genPubKeyHashes(accountKey: CSLBip32PublicKey): Set<string> {
    const pubKeyHashes = new Set<string>();
    const stakeKeyHash = accountKey.derive(2).derive(0).to_raw_key().hash();
    pubKeyHashes.add(stakeKeyHash.to_hex());
    for (let i = 0; i < 100; i++) {
      const receivingPubKeyHash = accountKey.derive(0).derive(i).to_raw_key().hash();
      const changePubKeyHash = accountKey.derive(1).derive(i).to_raw_key().hash();
      pubKeyHashes.add(receivingPubKeyHash.to_hex());
      pubKeyHashes.add(changePubKeyHash.to_hex());
    }
    return pubKeyHashes;
  }

  export function filterUtxos(publicKey: CSLBip32PublicKey, utxos: Utxo[]): Utxo[] {
    const pubKeyHashes = genPubKeyHashes(publicKey);
    const ownedUtxos: Utxo[] = [];
    for (const utxo of utxos) {
      const addrPkh = utxo.output.address.toPubKeyHash();
      // Utxo that contains Script Address is not be used by PubKey wallet
      if (Maybe.isNothing(addrPkh)) {
        continue;
      }
      /**
       * filter the utxos that have the Public Key Hash is in @deriveMap
       */
      if (pubKeyHashes.has(addrPkh.keyHash.hex)) {
        ownedUtxos.push(utxo);
      }
    }
    return ownedUtxos;
  }

  export function extractPublicKey(seed: string): CSLBip32PublicKey {
    const CSL = RustModule.get;
    const entropy = mnemonicToEntropy(seed);
    const rootKey = CSL.Bip32PrivateKey.from_bip39_entropy(Bytes.fromHex(entropy).bytes, new Uint8Array());
    const accountKey = rootKey
      .derive(harden(1852)) // purpose
      .derive(harden(1815)) // coin type
      .derive(harden(0));
    return accountKey.to_public();
  }

  export function extractBip32PrivateKey(seed: string): string {
    const CSL = RustModule.get;
    const entropy = mnemonicToEntropy(seed);
    const rootKey = CSL.Bip32PrivateKey.from_bip39_entropy(Bytes.fromHex(entropy).bytes, new Uint8Array());
    const accountKey = rootKey
      .derive(harden(1852)) // purpose
      .derive(harden(1815)) // coin type
      .derive(harden(0));
    return accountKey.to_hex();
  }

  export function extractPrivateKey(
    options: Partial<{
      seed: string;
      bip32PrivateKey: CSLBip32PrivateKey;
      bip32PrivateKeyRaw: string;
      deriveOffset: number;
    }>,
  ): PrivateKey {
    const CSL = RustModule.get;
    const { seed, bip32PrivateKey, deriveOffset, bip32PrivateKeyRaw } = options;
    let accountKey: CSLBip32PrivateKey | undefined;
    if (seed) {
      const entropy = mnemonicToEntropy(seed);
      const rootKey = CSL.Bip32PrivateKey.from_bip39_entropy(Bytes.fromHex(entropy).bytes, new Uint8Array());
      accountKey = rootKey
        .derive(harden(1852)) // purpose
        .derive(harden(1815)) // coin type
        .derive(harden(0));
    } else if (bip32PrivateKey) {
      accountKey = bip32PrivateKey;
    } else if (bip32PrivateKeyRaw) {
      accountKey = CSL.Bip32PrivateKey.from_hex(bip32PrivateKeyRaw);
    }
    invariant(accountKey, "Either seed or bip32PrivateKey must be provided");
    const paymentKey = accountKey
      .derive(0)
      .derive(deriveOffset ?? 0)
      .to_raw_key();
    return PrivateKey.fromCSL(paymentKey);
  }
}
