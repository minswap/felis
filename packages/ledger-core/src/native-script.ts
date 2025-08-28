import { type CSLScriptPubkey, RustModule, safeFreeRustObjects } from "@repo/ledger-utils";
import { Bytes } from "./bytes";

export type NativeScriptPubKeyHash = {
  type: "sig";
  keyHash: string;
};

export type NativeScriptAll = {
  type: "all";
  scripts: NativeScriptPubKeyHash[];
};

export type NativeScriptAny = {
  type: "any";
  scripts: NativeScriptPubKeyHash[];
};

export type NativeScriptNOfK = {
  type: "atLeast";
  required: number;
  scripts: NativeScriptPubKeyHash[];
};

export type NativeScriptValidBefore = {
  type: "all";
  scripts: [
    {
      type: "before";
      slot: number;
    },
    NativeScriptPubKeyHash,
  ];
};

export type NativeScriptValidAfter = {
  type: "all";
  scripts: [
    {
      type: "after";
      slot: number;
    },
    NativeScriptPubKeyHash,
  ];
};

export type NativeScript =
  | NativeScriptPubKeyHash
  | NativeScriptNOfK
  | NativeScriptValidBefore
  | NativeScriptValidAfter
  | NativeScriptAll
  | NativeScriptAny;

export namespace NativeScriptPubKeyHash {
  export function toCSL(ns: NativeScriptPubKeyHash): CSLScriptPubkey {
    const CSL = RustModule.get;
    return CSL.ScriptPubkey.new(CSL.Ed25519KeyHash.from_hex(ns.keyHash));
  }
}

export namespace NativeScript {
  export function toHex(ns: NativeScript): string {
    const CSL = RustModule.get;

    if (ns.type === "sig" && "keyHash" in ns) {
      const cPkhScript = NativeScriptPubKeyHash.toCSL(ns);
      const cNativeScript = CSL.NativeScript.new_script_pubkey(cPkhScript);
      const scriptCbor = cNativeScript.to_hex();
      safeFreeRustObjects(cPkhScript, cNativeScript);
      return scriptCbor;
    }

    if (ns.type === "all") {
      const cChildScripts = CSL.NativeScripts.new();
      for (const childJsonScript of ns.scripts) {
        if (childJsonScript.type === "sig") {
          const cPkhNativeScript = CSL.NativeScript.new_script_pubkey(NativeScriptPubKeyHash.toCSL(childJsonScript));
          cChildScripts.add(cPkhNativeScript);
        } else if (childJsonScript.type === "before") {
          const cBefore = CSL.BigNum.from_str(childJsonScript.slot.toString());
          const cBeforeScript = CSL.TimelockExpiry.new_timelockexpiry(cBefore);
          const cBeforeNativeScript = CSL.NativeScript.new_timelock_expiry(cBeforeScript);
          cChildScripts.add(cBeforeNativeScript);
        } else {
          const cStart = CSL.BigNum.from_str(childJsonScript.slot.toString());
          const cStartScript = CSL.TimelockStart.new_timelockstart(cStart);
          const cStartNativeScript = CSL.NativeScript.new_timelock_start(cStartScript);
          cChildScripts.add(cStartNativeScript);
        }
      }

      const cScriptAll = CSL.ScriptAll.new(cChildScripts);
      const cNativeScript = CSL.NativeScript.new_script_all(cScriptAll);
      const scriptCbor = cNativeScript.to_hex();
      safeFreeRustObjects(cChildScripts, cScriptAll, cNativeScript);
      return scriptCbor;
    }

    if (ns.type === "any") {
      const cChildScripts = CSL.NativeScripts.new();
      for (const childJsonScript of ns.scripts) {
        const cPkhNativeScript = CSL.NativeScript.new_script_pubkey(NativeScriptPubKeyHash.toCSL(childJsonScript));
        cChildScripts.add(cPkhNativeScript);
      }
      const cScriptAny = CSL.ScriptAny.new(cChildScripts);
      const cNativeScript = CSL.NativeScript.new_script_any(cScriptAny);
      const scriptCbor = cNativeScript.to_hex();
      safeFreeRustObjects(cChildScripts, cScriptAny, cNativeScript);
      return scriptCbor;
    }

    if (ns.type === "atLeast") {
      const cChildScripts = CSL.NativeScripts.new();
      for (const childJsonScript of ns.scripts) {
        const cPkhNativeScript = CSL.NativeScript.new_script_pubkey(NativeScriptPubKeyHash.toCSL(childJsonScript));
        cChildScripts.add(cPkhNativeScript);
      }
      const cScriptNOfK = CSL.ScriptNOfK.new(ns.required, cChildScripts);
      const cNativeScript = CSL.NativeScript.new_script_n_of_k(cScriptNOfK);
      const scriptCbor = cNativeScript.to_hex();
      safeFreeRustObjects(cChildScripts, cScriptNOfK, cNativeScript);
      return scriptCbor;
    }

    throw new Error("Invalid native script");
  }

  export function toPolicyID(ns: NativeScript): Bytes {
    const scriptCbor = toHex(ns);
    const CSL = RustModule.get;
    const cNativeScript = CSL.NativeScript.from_hex(scriptCbor);
    const cScriptHash = cNativeScript.hash();
    const policyId = Bytes.fromHex(cScriptHash.to_hex());
    safeFreeRustObjects(cNativeScript, cScriptHash);
    return policyId;
  }
}
