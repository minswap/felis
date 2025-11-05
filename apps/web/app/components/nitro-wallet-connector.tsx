"use client";

import { CopyOutlined, LogoutOutlined } from "@ant-design/icons";
import invariant from "@minswap/tiny-invariant";
import { Alert, App, Button, Card, Col, Row, Space, Statistic, Tooltip } from "antd";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { Address } from "../../../../packages/ledger-core/dist/address";
import { NitroWallet } from "../../../../packages/minswap-lending-market/dist/nitro-wallet";
import { type NitroWalletData, nitroWalletAtom, setNitroWalletAtom, walletAtom } from "../atoms/walletAtom";
import { LocalStorageKey } from "../constants/storage";
import { Utils } from "../lib/utils";

export const NitroWalletConnector = () => {
  const { message } = App.useApp();
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const wallet = useAtomValue(walletAtom);
  const [_, setNitroWallet] = useAtom(setNitroWalletAtom);
  const [loading, setLoading] = useState(false);

  /**
   * Fetch balance from the blockchain for a given address
   */
  const fetchBalance = useCallback(
    async (address: Address): Promise<bigint> => {
      try {
        const value = await NitroWallet.fetchBalance(address.bech32);
        return value.coin();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        message.error(`Failed to fetch balance: ${errorMsg}`);
        return 0n;
      }
    },
    [message.error],
  );

  const loadFromStorage = useCallback(async () => {
    const rootAddress = wallet?.walletInfo?.address.bech32;
    if (!rootAddress) {
      return false;
    }
    try {
      const stored = localStorage.getItem(LocalStorageKey.NITRO_WALLET);
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

        // Create updated wallet with fresh balance
        const updatedNitroWallet = {
          ...nitroWallet,
          walletInfo: {
            ...nitroWallet.walletInfo,
            balance: balance,
          },
        };

        setNitroWallet(updatedNitroWallet);
        return true;
      }
      return false;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`Failed to load Nitro wallet from storage: ${errorMsg}`);
      return false;
    }
  }, [wallet?.walletInfo, fetchBalance, setNitroWallet, message.error]);

  useEffect(() => {
    if (wallet?.walletInfo) {
      loadFromStorage();
    }
  }, [wallet?.walletInfo, loadFromStorage]);

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

  /**
   * Save Nitro wallet to localStorage
   */
  const saveToStorage = useCallback(
    (data: NitroWalletData) => {
      try {
        localStorage.setItem(LocalStorageKey.NITRO_WALLET, JSON.stringify(data));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        message.error(`Failed to save Nitro wallet: ${errorMsg}`);
      }
    },
    [message.error],
  );

  /**
   * Create new Nitro wallet using wallet.api.signData()
   * Requires connected wallet (wallet.api must exist)
   */
  const createNewWallet = useCallback(async () => {
    invariant(wallet?.api && wallet.walletInfo);
    try {
      const nitroWalletData = await NitroWallet.createNitroWallet({
        rootAddress: wallet.walletInfo.address.bech32,
        networkId: wallet.walletInfo.networkId,
        signData: wallet.api.signData.bind(wallet.api),
      });
      setNitroWallet(nitroWalletData);
      return nitroWalletData;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create new Nitro wallet: ${errorMsg}`);
    }
  }, [wallet?.walletInfo, setNitroWallet, wallet?.api]);

  const connect = useCallback(async () => {
    setLoading(true);
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
      message.error(`Failed to connect Nitro wallet: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }, [createNewWallet, loadFromStorage, message.error, saveToStorage]);

  /**
   * Disconnect and remove from localStorage
   */
  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(LocalStorageKey.NITRO_WALLET);
      setNitroWallet(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`Failed to disconnect Nitro wallet: ${errorMsg}`);
    }
  }, [message.error, setNitroWallet]);

  if (nitroWallet) {
    const { walletInfo } = nitroWallet;
    return (
      <Card
        bodyStyle={{ color: "white" }}
        extra={
          <Button danger icon={<LogoutOutlined />} onClick={disconnect} type="text">
            Disconnect
          </Button>
        }
        headStyle={{ color: "white", borderColor: "#764ba2" }}
        style={{
          marginTop: 16,
          background: "linear-gradient(135deg, #764ba2 0%, #667eea 100%)",
          borderColor: "#764ba2",
        }}
        title="Nitro Wallet Connected"
      >
        <Row gutter={16}>
          <Col span={12}>
            <Statistic
              suffix="ADA"
              title="Balance"
              value={formatBalance(walletInfo.balance ?? 0n)}
              valueStyle={{ color: "#ffffff" }}
            />
          </Col>
          <Col span={12}>
            <div>
              <div style={{ fontSize: "0.875rem", marginBottom: 8 }}>Nitro Address</div>
              <Tooltip title={`Click to copy: ${walletInfo.address}`}>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => handleCopyAddress(walletInfo.address.bech32)}
                  style={{ color: "white", fontFamily: "monospace" }}
                  type="text"
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
    <Card style={{ marginTop: 16 }} title="Nitro Wallet">
      <Space direction="vertical" style={{ width: "100%" }}>
        {!wallet?.walletInfo && (
          <Alert
            message="Please connect your Eternl wallet first to create a Nitro wallet"
            showIcon
            style={{ marginBottom: "16px" }}
            type="info"
          />
        )}
        {wallet?.walletInfo && !nitroWallet && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Alert
              message="Eternl wallet connected. Setting up Nitro wallet..."
              showIcon
              style={{ marginBottom: "16px" }}
              type="info"
            />
            <Button block disabled={loading} loading={loading} onClick={connect} type="primary">
              {loading ? "Setting up Nitro Wallet..." : "Setup Nitro Wallet"}
            </Button>
          </Space>
        )}
        {nitroWallet && (
          <Alert message="✓ Nitro Wallet Connected" showIcon style={{ marginBottom: "16px" }} type="success" />
        )}
      </Space>
    </Card>
  );
};
