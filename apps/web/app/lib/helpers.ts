import { type Address, Utxo } from "@repo/ledger-core";
import { NitroWallet } from "@repo/minswap-lending-market";

export namespace Helpers {
  export const fetchRawUtxos = async (address: Address): Promise<string[]> => {
    try {
      const utxos = await NitroWallet.fetchUtxos(address.bech32);
      return utxos.map(Utxo.toHex);
    } catch {
      return [];
    }
  };
}
