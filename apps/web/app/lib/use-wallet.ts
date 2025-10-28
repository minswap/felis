import { useState, useCallback } from "react";
import { connectToEternlWallet, getWalletApi, getAddressInfo, type WalletInfo, type Cip30Api } from "./wallet-utils";

export const useWallet = () => {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [api, setApi] = useState<Cip30Api | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const eternlApi = await getWalletApi("eternl");
      if (!eternlApi) {
        setError("Eternl wallet not found or not enabled.");
        return;
      }

      const info = await getAddressInfo(eternlApi);
      if (info) {
        setWalletInfo(info);
        setApi(eternlApi);
      } else {
        setError("Failed to get wallet information.");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Error connecting wallet: ${errorMsg}`);
      console.error("Wallet connection error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWalletInfo(null);
    setApi(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    walletInfo,
    api,
    setWalletInfo,
    loading,
    error,
    connect,
    disconnect,
    clearError,
    isConnected: walletInfo !== null && api !== null,
  };
};
