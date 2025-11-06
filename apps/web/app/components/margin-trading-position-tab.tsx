"use client";

import { CloseOutlined, DollarOutlined, SwapOutlined, TrophyOutlined } from "@ant-design/icons";
import { ADA } from "@repo/ledger-core";
import { LendingMarket } from "@repo/minswap-lending-market";
import { Alert, App, Button, Card, Col, Divider, Progress, Row, Space, Statistic, Tag } from "antd";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
  type LongPositionState,
  LongPositionStatus,
  longPositionAtom,
  nitroWalletAtom,
  setLongPositionAtom,
  walletAtom,
} from "../atoms/walletAtom";
import { CONFIG } from "../config";
import { Helpers } from "../lib/helpers";
import { Utils } from "../lib/utils";

const getStatusColor = (status: LongPositionStatus) => {
  switch (status) {
    case LongPositionStatus.STEP_0_PLACE_ORDER:
      return "blue";
    case LongPositionStatus.STEP_1_BUY_LONG_ASSET:
      return "orange";
    case LongPositionStatus.STEP_2_SUPPLY_TOKEN:
      return "processing";
    case LongPositionStatus.OPENING_POSITION:
      return "green";
    default:
      return "default";
  }
};

const getStatusText = (status: LongPositionStatus) => {
  switch (status) {
    case LongPositionStatus.STEP_0_PLACE_ORDER:
      return "Placing Order";
    case LongPositionStatus.STEP_1_BUY_LONG_ASSET:
      return "Buying Asset";
    case LongPositionStatus.STEP_2_SUPPLY_TOKEN:
      return "Supplying Token";
    case LongPositionStatus.OPENING_POSITION:
      return "Opening...";
    default:
      return status.replace(/_/g, " ");
  }
};

const getProgressPercent = (position: LongPositionState) => {
  const {
    status,
    amount: { iTotalBuy, mBought },
  } = position;
  if (status === LongPositionStatus.OPENING_POSITION) {
    // Show 100% when position is fully opened
    return 100;
  }
  const progressPercent = (Number(Utils.formatAmount(mBought)) * 100) / Number(Utils.formatAmount(iTotalBuy));
  return Math.min(Math.max(progressPercent, 0), 100);
};

const calculatePnL = (position: LongPositionState): { pnl: number; pnlPercent: number } => {
  // Simplified PnL calculation - in real implementation, you'd fetch current prices
  const totalInvested = Number(position.amount.iTotalBuy) / 1_000_000;
  const currentValue = (Number(position.amount.mBought) / 1_000_000) * 1.05; // Mock 5% gain
  const pnl = currentValue - totalInvested;
  const pnlPercent = (pnl / totalInvested) * 100;
  return { pnl, pnlPercent };
};

export const PositionTab = () => {
  const { message } = App.useApp();
  const wallet = useAtomValue(walletAtom);
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const positions = useAtomValue(longPositionAtom);
  const setPositions = useSetAtom(setLongPositionAtom);

  // Track positions that are currently being processed to prevent duplicate calls
  const processingPositions = useRef<Set<string>>(new Set());

  const supplyingToken = useCallback(
    async (position: LongPositionState) => {
      if (!nitroWallet || !wallet) return;

      // Check if this position is already being processed
      if (processingPositions.current.has(position.positionId)) {
        return;
      }

      // Mark position as being processed
      processingPositions.current.add(position.positionId);
      try {
        const utxos = await Helpers.fetchRawUtxos(nitroWallet.walletInfo.address);
        const txHash = await LendingMarket.OpeningLongPosition.step2SupplyMIN({
          nitroWallet: {
            address: nitroWallet.walletInfo.address,
            privateKey: nitroWallet.privateKey,
            utxos,
            networkEnv: CONFIG.networkEnv,
          },
          minAmount: position.amount.mLongBalance,
          networkEnv: CONFIG.networkEnv,
        });

        // Update position status to STEP_3_BORROW_TOKEN after successful supply
        setPositions((prev) =>
          prev.map((p) =>
            p.positionId === position.positionId
              ? {
                  ...p,
                  status: LongPositionStatus.STEP_3_BORROW_TOKEN,
                  updatedAt: Date.now(),
                  transactions: [...p.transactions, { txHash, step: LongPositionStatus.STEP_2_SUPPLY_TOKEN }],
                }
              : p,
          ),
        );

        message.success(`Successfully supplied MIN tokens for position ${position.positionId.slice(0, 8)}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        message.error(`Failed to supply MIN tokens: ${errorMsg}`);
        console.error("Supply MIN error:", error);
      } finally {
        // Remove from processing set when done (success or error)
        processingPositions.current.delete(position.positionId);
      }
    },
    [nitroWallet, wallet, setPositions, message],
  );

  useEffect(() => {
    for (const position of positions) {
      if (position.status === LongPositionStatus.STEP_2_SUPPLY_TOKEN) {
        supplyingToken(position);
      }
    }
  }, [positions, supplyingToken]);

  const handleClosePosition = async (positionId: string) => {
    try {
      // For now, just remove from state since we stop at STEP_2
      setPositions((prev) => prev.filter((p) => p.positionId !== positionId));
      message.success("Position closed successfully");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`Failed to close position: ${errorMsg}`);
    }
  };

  if (positions.length === 0) {
    return (
      <Alert
        description="Open a long position from the Trade tab to see it here."
        message="No active positions"
        showIcon
        style={{ margin: "16px" }}
        type="info"
      />
    );
  }

  console.log("position", positions[0]);
  return (
    <div style={{ padding: "16px" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {positions.map((position) => {
          const { pnl, pnlPercent } = calculatePnL(position);
          const isPositionComplete = position.status === LongPositionStatus.OPENING_POSITION;

          return (
            <Card
              extra={
                isPositionComplete && (
                  <Button
                    danger
                    icon={<CloseOutlined />}
                    onClick={() => handleClosePosition(position.positionId)}
                    type="text"
                  >
                    Close Position
                  </Button>
                )
              }
              key={position.positionId}
              style={{
                border: isPositionComplete ? "2px solid #52c41a" : "1px solid #d9d9d9",
                boxShadow: isPositionComplete ? "0 4px 12px rgba(82, 196, 26, 0.15)" : undefined,
              }}
              title={
                <Space>
                  <TrophyOutlined />
                  <span>Position #{position.positionId.slice(0, 8)}</span>
                  <Tag color={getStatusColor(position.status)}>{getStatusText(position.status)}</Tag>
                </Space>
              }
            >
              {/* Progress Bar */}
              <Progress
                percent={Number(getProgressPercent(position).toFixed(2))}
                status={isPositionComplete ? "success" : "active"}
                strokeColor={isPositionComplete ? "#52c41a" : "#1890ff"}
                style={{ marginBottom: 20 }}
              />
              {/* Basic Position Info */}
              <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={6}>
                  <Statistic
                    prefix={<DollarOutlined />}
                    title="Leverage"
                    value={`${position.leverage}x`}
                    valueStyle={{ color: "#1890ff", fontWeight: "bold" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    prefix={<SwapOutlined />}
                    title="Long Asset"
                    value={position.longAsset.tokenName.toString()}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Borrow Asset"
                    value={position.borrowAsset.equals(ADA) ? "ADA" : position.borrowAsset.tokenName.toString()}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    prefix={pnl >= 0 ? "+" : ""}
                    suffix="ADA"
                    title="P&L"
                    value={pnl}
                    valueStyle={{
                      color: pnl >= 0 ? "#3f8600" : "#cf1322",
                      fontWeight: "bold",
                    }}
                  />
                </Col>
              </Row>
              <Divider />
              {/* Financial Details */}
              <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="ADA"
                    title="Initial Investment"
                    value={Utils.formatAmount(position.amount.mBought)}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="MIN"
                    title="MIN Bought"
                    value={Utils.formatAmount(position.amount.mTotalLong)}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="MIN"
                    title="MIN Supplied"
                    value={Utils.formatAmount(position.amount.mSupplied)}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="ADA"
                    title="ADA Borrowed"
                    value={Utils.formatAmount(position.amount.mBorrowed)}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
              </Row>
              {/* Fees */}
              <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={8}>
                  <Statistic
                    precision={2}
                    suffix="ADA"
                    title="Operation Fee"
                    value={Utils.formatAmount(position.amount.iTotalOperationFee)}
                    valueStyle={{ fontSize: "12px", color: "#666" }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    precision={2}
                    suffix="ADA"
                    title="Total Paid Fee"
                    value={Utils.formatAmount(position.amount.mTotalPaidFee)}
                    valueStyle={{ fontSize: "12px", color: "#666" }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    precision={2}
                    prefix={pnlPercent >= 0 ? "+" : ""}
                    suffix="%"
                    title="P&L %"
                    value={pnlPercent}
                    valueStyle={{
                      fontSize: "12px",
                      color: pnlPercent >= 0 ? "#3f8600" : "#cf1322",
                      fontWeight: "bold",
                    }}
                  />
                </Col>
              </Row>{" "}
              {/* Transaction History */}
              {position.transactions.length > 0 && (
                <>
                  <Divider />
                  <div>
                    <h4 style={{ marginBottom: 12 }}>Transaction History:</h4>
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {position.transactions.map((tx) => (
                        <div
                          key={tx.txHash}
                          style={{
                            padding: "12px",
                            background: "#fafafa",
                            border: "1px solid #e8e8e8",
                            borderRadius: "6px",
                            fontFamily: "monospace",
                            fontSize: "12px",
                          }}
                        >
                          <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                            <Tag color={getStatusColor(tx.step)}>{getStatusText(tx.step)}</Tag>
                          </div>
                          <div style={{ color: "#666" }}>
                            Tx: <span style={{ color: "#1890ff" }}>{tx.txHash}</span>
                          </div>
                        </div>
                      ))}
                    </Space>
                  </div>
                </>
              )}
              {/* Timestamps */}
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: "1px solid #f0f0f0",
                  fontSize: "12px",
                  color: "#999",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Created: {new Date(position.createdAt).toLocaleString()}</span>
                {position.updatedAt !== position.createdAt && (
                  <span>Updated: {new Date(position.updatedAt).toLocaleString()}</span>
                )}
              </div>
            </Card>
          );
        })}
      </Space>
    </div>
  );
};
