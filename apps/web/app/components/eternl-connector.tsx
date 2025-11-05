"use client";

import { CopyOutlined, LogoutOutlined } from "@ant-design/icons";
import { App, Button, Layout, Space, Tooltip } from "antd";
import { useEffect } from "react";
import { useWallet } from "../lib/use-wallet";
import { Utils } from "../lib/utils";

export const EternlConnector = () => {
  const { message } = App.useApp();
  const wallet = useWallet();

  const formatBalance = (balance: bigint): string => {
    return (Number(balance) / 1_000_000).toFixed(2);
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      message.success("Address copied!");
    } catch (_err) {
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
            <span style={{ fontSize: "1rem", fontWeight: 600 }}>{formatBalance(wallet.walletInfo.balance)} ADA</span>
          )}
          <Tooltip title={`Click to copy: ${wallet.walletInfo.address.bech32}`}>
            <Button
              icon={<CopyOutlined />}
              onClick={() => handleCopyAddress(wallet.walletInfo?.address.bech32 ?? "")}
              style={{ color: "white" }}
              type="text"
            >
              {Utils.shortenAddress(wallet.walletInfo.address.bech32)}
            </Button>
          </Tooltip>
          <Button icon={<LogoutOutlined />} onClick={wallet.disconnect} style={{ color: "white" }} type="text">
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
      <Button loading={wallet.loading} onClick={wallet.connect} size="large" type="primary">
        {wallet.loading ? "Connecting..." : "Connect Eternl Wallet"}
      </Button>
    </Layout.Header>
  );
};
