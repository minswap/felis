import { useState, useCallback, useEffect } from "react";
import type { WalletInfo } from "./wallet-utils";
import { useWallet } from "./use-wallet";
import { sha3 } from "@repo/ledger-utils";
import { baseWalletFromEntropy } from "@repo/cip";
import { Address } from "@repo/ledger-core";
import { NitroWallet } from "@repo/minswap-lending-market";

export interface NitroWalletData {
  walletInfo: WalletInfo & { rootAddress: string };
  privateKey: string;
}

const NITRO_WALLET_STORAGE_KEY = "minswap_nitro_wallet";

type UseWalletReturn = ReturnType<typeof useWallet>;

/**
 * Hook for managing Nitro Wallet
 * Handles two cases:
 * 1. Loading existing Nitro wallet from localStorage
 * 2. Creating new Nitro wallet using wallet.api.signData()
 *
 * @param wallet - The useWallet hook return value for creating new wallets
 */
export const useNitroWallet = (wallet?: UseWalletReturn) => {
  const [walletData, setWalletData] = useState<NitroWalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch balance from the blockchain for a given address
   */
  const fetchBalance = useCallback(async (address: Address): Promise<bigint> => {
    try {
      const value = await NitroWallet.fetchBalance(address.bech32);
      return value.coin();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch balance:", errorMsg);
      return 0n;
    }
  }, []);

  /**
   * Load Nitro wallet from localStorage
   */
  const loadFromStorage = useCallback(async () => {
    const rootAddress = wallet?.walletInfo?.address.bech32;
    console.log("rootAddress", rootAddress); // --- IGNORE ---
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
  }, [wallet?.walletInfo?.address.bech32, fetchBalance]);

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
        Buffer.from(message).toString("hex")
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
  }, [loadFromStorage, createNewWallet]);

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

  /**
   * Disconnect and remove from localStorage
   */
  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(NITRO_WALLET_STORAGE_KEY);
      setWalletData(null);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to disconnect: ${errorMsg}`);
      console.error("Disconnect error:", err);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Auto-load Nitro wallet from storage when Eternl wallet connects
   */
  useEffect(() => {
    if (wallet?.isConnected && wallet?.walletInfo) {
      loadFromStorage();
    }
  }, [wallet?.isConnected, wallet?.walletInfo?.address.bech32, loadFromStorage]);

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
    isConnected: walletData !== null,
  };
};
