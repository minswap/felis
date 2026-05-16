import {
  type CborHex,
  type CSLExUnits,
  type CSLRedeemer,
  type CSLRedeemers,
  type CSLRedeemerTag,
  RustModule,
  safeFreeRustObjects,
  unwrapRustVec,
} from "@minswap/felis-ledger-utils";
import * as cbors from "@stricahq/cbors";
import type { Bytes } from "./bytes";
import { PlutusData, type PreEncodedPlutusData } from "./plutus-json";

export enum RedeemerType {
  SPEND = 0,
  MINT = 1,
  CERT = 2,
  REWARD = 3,
}

export type ExUnit = {
  memory: bigint;
  step: bigint;
};

export namespace ExUnit {
  export function toCSL(exUnit: ExUnit): CSLExUnits {
    const CSL = RustModule.get;
    const mem = CSL.BigNum.from_str(exUnit.memory.toString());
    const step = CSL.BigNum.from_str(exUnit.step.toString());
    const exUnits = CSL.ExUnits.new(mem, step);

    safeFreeRustObjects(mem, step);

    return exUnits;
  }
}

export type Redeemer = {
  type: RedeemerType;
  index: number;
  redeemerData: PlutusData;
  exUnit: ExUnit;
};

type EncodedRedeemer = [number, number, PreEncodedPlutusData, [number, number]];

export namespace Redeemer {
  export function fromCSLSingular(cslRedeemer: CSLRedeemer): Redeemer {
    const CSL = RustModule.get;
    const cslRedeemerTag = cslRedeemer.tag();
    const cslRedeemerTagKind = cslRedeemerTag.kind();
    let redeemerType: RedeemerType;
    switch (cslRedeemerTagKind) {
      case CSL.RedeemerTagKind.Spend: {
        redeemerType = RedeemerType.SPEND;
        break;
      }
      case CSL.RedeemerTagKind.Mint: {
        redeemerType = RedeemerType.MINT;
        break;
      }
      case CSL.RedeemerTagKind.Cert: {
        redeemerType = RedeemerType.CERT;
        break;
      }
      case CSL.RedeemerTagKind.Reward: {
        redeemerType = RedeemerType.REWARD;
        break;
      }
      default: {
        throw new Error(`ExUnit: Unsupported Redeemer Kind: ${cslRedeemerTagKind}`);
      }
    }
    const cslIndex = cslRedeemer.index();
    const index = Number(cslIndex.to_str());
    const cslRedeemerData = cslRedeemer.data();
    const redeemerData = PlutusData.fromDataHex(cslRedeemerData.to_hex());
    const cslExUnit = cslRedeemer.ex_units();
    const cslMem = cslExUnit.mem();
    const cslStep = cslExUnit.steps();
    const exUnit: Redeemer = {
      type: redeemerType,
      index: index,
      redeemerData: redeemerData,
      exUnit: {
        memory: BigInt(cslMem.to_str()),
        step: BigInt(cslStep.to_str()),
      },
    };
    safeFreeRustObjects(cslRedeemerTag, cslRedeemer, cslIndex, cslRedeemerData, cslExUnit, cslMem, cslStep);

    return exUnit;
  }

  export function fromBytesSingular(redeemerBytes: Bytes): Redeemer {
    const CSL = RustModule.get;
    const cslRedeemer = CSL.Redeemer.from_bytes(redeemerBytes.bytes);
    const redeemer = Redeemer.fromCSLSingular(cslRedeemer);
    return redeemer;
  }

  export function fromHex(redeemers: CborHex<CSLRedeemers>): Redeemer[] {
    const CSL = RustModule.get;
    const cslRedeemers = CSL.Redeemers.from_hex(redeemers);
    return unwrapRustVec(cslRedeemers).map(Redeemer.fromCSLSingular);
  }

  export function toCSL(redeemers: Redeemer[]): CSLRedeemers {
    const CSL = RustModule.get;
    const cRedeemers = CSL.Redeemers.new();
    for (const redeemer of redeemers) {
      let cRedeemerTag: CSLRedeemerTag;
      switch (redeemer.type) {
        case RedeemerType.SPEND: {
          cRedeemerTag = CSL.RedeemerTag.new_spend();
          break;
        }
        case RedeemerType.MINT: {
          cRedeemerTag = CSL.RedeemerTag.new_mint();
          break;
        }
        case RedeemerType.REWARD: {
          cRedeemerTag = CSL.RedeemerTag.new_reward();
          break;
        }
        case RedeemerType.CERT: {
          cRedeemerTag = CSL.RedeemerTag.new_cert();
          break;
        }
      }
      cRedeemers.add(
        CSL.Redeemer.new(
          cRedeemerTag,
          CSL.BigNum.from_str(redeemer.index.toString()),
          PlutusData.toCSL(redeemer.redeemerData),
          ExUnit.toCSL(redeemer.exUnit),
        ),
      );
    }

    return cRedeemers;
  }

  export function toHex(redeemers: Redeemer[]): string {
    const hasSourceRedeemer = redeemers.some((r) => r.redeemerData.source);
    if (!hasSourceRedeemer) {
      // Fast path: no pre-encoded redeemers, use cbors directly
      const encodedRedeemers: Array<EncodedRedeemer> = [];
      for (const redeemer of redeemers) {
        encodedRedeemers.push([
          redeemer.type,
          redeemer.index,
          PlutusData.toPlutusDataEncoding(redeemer.redeemerData),
          [Number(redeemer.exUnit.memory), Number(redeemer.exUnit.step)],
        ]);
      }
      return cbors.Encoder.encode(encodedRedeemers).toString("hex");
    }

    // When any redeemer has pre-encoded CBOR source, build each redeemer
    // individually and splice the source CBOR directly into the array.
    const redeemerHexParts: string[] = [];
    for (const redeemer of redeemers) {
      const dataHex = PlutusData.toDataHex(redeemer.redeemerData);
      const exUnitHex = cbors.Encoder.encode([Number(redeemer.exUnit.memory), Number(redeemer.exUnit.step)]).toString(
        "hex",
      );
      // Encode [tag, index, data, exUnits] as a 4-element CBOR array
      const tagHex = cbors.Encoder.encode(redeemer.type).toString("hex");
      const indexHex = cbors.Encoder.encode(redeemer.index).toString("hex");
      redeemerHexParts.push(`84${tagHex}${indexHex}${dataHex}${exUnitHex}`);
    }
    // Encode CBOR definite-length array header (major type 4) for `n` elements.
    // Per RFC 8949 §3.1 (https://www.rfc-editor.org/rfc/rfc8949#section-3.1):
    //   n < 24        -> 1 byte:  0x80 | n
    //   n < 2^8       -> 2 bytes: 0x98 <n>
    //   n < 2^16      -> 3 bytes: 0x99 <n:u16 BE>
    //   n < 2^32      -> 5 bytes: 0x9a <n:u32 BE>
    //   n < 2^64      -> 9 bytes: 0x9b <n:u64 BE>
    // Do NOT use `cbors.Encoder.encode(n)` here: that produces the CBOR encoding of
    // `n` as a uint (major type 0), which differs from an array header only by the
    // major-type bits. For n >= 24, encoding as uint emits an additional-info prefix
    // byte (e.g. 0x18) followed by the value; stitching "98" in front of that yields
    // bytes like "98 18 1b" which CSL parses as "array of 0x18=24 elements" with a
    // stray 0x1b that corrupts the next Redeemer.
    const n = redeemers.length;
    let arrayHeaderHex: string;
    if (n < 24) {
      arrayHeaderHex = (0x80 + n).toString(16).padStart(2, "0");
    } else if (n < 0x100) {
      arrayHeaderHex = `98${n.toString(16).padStart(2, "0")}`;
    } else if (n < 0x10000) {
      arrayHeaderHex = `99${n.toString(16).padStart(4, "0")}`;
    } else if (n < 0x100000000) {
      arrayHeaderHex = `9a${n.toString(16).padStart(8, "0")}`;
    } else {
      arrayHeaderHex = `9b${n.toString(16).padStart(16, "0")}`;
    }
    return arrayHeaderHex + redeemerHexParts.join("");
  }

  export function clone(redeemer: Redeemer): Redeemer {
    return {
      type: redeemer.type,
      index: redeemer.index,
      redeemerData: redeemer.redeemerData,
      exUnit: {
        memory: redeemer.exUnit.memory,
        step: redeemer.exUnit.step,
      },
    };
  }

  export function sumExUnits(redeemers: Redeemer[]): ExUnit {
    return redeemers.reduce(
      (acc, redeemer) => ({
        memory: acc.memory + redeemer.exUnit.memory,
        step: acc.step + redeemer.exUnit.step,
      }),
      {
        memory: 0n,
        step: 0n,
      } as ExUnit,
    );
  }
}
