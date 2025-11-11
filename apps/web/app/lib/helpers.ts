import { type Address, NetworkEnvironment, Utxo } from "@repo/ledger-core";
import { NitroWallet } from "@repo/minswap-lending-market";
import { CONFIG } from "../config";

export namespace Helpers {
  export const fetchBalance = async (address: string): Promise<bigint> => {
    try {
      const value = await NitroWallet.fetchBalance(address, CONFIG.networkEnv);
      return value.coin();
    } catch {
      return 0n;
    }
  };

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

  export const checkTxConfirmed = async (txHash: string): Promise<boolean> => {
    try {
      const network = CONFIG.networkEnv === NetworkEnvironment.MAINNET ? "mainnet" : "preview";
      const blockfrostApiKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY || "previewb6Lj4mtJ7suOIgYjOAVzweDaKONGNSUJ";
      const url = `https://cardano-${network}.blockfrost.io/api/v0/txs/${txHash}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          project_id: blockfrostApiKey,
        },
      });
      // Status code 200 = transaction confirmed
      // Status code 404 = transaction not found (not confirmed yet)
      if (response.status === 200) {
        return true;
      }

      if (response.status === 404) {
        return false;
      }
      // Handle other status codes
      console.warn(`Unexpected response status ${response.status} when checking tx confirmation`);
      return false;
    } catch (error) {
      console.error("Error checking transaction confirmation:", error);
      return false;
    }
  };
}
