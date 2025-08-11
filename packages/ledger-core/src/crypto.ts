import invariant from "@minswap/tiny-invariant";
import {
  type CborHex,
  type CSLEd25519KeyHash,
  type CSLPrivateKey,
  type CSLPublicKey,
  type ECSLPrivateKey,
  RustModule,
  safeFreeRustObjects,
} from "@repo/ledger-utils";
import * as cbor from "cbor";
import { Bytes } from "./bytes";
import type { NativeScript } from "./native-script";
import type { PlutusData } from "./plutus-json";

export class PrivateKey {
  readonly key: Bytes;

  constructor(key: Bytes) {
    this.key = key;
  }

  static fromHex(cborHex: string): PrivateKey {
    const decodedCbor = cbor.decodeAllSync(cborHex);
    invariant(decodedCbor[0] instanceof Uint8Array, "PrivateKey.fromHex: bad cbor");
    return new PrivateKey(new Bytes(decodedCbor[0]));
  }

  toHex(): string {
    // ChatGPT but test covered fromHex | toHex | round-trip by packages/sdk/src/test/bip32.test.ts
    // Encode the raw bytes as a CBOR byte string, matching fromHex
    return cbor.encode(this.key.bytes).toString("hex");
  }

  static fromCSL(pk: CSLPrivateKey): PrivateKey {
    return new PrivateKey(new Bytes(pk.as_bytes()));
  }

  toCSL(): CSLPrivateKey {
    const CSL = RustModule.get;
    try {
      return CSL.PrivateKey.from_normal_bytes(this.key.bytes);
    } catch {
      return CSL.PrivateKey.from_extended_bytes(this.key.bytes);
    }
  }

  toECSL(): ECSLPrivateKey {
    const ECSL = RustModule.getE;
    try {
      return ECSL.PrivateKey.from_normal_bytes(this.key.bytes);
    } catch {
      return ECSL.PrivateKey.from_extended_bytes(this.key.bytes);
    }
  }

  toPublic(): PublicKey {
    return PublicKey.fromCSL(this.toCSL().to_public());
  }
}

export class PublicKey {
  readonly key: Bytes;

  constructor(key: Bytes) {
    if (key.bytes.length !== 32) {
      throw new Error("new PublicKey: must has 32 bytes");
    }
    this.key = key;
  }

  static fromHex(cborHex: string): PublicKey {
    const decodedCbor = cbor.decodeAllSync(cborHex);
    invariant(decodedCbor[0] instanceof Uint8Array, "PublicKey.fromHex: bad cbor");
    return new PublicKey(new Bytes(decodedCbor[0]));
  }

  static fromCSL(pk: CSLPublicKey): PublicKey {
    return new PublicKey(new Bytes(pk.as_bytes()));
  }

  toCSL(): CSLPublicKey {
    const CSL = RustModule.get;
    return CSL.PublicKey.from_bytes(this.key.bytes);
  }

  toPublicKeyHash(): PublicKeyHash {
    const pubKey = this.toCSL();
    const keyHash = pubKey.hash();
    const publicKeyHash = PublicKeyHash.fromHex(keyHash.to_hex());
    safeFreeRustObjects(pubKey, keyHash);
    return publicKeyHash;
  }
}

export class PublicKeyHash {
  readonly keyHash: Bytes;

  constructor(keyHash: Bytes) {
    if (keyHash.bytes.length !== 28) {
      throw new Error("new PublicKeyHash: must has 28 bytes");
    }
    this.keyHash = keyHash;
  }

  static fromHex(pk: CborHex<CSLEd25519KeyHash>): PublicKeyHash {
    return new PublicKeyHash(Bytes.fromHex(pk));
  }

  toCSL(): CSLEd25519KeyHash {
    const CSL = RustModule.get;
    return CSL.Ed25519KeyHash.from_bytes(this.keyHash.bytes);
  }

  equals(other: PublicKeyHash): boolean {
    return this.keyHash.compare(other.keyHash) === 0;
  }

  clone(): PublicKeyHash {
    return new PublicKeyHash(this.keyHash.clone());
  }

  toPlutusJson(): PlutusData {
    return {
      bytes: this.keyHash.hex,
    };
  }
}

export type KeyPair = {
  privateKey: PrivateKey;
  publicKey: PublicKey;
  nativeScriptCbor: string;
  nativeScript: NativeScript;
};

export namespace KeyPair {
  export function fromPrivateKeyHex(skey: CborHex<CSLPrivateKey>): KeyPair {
    const CSL = RustModule.get;
    const privateKey = PrivateKey.fromHex(skey);
    const cslPrivateKey = privateKey.toCSL();
    const cslPublicKey = cslPrivateKey.to_public();
    const publicKey = PublicKey.fromCSL(cslPublicKey);
    const publicKeyHash = publicKey.toPublicKeyHash();
    const cslPublicKeyHash = publicKeyHash.toCSL();
    const cslScriptPubKey = CSL.ScriptPubkey.new(cslPublicKeyHash);
    const cslNativeScript = CSL.NativeScript.new_script_pubkey(cslScriptPubKey);
    const nativeScriptBytes = new Bytes(cslNativeScript.to_bytes());

    safeFreeRustObjects(cslPrivateKey, cslPublicKey, cslPublicKeyHash, cslScriptPubKey, cslNativeScript);

    return {
      privateKey: privateKey,
      publicKey: publicKey,
      nativeScriptCbor: nativeScriptBytes.hex,
      nativeScript: {
        type: "sig",
        keyHash: publicKeyHash.keyHash.hex,
      },
    };
  }

  export function fromPublicKey(publicKey: PublicKey): Omit<KeyPair, "privateKey"> {
    const CSL = RustModule.get;
    const publicKeyHash = publicKey.toPublicKeyHash();
    const cslPublicKeyHash = publicKeyHash.toCSL();
    const cslScriptPubKey = CSL.ScriptPubkey.new(cslPublicKeyHash);
    const cslNativeScript = CSL.NativeScript.new_script_pubkey(cslScriptPubKey);
    const nativeScriptBytes = new Bytes(cslNativeScript.to_bytes());

    safeFreeRustObjects(cslPublicKeyHash, cslScriptPubKey, cslNativeScript);

    return {
      publicKey: publicKey,
      nativeScriptCbor: nativeScriptBytes.hex,
      nativeScript: {
        type: "sig",
        keyHash: publicKeyHash.keyHash.hex,
      },
    };
  }

  export function fromCSLPublicKey(vkey: CSLPublicKey): Omit<KeyPair, "privateKey"> {
    const publicKey = PublicKey.fromCSL(vkey);
    return fromPublicKey(publicKey);
  }

  export function fromPublicKeyHex(vkey: CborHex<CSLPublicKey>): Omit<KeyPair, "privateKey"> {
    const publicKey = PublicKey.fromHex(vkey);
    return fromPublicKey(publicKey);
  }
}
