import { Maybe } from "@minswap/felis-ledger-utils";
import type { Transaction } from "./transaction";

export namespace Helper {
  export function hasPaidTo(tx: Transaction, addressSet: Set<string>): boolean {
    return tx.body.outputs.some((o) => addressSet.has(o.address.bech32));
  }

  export function hasPaidToScript(tx: Transaction, scriptHash: string): boolean {
    return tx.body.outputs.some((o) => {
      const addrScriptHash = o.address.toScriptHash();
      return Maybe.isJust(addrScriptHash) && addrScriptHash.hex === scriptHash;
    });
  }

  export function hasPaidToScripts(tx: Transaction, scriptHashSet: Set<string>): boolean {
    return tx.body.outputs.some((o) => {
      const scriptHash = o.address.toScriptHash();
      return Maybe.isJust(scriptHash) && scriptHashSet.has(scriptHash.hex);
    });
  }

  export function hasReferenceTo(tx: Transaction, refSet: Set<string>): boolean {
    return tx.body.referenceInputs.some((ref) => refSet.has(`${ref.txId.hex}#${ref.index}`));
  }
}
