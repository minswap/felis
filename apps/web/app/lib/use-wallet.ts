import { useAtom } from "jotai";
import { useCallback, useState } from "react";
import { setConnectedWalletAtom, setWalletAtom } from "../atoms/walletAtom";
import { type Cip30Api, getAddressInfo, getWalletApi, type WalletInfo } from "./wallet-utils";

export const useWallet = () => {
  const [_, setWallet] = useAtom(setWalletAtom);
  const [__, setConnectedWallet] = useAtom(setConnectedWalletAtom);
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
        setWallet({ walletInfo: info, api: eternlApi });
        setConnectedWallet(true);
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
  }, [setWallet, setConnectedWallet]);

  const disconnect = useCallback(() => {
    setWalletInfo(null);
    setApi(null);
    setError(null);
    setWallet(null);
    setConnectedWallet(false);
  }, [setConnectedWallet, setWallet]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    walletInfo,
    api,
    setWalletInfo,
    loading,
    setLoading,
    error,
    connect,
    disconnect,
    clearError,
    isConnected: walletInfo !== null && api !== null,
  };
};
