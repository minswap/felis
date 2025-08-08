import {
  type CborHex,
  type CSLLanguage,
  type CSLNativeScript,
  type CSLPlutusScript,
  RustModule,
} from "@repo/ledger-utils";
import type { Address, Asset, Bytes, ExUnit, PlutusData, RewardAddress, Utxo, Value } from ".";

export enum PlutusVersion {
  V1 = "V1",
  V2 = "V2",
  V3 = "V3",
}

export namespace PlutusVersion {
  export function fromCSL(language: CSLLanguage): PlutusVersion {
    const kind = language.kind();
    switch (kind) {
      case 0: {
        return PlutusVersion.V1;
      }
      case 1: {
        return PlutusVersion.V2;
      }
      case 2: {
        return PlutusVersion.V3;
      }
      default: {
        throw new Error(`Unsupported Plutus version: ${kind}`);
      }
    }
  }

  export function toCSL(plutusVersion: PlutusVersion): CSLLanguage {
    const CSL = RustModule.get;
    switch (plutusVersion) {
      case PlutusVersion.V1:
        return CSL.Language.new_plutus_v1();
      case PlutusVersion.V2:
        return CSL.Language.new_plutus_v2();
      case PlutusVersion.V3:
        return CSL.Language.new_plutus_v3();
      default:
        throw new Error(`Unsupported Plutus version: ${plutusVersion}`);
    }
  }

  export function toOgmios(plutusVersion: PlutusVersion): "plutus:v1" | "plutus:v2" | "plutus:v3" {
    switch (plutusVersion) {
      case PlutusVersion.V1:
        return "plutus:v1";
      case PlutusVersion.V2:
        return "plutus:v2";
      case PlutusVersion.V3:
        return "plutus:v3";
      default:
        throw new Error(`Unsupported Plutus version: ${plutusVersion}`);
    }
  }

  export function fromPlutusType(plutusType: "PlutusV1" | "PlutusV2" | "PlutusV3"): PlutusVersion {
    switch (plutusType) {
      case "PlutusV1":
        return PlutusVersion.V1;
      case "PlutusV2":
        return PlutusVersion.V2;
      case "PlutusV3":
        return PlutusVersion.V3;
      default:
        throw new Error(`Unsupported Plutus version: ${plutusType}`);
    }
  }
}

export enum PlutusUsageType {
  SPEND = 0,
  MINT = 1,
  CERT = 2,
  REWARD = 3,
}

export type PlutusSpend = {
  type: PlutusUsageType.SPEND;
  utxo: Utxo;
  script: CborHex<CSLPlutusScript>;
  datum: PlutusData;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusMint = {
  type: PlutusUsageType.MINT;
  asset: Asset;
  amount: bigint;
  script: CborHex<CSLPlutusScript>;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusSpendV2 = {
  type: PlutusUsageType.SPEND;
  utxo: Utxo;
  scriptInputRef: Utxo;
  datum?: PlutusData;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusMintV2 = {
  type: PlutusUsageType.MINT;
  asset: Asset;
  amount: bigint;
  scriptInputRef: Utxo;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusWithdrawalV2 = {
  type: PlutusUsageType.REWARD;
  stakeAddress: RewardAddress;
  amount: bigint;
  scriptInputRef: Utxo;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusUsage = PlutusSpend | PlutusMint;
export type PlutusUsageV2 = PlutusSpendV2 | PlutusMintV2 | PlutusWithdrawalV2;

export type PlutusPay = {
  address: Address;
  value: Value;
  datum: PlutusData;
};

export type NativeScriptMint = {
  asset: Asset;
  amount: bigint;
  script: CborHex<CSLNativeScript>;
};

export type NativeScriptSpend = {
  utxo: Utxo;
  script: CborHex<CSLNativeScript>;
};

export type RewardsWithdrawal = {
  stakeAddress: RewardAddress;
  amount: bigint;
};

export type CIP25MetadataFile = {
  name: string;
  mediaType: string;
  src: string;
};

export type CIP25AssetMetadata = {
  name: string;
  mediaType?: string;
  image: string;
  files?: CIP25MetadataFile[];
};

export type CIP25AssetsMetadata = Record<string, CIP25AssetMetadata>;

export type CIP25NFTMetadata = Record<string, CIP25AssetsMetadata>;

export type ScriptReference = {
  plutusVersion: PlutusVersion;
  // ScriptRef must have Cbor Script format
  script: Bytes;
};
