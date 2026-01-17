import { Address, Value } from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";

/**
 * CIP-30 Wallet utilities for Cardano
 * These utilities handle wallet connection and data retrieval
 * Address parsing is delegated to the backend/wallet
 */

export interface WalletInfo {
  address: Address;
  balance?: bigint;
  networkId: number;
}

export interface Cip30Window extends Window {
  cardano?: {
    [walletName: string]: {
      enable(): Promise<Cip30Api>;
      isEnabled(): Promise<boolean>;
      apiVersion: string;
      name: string;
      icon: string;
    };
  };
}

export interface Cip30Api {
  getNetworkId(): Promise<number>;
  getUtxos(): Promise<string[] | undefined>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  signTx(tx: string, partialSign: boolean): Promise<string>;
  signData(addr: string, payload: string): Promise<{ signature: string; key: string }>;
  submitTx(tx: string): Promise<string>;
  getCollaterals?(params: { amount: string }): Promise<string[] | undefined>;
  onAccountChange?(callback: () => void): void;
  onNetworkChange?(callback: (networkId: number) => void): void;
}

export const getWalletApi = async (walletName: string): Promise<Cip30Api | null> => {
  const window_ = window as Cip30Window;
  if (!window_.cardano?.[walletName]) {
    return null;
  }
  try {
    const walletExtension = window_.cardano[walletName];
    const api = await walletExtension.enable();
    return api;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to enable ${walletName}: ${errorMsg}`, error);
    return null;
  }
};

export const getAddressInfo = async (api: Cip30Api): Promise<WalletInfo | null> => {
  try {
    await RustModule.load();
    const addressRaw = await api.getChangeAddress();
    const balanceRaw = await api.getBalance();
    const networkId = await api.getNetworkId();
    const balanceValue = Value.fromHex(balanceRaw);
    return {
      address: Address.fromHex(addressRaw),
      balance: balanceValue.coin(),
      networkId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to get address info:", errorMsg, error);
    return null;
  }
};

export const connectToEternlWallet = async (): Promise<WalletInfo | null> => {
  const eternlApi = await getWalletApi("eternl");
  if (!eternlApi) {
    console.log("Eternl wallet not found or not enabled.");
    return null;
  }
  return getAddressInfo(eternlApi);
};
