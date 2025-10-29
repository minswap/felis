"use client";

import { useState } from "react";
import {
  Card,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Tabs,
  Row,
  Col,
  Statistic,
  Alert,
  App,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
} from "@ant-design/icons";
import type { Cip30Api, WalletInfo } from "../lib/wallet-utils";
import { Utils } from "../lib/utils";
import { NitroWallet } from "@repo/minswap-lending-market";
import { RustModule } from "@repo/ledger-utils";
import { NetworkEnvironment } from "@repo/ledger-core";
import { TxComplete } from "@repo/tx-builder";

interface DepositWithdrawProps {
  rootWallet: {
    walletInfo: WalletInfo | null;
    api: Cip30Api | null;
    isConnected: boolean;
  };
  nitroWallet: {
    walletInfo: (WalletInfo & { rootAddress: string }) | null;
    isConnected: boolean;
  };
}

export const DepositWithdraw = ({
  rootWallet,
  nitroWallet,
}: DepositWithdrawProps) => {
  const { message } = App.useApp();
  const [depositModal, setDepositModal] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [depositForm] = Form.useForm();
  const [withdrawForm] = Form.useForm();

  const formatBalance = (balance: bigint | undefined): string => {
    if (!balance) return "0.00";
    return (Number(balance) / 1_000_000).toFixed(2);
  };

  const handleDeposit = async (values: { amount: string }) => {
    if (!rootWallet.api || !rootWallet.walletInfo || !nitroWallet.walletInfo) {
      message.error("Missing wallet information");
      return;
    }

    setDepositLoading(true);
    try {
      const amountInLovelace = BigInt(Math.floor(Number(values.amount) * 1_000_000));

      // // Load RustModule if not already loaded
      // await RustModule.load();

      // Get UTXOs from root wallet
      const utxosRaw = await rootWallet.api.getUtxos();
      if (!utxosRaw || utxosRaw.length === 0) {
        message.error("No UTXOs available in root wallet");
        return;
      }

      // Build deposit transaction using NitroWallet.depositNitroFunds
      const txHex = await NitroWallet.depositNitroFunds({
        nitroAddress: nitroWallet.walletInfo.address,
        rootAddress: rootWallet.walletInfo.address,
        amount: amountInLovelace,
        networkEnv: rootWallet.walletInfo.networkId === 0 ? NetworkEnvironment.TESTNET_PREVIEW : NetworkEnvironment.MAINNET,
        rootAddressUtxos: utxosRaw,
      });

      // Sign and submit transaction
      const witnessSet = await rootWallet.api.signTx(txHex, true);
      // Using TxComplete to assemble (aka: finalize Tx)
      const tx = RustModule.getE.Transaction.from_hex(txHex);
      const txComplete = new TxComplete(tx);
      txComplete.assemble(witnessSet);

      // Complete Tx
      const signedTx = txComplete.complete();
      const txHash = await rootWallet.api.submitTx(signedTx)
      message.success(`Deposit successful! Tx: ${txHash}`);

      depositForm.resetFields();
      setDepositModal(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`Deposit failed: ${errorMsg}`);
      console.error("Deposit error:", err);
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async (values: { amount: string }) => {
    if (!rootWallet.api || !rootWallet.walletInfo || !nitroWallet.walletInfo) {
      message.error("Missing wallet information");
      return;
    }

    setWithdrawLoading(true);
    try {
      const amountInLovelace = BigInt(
        Math.floor(Number(values.amount) * 1_000_000)
      );

      // Placeholder for transaction building
      // In a real implementation, you would:
      // 1. Build a transaction that sends ADA from nitro wallet to root wallet
      // 2. Sign the transaction with nitro wallet private key
      // 3. Submit the transaction

      message.info("Withdraw feature coming soon - Transaction building in progress");
      console.log({
        from: nitroWallet.walletInfo.address.bech32,
        to: rootWallet.walletInfo.address.bech32,
        amount: amountInLovelace.toString(),
      });

      withdrawForm.resetFields();
      setWithdrawModal(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`Withdraw failed: ${errorMsg}`);
      console.error("Withdraw error:", err);
    } finally {
      setWithdrawLoading(false);
    }
  };

  const rootBalance = rootWallet.walletInfo?.balance ?? 0n;
  const nitroBalance = nitroWallet.walletInfo?.balance ?? 0n;

  const isReadyForDeposit =
    rootWallet.isConnected &&
    nitroWallet.isConnected &&
    rootBalance > 0n;

  const isReadyForWithdraw =
    rootWallet.isConnected &&
    nitroWallet.isConnected &&
    nitroBalance > 0n;

  return (
    <Card
      title="Transfer ADA"
      style={{ marginTop: 16 }}
    >
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card style={{ background: "#f5f5f5" }}>
            <Statistic
              title="Root Wallet Balance"
              value={formatBalance(rootBalance)}
              suffix="ADA"
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card style={{ background: "#f5f5f5" }}>
            <Statistic
              title="Nitro Wallet Balance"
              value={formatBalance(nitroBalance)}
              suffix="ADA"
            />
          </Card>
        </Col>
      </Row>

      {!rootWallet.isConnected || !nitroWallet.isConnected ? (
        <Alert
          message="Please connect both wallets to transfer ADA"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Space style={{ width: "100%" }} direction="vertical">
        <Button
          type="primary"
          size="large"
          block
          icon={<ArrowDownOutlined />}
          onClick={() => setDepositModal(true)}
          disabled={!isReadyForDeposit}
        >
          Deposit to Nitro Wallet
        </Button>
        <Button
          type="default"
          size="large"
          block
          icon={<ArrowUpOutlined />}
          onClick={() => setWithdrawModal(true)}
          disabled={!isReadyForWithdraw}
        >
          Withdraw from Nitro Wallet
        </Button>
      </Space>

      {/* Deposit Modal */}
      <Modal
        title="Deposit ADA to Nitro Wallet"
        open={depositModal}
        onOk={() => depositForm.submit()}
        onCancel={() => {
          setDepositModal(false);
          depositForm.resetFields();
        }}
        confirmLoading={depositLoading}
      >
        <Alert
          message={`From: ${Utils.shortenAddress(rootWallet.walletInfo?.address.bech32 ?? "")}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Alert
          message={`To: ${Utils.shortenAddress(nitroWallet.walletInfo?.address.bech32 ?? "")}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form
          form={depositForm}
          layout="vertical"
          onFinish={handleDeposit}
        >
          <Form.Item
            name="amount"
            label="Amount (ADA)"
            rules={[
              { required: true, message: "Please enter amount" },
              {
                pattern: /^\d+(\.\d{1,6})?$/,
                message: "Invalid amount format",
              },
              {
                validator: (_, value) => {
                  const amount = parseFloat(value);
                  const availableAda = Number(rootBalance) / 1_000_000;
                  if (amount > availableAda) {
                    return Promise.reject(
                      new Error(
                        `Insufficient balance. Available: ${availableAda.toFixed(2)} ADA`
                      )
                    );
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input
              type="number"
              placeholder="0.00"
              step="0.1"
              min="0"
            />
          </Form.Item>
          <Form.Item
            label="Transaction Fee"
            style={{ marginBottom: 0 }}
          >
            <Statistic value="~0.17" suffix="ADA" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Withdraw Modal */}
      <Modal
        title="Withdraw ADA from Nitro Wallet"
        open={withdrawModal}
        onOk={() => withdrawForm.submit()}
        onCancel={() => {
          setWithdrawModal(false);
          withdrawForm.resetFields();
        }}
        confirmLoading={withdrawLoading}
      >
        <Alert
          message={`From: ${Utils.shortenAddress(nitroWallet.walletInfo?.address.bech32 ?? "")}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Alert
          message={`To: ${Utils.shortenAddress(rootWallet.walletInfo?.address.bech32 ?? "")}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form
          form={withdrawForm}
          layout="vertical"
          onFinish={handleWithdraw}
        >
          <Form.Item
            name="amount"
            label="Amount (ADA)"
            rules={[
              { required: true, message: "Please enter amount" },
              {
                pattern: /^\d+(\.\d{1,6})?$/,
                message: "Invalid amount format",
              },
              {
                validator: (_, value) => {
                  const amount = parseFloat(value);
                  const availableAda = Number(nitroBalance) / 1_000_000;
                  if (amount > availableAda) {
                    return Promise.reject(
                      new Error(
                        `Insufficient balance. Available: ${availableAda.toFixed(2)} ADA`
                      )
                    );
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input
              type="number"
              placeholder="0.00"
              step="0.1"
              min="0"
            />
          </Form.Item>
          <Form.Item
            label="Transaction Fee"
            style={{ marginBottom: 0 }}
          >
            <Statistic value="~0.17" suffix="ADA" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
