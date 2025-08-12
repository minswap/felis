import { RustModule, safeFreeRustObjects } from "@repo/ledger-utils";
import type { RewardAddress } from "./address";
import { Bytes } from "./bytes";

export type StakeKeyDelegation = {
  stakeAddress: RewardAddress;
  stakePool: StakePool;
};

export class StakePool {
  public hash: Bytes;

  constructor(hash: Bytes) {
    this.hash = hash;
  }

  // example: pool1ases3nklh6gyjf74r7dqm89exjfd520z9cefqru959wcccmrdlk
  static fromBech32(s: string): StakePool {
    const CSL = RustModule.get;
    const keyHash = CSL.Ed25519KeyHash.from_bech32(s);
    const ret = new StakePool(Bytes.fromHex(keyHash.to_hex()));
    safeFreeRustObjects(keyHash);
    return ret;
  }

  // example: pool1ases3nklh6gyjf74r7dqm89exjfd520z9cefqru959wcccmrdlk
  toBech32(): string {
    const CSL = RustModule.get;
    const keyHash = CSL.Ed25519KeyHash.from_hex(this.hash.hex);
    const ret = keyHash.to_bech32("pool");
    safeFreeRustObjects(keyHash);
    return ret;
  }

  // example: ec3308cedfbe904927d51f9a0d9cb93492da29e22e32900f85a15d8c
  static fromHex(s: string): StakePool {
    return new StakePool(Bytes.fromHex(s));
  }

  clone(): StakePool {
    return new StakePool(this.hash.clone());
  }
}
