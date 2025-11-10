"use client";

import { CopyOutlined, LogoutOutlined } from "@ant-design/icons";
import { App, Button, Layout, Space, Tooltip } from "antd";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { rootBalanceAtom, walletAtom } from "../atoms/walletAtom";
import { useNitroWallet } from "../lib/use-nitro-wallet";
import { useWallet } from "../lib/use-wallet";
import { Utils } from "../lib/utils";

export const EternlConnector = () => {
  const { message } = App.useApp();
  const wallet = useWallet();
  const nitroWallet = useNitroWallet();
  const globalWallet = useAtomValue(walletAtom);
  const rootBalance = useAtomValue(rootBalanceAtom);

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

  // Use global wallet atom for display, but still show if walletInfo exists
  const displayWallet = globalWallet?.walletInfo || wallet.walletInfo;

  if (displayWallet) {
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
          {rootBalance !== undefined && (
            <span style={{ fontSize: "1rem", fontWeight: 600 }}>
              {rootBalance > 0 ? Utils.formatBalance(rootBalance) : displayWallet.balance} ADA
            </span>
          )}
          <Tooltip title={`Click to copy: ${displayWallet.address.bech32}`}>
            <Button
              icon={<CopyOutlined />}
              onClick={() => handleCopyAddress(displayWallet?.address.bech32 ?? "")}
              style={{ color: "white" }}
              type="text"
            >
              {Utils.shortenAddress(displayWallet.address.bech32)}
            </Button>
          </Tooltip>
          <Button
            icon={<LogoutOutlined />}
            onClick={() => {
              wallet.disconnect();
              nitroWallet.disconnect();
            }}
            style={{ color: "white" }}
            type="text"
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
      <Button loading={wallet.loading} onClick={wallet.connect} size="large" type="primary">
        {wallet.loading ? "Connecting..." : "Connect Eternl Wallet"}
      </Button>
    </Layout.Header>
  );
};
