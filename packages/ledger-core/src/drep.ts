import type { Bytes, PublicKeyHash } from ".";
import { CSLDRep, RustModule } from "@repo/ledger-utils";

export enum DRepEnum {
  KEY_HASH = 0,
  SCRIPT_HASH = 1,
  ALWAYS_ABSTAIN = 2,
  ALWAYS_NO_CONFIDENCE = 3,
}

export type DRep =
  | { type: DRepEnum.KEY_HASH; publicKeyHash: PublicKeyHash }
  | { type: DRepEnum.SCRIPT_HASH; scriptHash: Bytes }
  | { type: DRepEnum.ALWAYS_ABSTAIN }
  | { type: DRepEnum.ALWAYS_NO_CONFIDENCE };

export namespace DRep {
  export function clone(drep: DRep): DRep {
    switch (drep.type) {
      case DRepEnum.KEY_HASH:
        return { type: DRepEnum.KEY_HASH, publicKeyHash: drep.publicKeyHash.clone() };
      case DRepEnum.SCRIPT_HASH:
        return { type: DRepEnum.SCRIPT_HASH, scriptHash: drep.scriptHash.clone() };
      case DRepEnum.ALWAYS_ABSTAIN:
        return { type: DRepEnum.ALWAYS_ABSTAIN };
      case DRepEnum.ALWAYS_NO_CONFIDENCE:
        return { type: DRepEnum.ALWAYS_NO_CONFIDENCE };
      default:
        throw new Error("Unknown DRep type");
    }
  }

  export function toCSL(drep: DRep): CSLDRep {
    const CSL = RustModule.get;
    switch (drep.type) {
      case DRepEnum.KEY_HASH:
        return CSL.DRep.new_key_hash(drep.publicKeyHash.toCSL());
      case DRepEnum.SCRIPT_HASH:
        return CSL.DRep.new_script_hash(CSL.ScriptHash.from_bytes(drep.scriptHash.bytes));
      case DRepEnum.ALWAYS_ABSTAIN:
        return CSL.DRep.new_always_abstain();
      case DRepEnum.ALWAYS_NO_CONFIDENCE:
        return CSL.DRep.new_always_no_confidence();
      default:
        throw new Error("Unsupported DRep type");
    }
  }
}
