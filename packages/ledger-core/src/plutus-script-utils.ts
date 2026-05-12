import { type CSLPlutusData, RustModule, safeFreeRustObjects } from "@minswap/felis-ledger-utils";
import { Bytes } from "./bytes";

export type ScriptType = "Native" | "PlutusV1" | "PlutusV2" | "PlutusV3";

export type Script = {
  type: ScriptType;
  script: Bytes;
};

export type PlutusValidatorCompiled = {
  title: string;
  compiledCode: string;
};
export type PlutusCompiled = {
  validators: PlutusValidatorCompiled[];
};

export function applyDoubleCborEncoding(script: Bytes): Bytes {
  const CSL = RustModule.get;
  try {
    const ps1 = CSL.PlutusScript.from_bytes(script.bytes);
    const ps2 = CSL.PlutusScript.from_bytes(ps1.bytes());
    safeFreeRustObjects(ps1, ps2);
    return script;
  } catch (_e) {
    const ps = CSL.PlutusScript.new(script.bytes);
    const ret = new Bytes(ps.to_bytes());
    safeFreeRustObjects(ps);
    return ret;
  }
}

export function applyParamsToScript(params: CSLPlutusData[], script: Bytes): Bytes {
  const CSL = RustModule.get;
  const UPLC = RustModule.getU;
  const paramsList = CSL.PlutusList.new();
  for (const param of params) {
    paramsList.add(param);
  }
  const doubleCborScript = CSL.PlutusScript.from_bytes(applyDoubleCborEncoding(script).bytes);
  const appliedRaw = UPLC.apply_params_to_plutus_script(paramsList.to_bytes(), doubleCborScript.bytes());
  const plutusScript = CSL.PlutusScript.new(appliedRaw);
  const ret = new Bytes(plutusScript.to_bytes());
  safeFreeRustObjects(paramsList, doubleCborScript, plutusScript);
  return ret;
}

/**
 * @deprecated
 * This function is deprecated and will be removed in the future.
 */
export function applyParamsToScriptCSL(params: CSLPlutusData[], script: Bytes): Bytes {
  const CSL = RustModule.get;
  const paramsList = CSL.PlutusList.new();
  for (const param of params) {
    paramsList.add(param);
  }
  const doubleCborScript = CSL.PlutusScript.from_bytes(applyDoubleCborEncoding(script).bytes);
  const plutusScript = CSL.apply_params_to_plutus_script(paramsList, doubleCborScript);
  const ret = new Bytes(plutusScript.to_bytes());
  safeFreeRustObjects(paramsList, plutusScript);
  return ret;
}

export function validatorToScriptHash(validator: Script): Bytes {
  const CSL = RustModule.get;
  let scriptHash: string;
  switch (validator.type) {
    case "Native": {
      const nativeScript = CSL.NativeScript.from_bytes(validator.script.bytes);
      const nativeScriptHash = nativeScript.hash();
      scriptHash = nativeScriptHash.to_hex();
      safeFreeRustObjects(nativeScript, nativeScriptHash);
      break;
    }
    case "PlutusV1": {
      const v1Script = CSL.PlutusScript.from_bytes(applyDoubleCborEncoding(validator.script).bytes);
      const v1ScriptHash = v1Script.hash();
      scriptHash = v1ScriptHash.to_hex();
      safeFreeRustObjects(v1Script, v1ScriptHash);
      break;
    }
    case "PlutusV2": {
      const v2Script = CSL.PlutusScript.from_bytes_v2(applyDoubleCborEncoding(validator.script).bytes);
      const v2ScriptHash = v2Script.hash();
      scriptHash = v2ScriptHash.to_hex();
      safeFreeRustObjects(v2Script, v2ScriptHash);
      break;
    }
    case "PlutusV3": {
      const v3Script = CSL.PlutusScript.from_bytes_with_version(
        applyDoubleCborEncoding(validator.script).bytes,
        CSL.Language.new_plutus_v3(),
      );
      const v3ScriptHash = v3Script.hash();
      scriptHash = v3ScriptHash.to_hex();
      safeFreeRustObjects(v3Script, v3ScriptHash);
      break;
    }
    default:
      throw new Error("No variant matched");
  }
  return Bytes.fromHex(scriptHash);
}
