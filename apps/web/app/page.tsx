"use client";

import { LendingMarket } from "@repo/minswap-lending-market";
import { App, Button, Layout } from "antd";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { connectedWalletAtom, setMinAdaPriceAtom, walletAtom } from "./atoms/walletAtom";
import { DepositWithdraw } from "./components/deposit-withdraw";
import { EternlConnector } from "./components/eternl-connector";
import { MarginTrading } from "./components/margin-trading";
import { NitroWalletConnector } from "./components/nitro-wallet-connector";
import { CONFIG } from "./config";
import { useWallet } from "./lib/use-wallet";

export default function Home() {
  const { message } = App.useApp();
  const walletConnected = useAtomValue(connectedWalletAtom);
  const wallet = useAtomValue(walletAtom);
  const walletHook = useWallet();
  const setMinAdaPrice = useSetAtom(setMinAdaPriceAtom);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const clearHistory = async () => {
    setIsClearingHistory(true);
    try {
      // Clear all localStorage values
      localStorage.clear();
      message.success("Local storage cleared successfully");
      // Force page reload after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (_err) {
      message.error("Failed to clear local storage");
      setIsClearingHistory(false);
    }
  };

  useEffect(() => {
    // Auto-connect if wallet was previously connected and we don't have wallet data yet
    if (walletConnected && !wallet) {
      walletHook.connect();
    }
  }, [walletConnected, wallet, walletHook]);

  // polling fetch $MIN price 10 seconds
  useEffect(() => {
    const fetchMinPrice = async () => {
      try {
        const priceData = await LendingMarket.fetchAdaMinPrice(CONFIG.networkEnv);
        setMinAdaPrice(priceData);
        // message.info(`MIN price fetched: ${priceData.price} ADA per MIN`);
      } catch (_err) {
        message.error("Failed to fetch MIN price");
      } finally {
      }
    };
    fetchMinPrice();
    const interval = setInterval(fetchMinPrice, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [setMinAdaPrice, message]);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <EternlConnector />
      <Layout.Content style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Button danger loading={isClearingHistory} onClick={clearHistory} type="primary">
            Clear History & Reset
          </Button>
        </div>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <NitroWalletConnector />
          <DepositWithdraw />
          <MarginTrading />
        </div>
      </Layout.Content>
    </Layout>
  );
}
