import { type Address, Utxo } from "@repo/ledger-core";
import { NitroWallet } from "@repo/minswap-lending-market";
import { CONFIG } from "../config";

export namespace Helpers {
  export const fetchRawUtxos = async (address: Address): Promise<string[]> => {
    try {
      const utxos = await NitroWallet.fetchUtxos(address.bech32, CONFIG.networkEnv);
      return utxos.map(Utxo.toHex);
    } catch {
      return [];
    }
  };
  export const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };
}
