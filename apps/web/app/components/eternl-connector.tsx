"use client";

import { useEffect } from "react";
import { Layout, Button, Space, Tooltip, App } from "antd";
import { CopyOutlined, LogoutOutlined } from "@ant-design/icons";
import type { WalletInfo } from "../lib/wallet-utils";
import { Utils } from "../lib/utils";

interface EternlConnectorProps {
  wallet: {
    walletInfo: WalletInfo | null;
    loading: boolean;
    error: string | null;
    connect: () => Promise<void>;
    disconnect: () => void;
  };
}

export const EternlConnector = ({ wallet }: EternlConnectorProps) => {
  const { message } = App.useApp();

  const formatBalance = (balance: bigint): string => {
    return (Number(balance) / 1_000_000).toFixed(2);
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      message.success("Address copied!");
    } catch (err) {
      message.error("Failed to copy address");
    }
  };

  // Show error notification only once when error occurs
  useEffect(() => {
    if (wallet.error) {
      message.error(wallet.error);
    }
  }, [wallet.error, message]);

  if (wallet.walletInfo) {
    return (
      <Layout.Header
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingInline: 24,
        }}
      >
        <Space size="large" style={{ color: "white" }}>
          {wallet.walletInfo.balance !== undefined && (
            <span style={{ fontSize: "1rem", fontWeight: 600 }}>
              {formatBalance(wallet.walletInfo.balance)} ADA
            </span>
          )}
          <Tooltip title={`Click to copy: ${wallet.walletInfo.address.bech32}`}>
            <Button
              type="text"
              icon={<CopyOutlined />}
              onClick={() =>
                handleCopyAddress(wallet.walletInfo!.address.bech32)
              }
              style={{ color: "white" }}
            >
              {Utils.shortenAddress(wallet.walletInfo.address.bech32)}
            </Button>
          </Tooltip>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={wallet.disconnect}
            style={{ color: "white" }}
          >
            Disconnect
          </Button>
        </Space>
      </Layout.Header>
    );
  }

  return (
    <Layout.Header
      style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingInline: 24,
      }}
    >
      <Button
        type="primary"
        size="large"
        onClick={wallet.connect}
        loading={wallet.loading}
      >
        {wallet.loading ? "Connecting..." : "Connect Eternl Wallet"}
      </Button>
    </Layout.Header>
  );
};
