"use client";

import { Layout } from "antd";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { connectedWalletAtom, walletAtom } from "./atoms/walletAtom";
import { DepositWithdraw } from "./components/deposit-withdraw";
import { EternlConnector } from "./components/eternl-connector";
import { MarginTrading } from "./components/margin-trading";
import { NitroWalletConnector } from "./components/nitro-wallet-connector";
import { useWallet } from "./lib/use-wallet";

export default function Home() {
  const walletConnected = useAtomValue(connectedWalletAtom);
  const wallet = useAtomValue(walletAtom);
  const walletHook = useWallet();

  useEffect(() => {
    // Auto-connect if wallet was previously connected and we don't have wallet data yet
    if (walletConnected && !wallet) {
      walletHook.connect();
    }
  }, [walletConnected, wallet, walletHook]);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <EternlConnector />
      <Layout.Content style={{ padding: "24px" }}>
        {/* <div style={{ marginTop: "24px" }}>
          <Button loading={loading} onClick={handleLoadRustModule} style={{ marginTop: "16px" }}>
            Load RustModule
          </Button>
        </div> */}
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <NitroWalletConnector />
          <DepositWithdraw />
          <MarginTrading />
        </div>
      </Layout.Content>
    </Layout>
  );
}
