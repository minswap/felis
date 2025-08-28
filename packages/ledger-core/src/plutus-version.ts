import { type CSLLanguage, RustModule } from "@repo/ledger-utils";
import type { Bytes } from "./bytes";

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

export type ScriptReference = {
  plutusVersion: PlutusVersion;
  // ScriptRef must have Cbor Script format
  script: Bytes;
};
