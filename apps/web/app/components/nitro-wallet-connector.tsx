"use client";

import { useEffect } from "react";
import { Card, Button, Space, Tooltip, Statistic, Row, Col, Alert, App } from "antd";
import { CopyOutlined, LogoutOutlined } from "@ant-design/icons";
import type { NitroWalletData } from "../lib/use-nitro-wallet";
import { Utils } from "../lib/utils";

interface NitroWalletConnectorProps {
  nitroWallet: {
    walletData: NitroWalletData | null;
    loading: boolean;
    error: string | null;
    connect: () => Promise<void>;
    disconnect: () => void;
  };
  isEternlConnected: boolean;
}

export const NitroWalletConnector = ({
  nitroWallet,
  isEternlConnected,
}: NitroWalletConnectorProps) => {
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
    if (nitroWallet.error) {
      message.error(nitroWallet.error);
    }
  }, [nitroWallet.error]);

  if (nitroWallet.walletData) {
    const { walletInfo } = nitroWallet.walletData;
    return (
      <Card
        title="Nitro Wallet Connected"
        extra={
          <Button
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={nitroWallet.disconnect}
          >
            Disconnect
          </Button>
        }
        style={{
          marginTop: 16,
          background: "linear-gradient(135deg, #764ba2 0%, #667eea 100%)",
          borderColor: "#764ba2",
        }}
        headStyle={{ color: "white", borderColor: "#764ba2" }}
        bodyStyle={{ color: "white" }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Statistic
              title="Balance"
              value={formatBalance(walletInfo.balance ?? 0n)}
              suffix="ADA"
              valueStyle={{ color: "#ffffff" }}
            />
          </Col>
          <Col span={12}>
            <div>
              <div style={{ fontSize: "0.875rem", marginBottom: 8 }}>
                Nitro Address
              </div>
              <Tooltip
                title={`Click to copy: ${walletInfo.address}`}
              >
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={() =>
                    handleCopyAddress(walletInfo.address.bech32)
                  }
                  style={{ color: "white", fontFamily: "monospace" }}
                >
                  {Utils.shortenAddress(walletInfo.address.bech32)}
                </Button>
              </Tooltip>
            </div>
          </Col>
        </Row>
      </Card>
    );
  }

  return (
    <Card
      title="Nitro Wallet"
      style={{ marginTop: 16 }}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        {!isEternlConnected && (
          <Alert
            message="Please connect your Eternl wallet first to create a Nitro wallet"
            type="info"
            showIcon
            style={{ marginBottom: "16px" }}
          />
        )}
        <Button
          type="primary"
          size="large"
          block
          onClick={nitroWallet.connect}
          loading={nitroWallet.loading}
          disabled={!isEternlConnected}
        >
          {nitroWallet.loading ? "Connecting..." : "Connect Nitro Wallet"}
        </Button>
      </Space>
    </Card>
  );
};
