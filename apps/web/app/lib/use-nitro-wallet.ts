import { baseWalletFromEntropy } from "@repo/cip";
import { Address } from "@repo/ledger-core";
import { sha3 } from "@repo/ledger-utils";
import { NitroWallet } from "@repo/minswap-lending-market";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { setNitroBalanceAtom, setNitroWalletAtom } from "../atoms/walletAtom";
import { CONFIG } from "../config";
import { useWallet } from "./use-wallet";
import type { WalletInfo } from "./wallet-utils";

export interface NitroWalletData {
  walletInfo: WalletInfo & { rootAddress: string };
  privateKey: string;
}

const NITRO_WALLET_STORAGE_KEY = "minswap_nitro_wallet";

export const useNitroWallet = () => {
  const wallet = useWallet();
  const [walletData, setWalletData] = useState<NitroWalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setNitroBalance = useSetAtom(setNitroBalanceAtom);
  const [_, setNitroWallet] = useAtom(setNitroWalletAtom);

  /**
   * Fetch balance from the blockchain for a given address
   */
  const fetchBalance = useCallback(async (address: Address): Promise<bigint> => {
    try {
      const value = await NitroWallet.fetchBalance(address.bech32, CONFIG.networkEnv);
      return value.coin();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch balance:", errorMsg);
      return 0n;
    }
  }, []);

  /**
   * Fetch UTXOs from the blockchain for a given address
   */
  const fetchUtxos = useCallback(async (address: Address) => {
    try {
      const utxos = await NitroWallet.fetchUtxos(address.bech32, CONFIG.networkEnv);
      return utxos;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch UTXOs:", errorMsg);
      return [];
    }
  }, []);

  /**
   * Load Nitro wallet from localStorage
   */
  const loadFromStorage = useCallback(async () => {
    console.log("nitro loadFromStorage called", wallet.isConnected, wallet?.walletInfo?.address.bech32);
    const rootAddress = wallet?.walletInfo?.address.bech32;
    if (!rootAddress) {
      return false;
    }
    try {
      const stored = localStorage.getItem(NITRO_WALLET_STORAGE_KEY);
      if (stored) {
        const parsedData = JSON.parse(stored);
        const nitroWallet = {
          ...parsedData,
          walletInfo: {
            ...parsedData.walletInfo,
            address: Address.fromBech32(parsedData.walletInfo.address),
          },
        };
        if (nitroWallet.walletInfo.rootAddress !== rootAddress) {
          return false;
        }

        // Fetch real-time balance from blockchain
        const balance = await fetchBalance(nitroWallet.walletInfo.address);
        nitroWallet.walletInfo.balance = balance;

        setWalletData(nitroWallet);
        setError(null);
        return true;
      }
      return false;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load Nitro wallet from storage: ${errorMsg}`);
      console.error("Storage load error:", err);
      return false;
    }
  }, [wallet?.walletInfo?.address.bech32, fetchBalance, wallet.isConnected]);

  /**
   * Create new Nitro wallet using wallet.api.signData()
   * Requires connected wallet (wallet.api must exist)
   */
  const createNewWallet = useCallback(async () => {
    if (!wallet) {
      throw new Error("Wallet instance not provided");
    }

    if (!wallet.api) {
      throw new Error("Eternl wallet not connected. Please connect your wallet first.");
    }

    if (!wallet.walletInfo) {
      throw new Error("Wallet info not available");
    }

    try {
      // Placeholder signature for testing
      const message = `Create Nitro Wallet with address ${wallet.walletInfo.address.bech32}`;
      const signedData = await wallet.api.signData(
        wallet.walletInfo.address.bech32,
        Buffer.from(message).toString("hex"),
      );
      const entropy = sha3(signedData.signature);
      const nitroWallet = baseWalletFromEntropy(entropy, wallet.walletInfo.networkId);
      const nitroWalletData = {
        walletInfo: {
          address: nitroWallet.address,
          rootAddress: wallet.walletInfo.address.bech32,
          networkId: wallet.walletInfo.networkId,
        },
        privateKey: nitroWallet.paymentKey.toHex(),
      };
      setWalletData(nitroWalletData);
      return nitroWalletData;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create new Nitro wallet: ${errorMsg}`);
    }
  }, [wallet]);

  /**
   * Save Nitro wallet to localStorage
   */
  const saveToStorage = useCallback((data: NitroWalletData) => {
    try {
      localStorage.setItem(NITRO_WALLET_STORAGE_KEY, JSON.stringify(data));
      setWalletData(data);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to save Nitro wallet: ${errorMsg}`);
      console.error("Storage save error:", err);
    }
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try to load from localStorage first
      const loaded = await loadFromStorage();
      if (loaded) {
        return;
      }

      // If not in storage, create new wallet
      const nitroWallet = await createNewWallet();
      saveToStorage(nitroWallet);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error("Wallet connection error:", err);
    } finally {
      setLoading(false);
    }
  }, [loadFromStorage, createNewWallet, saveToStorage]);

  /**
   * Disconnect and remove from localStorage
   */
  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(NITRO_WALLET_STORAGE_KEY);
      setWalletData(null);
      setError(null);
      setNitroBalance(0n);
      setNitroWallet(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to disconnect: ${errorMsg}`);
      console.error("Disconnect error:", err);
    }
  }, [setNitroBalance, setNitroWallet]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Auto-load Nitro wallet from storage when Eternl wallet connects
   */
  useEffect(() => {
    const autoLoad = async () => {
      const rootAddress = wallet?.walletInfo?.address.bech32;
      if (!rootAddress) {
        return;
      }
      try {
        const stored = localStorage.getItem(NITRO_WALLET_STORAGE_KEY);
        if (stored) {
          const parsedData = JSON.parse(stored);
          const nitroWallet = {
            ...parsedData,
            walletInfo: {
              ...parsedData.walletInfo,
              address: Address.fromBech32(parsedData.walletInfo.address),
            },
          };
          if (nitroWallet.walletInfo.rootAddress !== rootAddress) {
            return;
          }

          // Fetch real-time balance from blockchain
          const balance = await fetchBalance(nitroWallet.walletInfo.address);
          nitroWallet.walletInfo.balance = balance;

          setWalletData(nitroWallet);
          setError(null);
        }
      } catch (err) {
        const _errorMsg = err instanceof Error ? err.message : String(err);
        console.error("Storage load error:", err);
      }
    };

    if (wallet.walletInfo) {
      autoLoad();
    }
  }, [wallet.walletInfo?.address.bech32, fetchBalance, wallet.walletInfo]);

  return {
    walletData,
    loading,
    error,
    connect,
    disconnect,
    clearError,
    saveToStorage,
    loadFromStorage,
    createNewWallet,
    fetchBalance,
    fetchUtxos,
    isConnected: walletData !== null,
  };
};
