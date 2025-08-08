import * as cbors from "@stricahq/cbors";

import { CSLExUnits, CSLRedeemer, CSLRedeemerTag, CSLRedeemers, CborHex, RustModule, safeFreeRustObjects, unwrapRustVec } from "@repo/ledger-utils";
import { Bytes, PlutusData, PreEncodedPlutusData } from ".";

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
    const encodedRedeemers: Array<EncodedRedeemer> = [];
    for (const redeemer of redeemers) {
      let tag: number;
      switch (redeemer.type) {
        case RedeemerType.SPEND: {
          tag = 0;
          break;
        }
        case RedeemerType.MINT: {
          tag = 1;
          break;
        }
        case RedeemerType.CERT: {
          tag = 2;
          break;
        }
        case RedeemerType.REWARD: {
          tag = 3;
          break;
        }
      }
      encodedRedeemers.push([
        tag,
        redeemer.index,
        PlutusData.toPlutusDataEncoding(redeemer.redeemerData),
        [Number(redeemer.exUnit.memory), Number(redeemer.exUnit.step)],
      ]);
    }
    const redeemerHex = encodedRedeemers
      ? cbors.Encoder.encode(encodedRedeemers).toString("hex")
      : cbors.Encoder.encode([]).toString("hex");

    return redeemerHex;
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
