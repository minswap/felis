"use client";

import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { NetworkEnvironment } from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import { NitroWallet } from "@repo/minswap-lending-market";
import { TxComplete } from "@repo/tx-builder";
import { Alert, App, Button, Card, Col, Form, Input, Modal, Row, Space, Statistic } from "antd";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { nitroWalletAtom, walletAtom } from "../atoms/walletAtom";
import { Utils } from "../lib/utils";

export const DepositWithdraw = () => {
  const { message } = App.useApp();
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const rootWallet = useAtomValue(walletAtom);
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
    if (!rootWallet?.api || !rootWallet?.walletInfo || !nitroWallet?.walletInfo) {
      message.error("Missing wallet information");
      return;
    }

    setDepositLoading(true);
    try {
      const amountInLovelace = BigInt(Math.floor(Number(values.amount) * 1_000_000));
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
        networkEnv:
          rootWallet.walletInfo.networkId === 0 ? NetworkEnvironment.TESTNET_PREVIEW : NetworkEnvironment.MAINNET,
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
      const txHash = await rootWallet.api.submitTx(signedTx);
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
    if (!rootWallet?.api || !rootWallet?.walletInfo || !nitroWallet?.walletInfo) {
      message.error("Missing wallet information");
      return;
    }

    setWithdrawLoading(true);
    try {
      const amountInLovelace = BigInt(Math.floor(Number(values.amount) * 1_000_000));

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

  const rootBalance = rootWallet?.walletInfo?.balance ?? 0n;
  const nitroBalance = nitroWallet?.walletInfo?.balance ?? 0n;

  const isReadyForDeposit = rootWallet?.walletInfo && nitroWallet?.walletInfo && rootBalance > 0n;

  const isReadyForWithdraw = rootWallet?.walletInfo && nitroWallet?.walletInfo && nitroBalance > 0n;

  return (
    <Card style={{ marginTop: 16 }} title="Transfer ADA">
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card style={{ background: "#f5f5f5" }}>
            <Statistic suffix="ADA" title="Root Wallet Balance" value={formatBalance(rootBalance)} />
          </Card>
        </Col>
        <Col span={12}>
          <Card style={{ background: "#f5f5f5" }}>
            <Statistic suffix="ADA" title="Nitro Wallet Balance" value={formatBalance(nitroBalance)} />
          </Card>
        </Col>
      </Row>

      {!rootWallet?.walletInfo || !nitroWallet?.walletInfo ? (
        <Alert
          message="Please connect both wallets to transfer ADA"
          showIcon
          style={{ marginBottom: 16 }}
          type="warning"
        />
      ) : null}

      <Space direction="vertical" style={{ width: "100%" }}>
        <Button
          block
          disabled={!isReadyForDeposit}
          icon={<ArrowDownOutlined />}
          onClick={() => setDepositModal(true)}
          size="large"
          type="primary"
        >
          Deposit to Nitro Wallet
        </Button>
        <Button
          block
          disabled={!isReadyForWithdraw}
          icon={<ArrowUpOutlined />}
          onClick={() => setWithdrawModal(true)}
          size="large"
          type="default"
        >
          Withdraw from Nitro Wallet
        </Button>
      </Space>

      {/* Deposit Modal */}
      <Modal
        confirmLoading={depositLoading}
        onCancel={() => {
          setDepositModal(false);
          depositForm.resetFields();
        }}
        onOk={() => depositForm.submit()}
        open={depositModal}
        title="Deposit ADA to Nitro Wallet"
      >
        <Alert
          message={`From: ${Utils.shortenAddress(rootWallet?.walletInfo?.address.bech32 ?? "")}`}
          showIcon
          style={{ marginBottom: 16 }}
          type="info"
        />
        <Alert
          message={`To: ${Utils.shortenAddress(nitroWallet?.walletInfo?.address.bech32 ?? "")}`}
          showIcon
          style={{ marginBottom: 16 }}
          type="info"
        />
        <Form form={depositForm} layout="vertical" onFinish={handleDeposit}>
          <Form.Item
            label="Amount (ADA)"
            name="amount"
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
                    return Promise.reject(new Error(`Insufficient balance. Available: ${availableAda.toFixed(2)} ADA`));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input min="0" placeholder="0.00" step="0.1" type="number" />
          </Form.Item>
          <Form.Item label="Transaction Fee" style={{ marginBottom: 0 }}>
            <Statistic suffix="ADA" value="~0.17" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Withdraw Modal */}
      <Modal
        confirmLoading={withdrawLoading}
        onCancel={() => {
          setWithdrawModal(false);
          withdrawForm.resetFields();
        }}
        onOk={() => withdrawForm.submit()}
        open={withdrawModal}
        title="Withdraw ADA from Nitro Wallet"
      >
        <Alert
          message={`From: ${Utils.shortenAddress(nitroWallet?.walletInfo?.address.bech32 ?? "")}`}
          showIcon
          style={{ marginBottom: 16 }}
          type="info"
        />
        <Alert
          message={`To: ${Utils.shortenAddress(rootWallet?.walletInfo?.address.bech32 ?? "")}`}
          showIcon
          style={{ marginBottom: 16 }}
          type="info"
        />
        <Form form={withdrawForm} layout="vertical" onFinish={handleWithdraw}>
          <Form.Item
            label="Amount (ADA)"
            name="amount"
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
                    return Promise.reject(new Error(`Insufficient balance. Available: ${availableAda.toFixed(2)} ADA`));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input min="0" placeholder="0.00" step="0.1" type="number" />
          </Form.Item>
          <Form.Item label="Transaction Fee" style={{ marginBottom: 0 }}>
            <Statistic suffix="ADA" value="~0.17" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
