"use client";

import { CloseOutlined, DollarOutlined, SwapOutlined, TrophyOutlined } from "@ant-design/icons";
import invariant from "@minswap/tiny-invariant";
import { ADA, Asset, Utxo, XJSON } from "@repo/ledger-core";
import { LendingMarket, type LiqwidProvider, NitroWallet } from "@repo/minswap-lending-market";
import { Alert, App, Button, Card, Col, Divider, Progress, Row, Space, Statistic, Tag } from "antd";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
  type LongPositionState,
  LongPositionStatus,
  longPositionAtom,
  type NitroWalletData,
  nitroWalletAtom,
  setLongPositionAtom,
  type WalletData,
  walletAtom,
} from "../atoms/walletAtom";
import { CONFIG } from "../config";
import { Helpers } from "../lib/helpers";
import { Utils } from "../lib/utils";

const getStatusColor = (status: LongPositionStatus) => {
  switch (status) {
    case LongPositionStatus.STEP_1_BUY_LONG_ASSET:
      return "orange";
    case LongPositionStatus.STEP_2_SUPPLY_TOKEN:
      return "processing";
    case LongPositionStatus.OPENING_POSITION:
      return "success";
    case LongPositionStatus.STEP_3_BORROW_TOKEN:
      return "purple";
    case LongPositionStatus.STEP_BUY_MORE_LONG_ASSET:
      return "orange";
    case LongPositionStatus.STEP_4_SELL_LONG_ASSET:
      return "magenta";
    case LongPositionStatus.STEP_5_REPAY_ASSET:
      return "geekblue";
    case LongPositionStatus.STEP_6_WITHDRAW_COLLATERAL:
      return "cyan";
    case LongPositionStatus.STEP_SELL_ALL_LONG_ASSET:
      return "magenta";
    case LongPositionStatus.CLOSED_POSITION:
      return "red";
    default:
      return "default";
  }
};

const getStatusText = (status: LongPositionStatus) => {
  switch (status) {
    case LongPositionStatus.STEP_1_BUY_LONG_ASSET:
      return "Buying Asset";
    case LongPositionStatus.STEP_2_SUPPLY_TOKEN:
      return "Supplying Token";
    case LongPositionStatus.OPENING_POSITION:
      return "Opening...";
    case LongPositionStatus.STEP_4_SELL_LONG_ASSET:
    case LongPositionStatus.STEP_5_REPAY_ASSET:
    case LongPositionStatus.STEP_6_WITHDRAW_COLLATERAL:
    case LongPositionStatus.STEP_SELL_ALL_LONG_ASSET:
      return `Closing Position... ${status.replace(/_/g, " ")}`;
    case LongPositionStatus.CLOSED_POSITION:
      return "Position Closed";
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

enum ExtraStatus {
  EXTRA_STEP_BUY_MORE = "extra_step_buy_more",
  EXTRA_STEP_SELL_ALL = "extra_step_sell_all",
}

type StepBuyMoreExtra = {
  extraStatus: ExtraStatus.EXTRA_STEP_BUY_MORE;
  buyMoreAmount: bigint;
  nextStatus: LongPositionStatus.OPENING_POSITION;
  logStatus: LongPositionStatus.STEP_BUY_MORE_LONG_ASSET;
};
type StepSellAllExtra = {
  extraStatus: ExtraStatus.EXTRA_STEP_SELL_ALL;
  nextStatus: LongPositionStatus.CLOSED_POSITION;
  logStatus: LongPositionStatus.STEP_SELL_ALL_LONG_ASSET;
};

type InnerHandleFn = (input: {
  position: LongPositionState;
  wallet: WalletData;
  nitroWallet: NitroWalletData;
  extra?: StepBuyMoreExtra | StepSellAllExtra;
}) => Promise<LongPositionState>;
type HandlePositionInput = {
  position: LongPositionState;
  errorMessage: string;
  successMessage: string;
  innerFn: InnerHandleFn;
};

const handleStep1: InnerHandleFn = async ({ position, wallet, nitroWallet, extra }) => {
  if (position.hasCallback) {
    await Helpers.sleep(10000);
    const balance = await NitroWallet.fetchBalance(nitroWallet.walletInfo.address.bech32);
    console.log("step 1 callback", XJSON.stringify(balance, 2));
    const minToken = Asset.fromString(LendingMarket.mapMINToken[CONFIG.networkEnv]);
    if (balance.has(minToken)) {
      return {
        ...position,
        amount: {
          ...position.amount,
          mLongBalance: balance.get(minToken),
          mTotalLong: position.amount.mTotalLong + balance.get(minToken),
        },
        // priority extra
        status:
          extra && extra.extraStatus === ExtraStatus.EXTRA_STEP_BUY_MORE
            ? extra.nextStatus
            : LongPositionStatus.STEP_2_SUPPLY_TOKEN,
        hasCallback: undefined,
        callbackExtra: undefined,
      };
    } else {
      // continue callback
      return { ...position, hasCallback: position.hasCallback + 1 };
    }
  }
  const [utxos, priceData] = await Promise.all([
    NitroWallet.fetchRawUtxos(nitroWallet.walletInfo.address.bech32),
    LendingMarket.fetchAdaMinPrice(CONFIG.networkEnv),
  ]);
  invariant(nitroWallet.walletInfo.balance, "Nitro wallet balance is undefined");
  let mBought: bigint;
  if (extra && extra.extraStatus === ExtraStatus.EXTRA_STEP_BUY_MORE) {
    mBought = extra.buyMoreAmount;
  } else {
    mBought = nitroWallet.walletInfo.balance - LendingMarket.OpeningLongPosition.OPERATION_FEE_ADA;
  }
  const txHash = await LendingMarket.OpeningLongPosition.step1CreateOrder({
    nitroWallet: {
      address: nitroWallet.walletInfo.address,
      privateKey: nitroWallet.privateKey,
      utxos,
      submitTx: wallet.api.submitTx.bind(wallet.api),
    },
    priceInAdaResponse: priceData,
    networkEnv: CONFIG.networkEnv,
    amountIn: mBought,
  });
  console.log("Step 1 tx hash:", txHash);
  const logStep =
    extra && extra.extraStatus === ExtraStatus.EXTRA_STEP_BUY_MORE
      ? extra.logStatus
      : LongPositionStatus.STEP_1_BUY_LONG_ASSET;
  return {
    ...position,
    amount: {
      ...position.amount,
      mBought: position.amount.mBought + mBought,
    },
    updatedAt: Date.now(),
    transactions: [...position.transactions, { txHash, step: logStep }],
    hasCallback: 1,
  };
};

const handleStep2: InnerHandleFn = async ({ position, nitroWallet }) => {
  if (position.hasCallback) {
    await Helpers.sleep(10000);
    const balance = await NitroWallet.fetchBalance(nitroWallet.walletInfo.address.bech32);
    console.log("step 2 callback", XJSON.stringify(balance, 2));
    const qMinToken = Asset.fromString("186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0");
    if (balance.has(qMinToken)) {
      return {
        ...position,
        status: LongPositionStatus.STEP_3_BORROW_TOKEN,
        amount: {
          ...position.amount,
          mSupplied: position.amount.mSupplied + balance.get(qMinToken),
        },
        hasCallback: undefined,
        callbackExtra: undefined,
      };
    } else {
      // continue callback
      return { ...position, hasCallback: position.hasCallback + 1 };
    }
  }
  const utxos = await Helpers.fetchRawUtxos(nitroWallet.walletInfo.address);
  const txHash = await LendingMarket.OpeningLongPosition.step2SupplyMIN({
    nitroWallet: {
      address: nitroWallet.walletInfo.address,
      privateKey: nitroWallet.privateKey,
      utxos,
    },
    minAmount: position.amount.mLongBalance,
    networkEnv: CONFIG.networkEnv,
  });
  console.log("Step 2 tx hash:", txHash);
  return {
    ...position,
    updatedAt: Date.now(),
    amount: {
      ...position.amount,
      mLongBalance: 0n,
    },
    transactions: [...position.transactions, { txHash, step: LongPositionStatus.STEP_2_SUPPLY_TOKEN }],
    hasCallback: 1,
  };
};

const handleStep3: InnerHandleFn = async ({ position, nitroWallet }) => {
  if (position.hasCallback) {
    await Helpers.sleep(10000);
    const balance = await NitroWallet.fetchBalance(nitroWallet.walletInfo.address.bech32);
    console.log("step 3 callback", XJSON.stringify(balance, 2));
    const qMinToken = Asset.fromString("186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0");
    if (!balance.has(qMinToken)) {
      return {
        ...position,
        status: LongPositionStatus.STEP_BUY_MORE_LONG_ASSET,
        hasCallback: undefined,
        callbackExtra: undefined,
      };
    } else {
      // continue callback
      return { ...position, hasCallback: position.hasCallback + 1 };
    }
  }
  const utxos = await Helpers.fetchRawUtxos(nitroWallet.walletInfo.address);
  const balance = Utxo.sumValue(utxos.map(Utxo.fromHex));
  const qMinToken = Asset.fromString("186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0");
  const qMinAmount = balance.get(qMinToken);
  const collateralAmount = await LendingMarket.OpeningLongPosition.calculateWithdrawAllAmount({
    networkEnv: CONFIG.networkEnv,
    address: nitroWallet.walletInfo.address,
    marketId: "MIN",
    qTokenAmount: Number(qMinAmount),
  });
  const collaterals: LiqwidProvider.LoanCalculationInput["collaterals"] = [
    {
      id: "Ada.186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0",
      amount: Number(collateralAmount / 1e6),
    },
  ];
  const buildTxCollaterals: LiqwidProvider.BorrowCollateral[] = [
    {
      id: "qMIN",
      amount: Number(qMinAmount),
    },
  ];
  const { txHash, borrowAmount } = await LendingMarket.OpeningLongPosition.borrowAda({
    nitroWallet: {
      address: nitroWallet.walletInfo.address,
      privateKey: nitroWallet.privateKey,
      utxos,
    },
    borrowMarketId: "Ada",
    currentDebt: 0,
    collaterals,
    buildTxCollaterals,
    networkEnv: CONFIG.networkEnv,
  });
  console.log("Step 3 tx hash:", txHash, borrowAmount);
  return {
    ...position,
    updatedAt: Date.now(),
    amount: {
      ...position.amount,
      mSupplied: 0n,
      mBorrowed: position.amount.mBorrowed + borrowAmount,
    },
    transactions: [...position.transactions, { txHash, step: LongPositionStatus.STEP_3_BORROW_TOKEN }],
    hasCallback: 1,
  };
};

const handleStep4: InnerHandleFn = async ({ position, nitroWallet, wallet, extra }) => {
  if (position.hasCallback) {
    await Helpers.sleep(10000);
    const balance = await NitroWallet.fetchBalance(nitroWallet.walletInfo.address.bech32);
    console.log("step 4 callback", XJSON.stringify(balance, 2));
    const minToken = Asset.fromString(LendingMarket.mapMINToken[CONFIG.networkEnv]);
    if (!balance.has(minToken)) {
      return {
        ...position,
        status:
          extra && extra.extraStatus === ExtraStatus.EXTRA_STEP_SELL_ALL
            ? extra.nextStatus
            : LongPositionStatus.STEP_5_REPAY_ASSET,
        hasCallback: undefined,
        callbackExtra: undefined,
      };
    } else {
      // continue callback
      return { ...position, hasCallback: position.hasCallback + 1 };
    }
  }
  const [utxos, priceData] = await Promise.all([
    NitroWallet.fetchRawUtxos(nitroWallet.walletInfo.address.bech32),
    LendingMarket.fetchAdaMinPrice(CONFIG.networkEnv),
  ]);
  const balance = Utxo.sumValue(utxos.map(Utxo.fromHex));
  console.log("step 4 balance", XJSON.stringify(balance, 2));
  const minToken = Asset.fromString(LendingMarket.mapMINToken[CONFIG.networkEnv]);
  console.log("sell", balance.get(minToken));
  const txHash = await LendingMarket.OpeningLongPosition.sellLongAsset({
    nitroWallet: {
      address: nitroWallet.walletInfo.address,
      privateKey: nitroWallet.privateKey,
      utxos,
      submitTx: wallet.api.submitTx.bind(wallet.api),
    },
    priceInAdaResponse: priceData,
    networkEnv: CONFIG.networkEnv,
    amountIn: balance.get(minToken),
  });
  console.log("selling tx hash:", txHash);
  const logStatus =
    extra && extra.extraStatus === ExtraStatus.EXTRA_STEP_SELL_ALL
      ? extra.logStatus
      : LongPositionStatus.STEP_4_SELL_LONG_ASSET;
  return {
    ...position,
    updatedAt: Date.now(),
    transactions: [...position.transactions, { txHash, step: logStatus }],
    hasCallback: 1,
  };
};

// repay, close loan, receive qToken
const handleStep5: InnerHandleFn = async ({ position, nitroWallet }) => {
  if (position.hasCallback) {
    await Helpers.sleep(10000);
    const balance = await NitroWallet.fetchBalance(nitroWallet.walletInfo.address.bech32);
    console.log("step 5 callback", XJSON.stringify(balance, 2));
    const qMinToken = Asset.fromString("186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0");
    if (balance.has(qMinToken)) {
      return {
        ...position,
        status: LongPositionStatus.STEP_6_WITHDRAW_COLLATERAL,
        hasCallback: undefined,
        callbackExtra: undefined,
      };
    }
  }
  const utxos = await Helpers.fetchRawUtxos(nitroWallet.walletInfo.address);
  const txHash = await LendingMarket.OpeningLongPosition.repayAllDebt({
    nitroWallet: {
      address: nitroWallet.walletInfo.address,
      privateKey: nitroWallet.privateKey,
      utxos,
    },
    networkEnv: CONFIG.networkEnv,
  });
  return {
    ...position,
    updatedAt: Date.now(),
    transactions: [...position.transactions, { txHash, step: LongPositionStatus.STEP_5_REPAY_ASSET }],
    hasCallback: 1,
  };
};

// withdraw collateral, pay qMIN, receive MIN
const handleStep6: InnerHandleFn = async ({ position, nitroWallet }) => {
  if (position.hasCallback) {
    await Helpers.sleep(10000);
    const balance = await NitroWallet.fetchBalance(nitroWallet.walletInfo.address.bech32);
    console.log("step 6 callback", XJSON.stringify(balance, 2));
    const minToken = Asset.fromString(LendingMarket.mapMINToken[CONFIG.networkEnv]);
    if (balance.has(minToken)) {
      return {
        ...position,
        status: LongPositionStatus.STEP_SELL_ALL_LONG_ASSET,
        hasCallback: undefined,
        callbackExtra: undefined,
      };
    } else {
      // continue callback
      return { ...position, hasCallback: position.hasCallback + 1 };
    }
  }
  const utxos = await Helpers.fetchRawUtxos(nitroWallet.walletInfo.address);
  const balance = Utxo.sumValue(utxos.map(Utxo.fromHex));
  const qMinToken = Asset.fromString("186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0");
  const supplyAmount = balance.get(qMinToken);
  const txHash = await LendingMarket.OpeningLongPosition.withdrawAllSupply({
    nitroWallet: {
      address: nitroWallet.walletInfo.address,
      privateKey: nitroWallet.privateKey,
      utxos,
    },
    networkEnv: CONFIG.networkEnv,
    marketId: "MIN",
    supplyQTokenAmount: Number(supplyAmount),
  });
  console.log("Step 6: Withdrawing collateral from Liqwid", txHash);
  return {
    ...position,
    updatedAt: Date.now(),
    amount: {
      ...position.amount,
      mSupplied: 0n,
    },
    transactions: [...position.transactions, { txHash, step: LongPositionStatus.STEP_6_WITHDRAW_COLLATERAL }],
    hasCallback: 1,
  };
};

export const PositionTab = () => {
  const { message } = App.useApp();
  const wallet = useAtomValue(walletAtom);
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const positions = useAtomValue(longPositionAtom);
  const setPositions = useSetAtom(setLongPositionAtom);

  // Track positions that are currently being processed to prevent duplicate calls
  const processingPositions = useRef<Set<string>>(new Set());

  const handlePosition = useCallback(
    async (input: HandlePositionInput) => {
      const { position, errorMessage, successMessage, innerFn } = input;
      if (!nitroWallet || !wallet) return;
      // Check if this position is already being processed
      if (processingPositions.current.has(position.positionId)) {
        return;
      }
      // Mark position as being processed
      processingPositions.current.add(position.positionId);
      try {
        let retries = 0;
        const maxRetries = 3;
        let lastError: Error | null = null;

        while (retries <= maxRetries) {
          try {
            const newPosition = await innerFn({ position, wallet, nitroWallet });
            setPositions((prev) => prev.map((p) => (p.positionId === position.positionId ? newPosition : p)));
            if (!newPosition.hasCallback) {
              message.success(`${successMessage} ${position.positionId.slice(0, 8)}`);
            }
            break; // Exit loop on success
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (retries < maxRetries) {
              retries++;
              console.error("backoff error", error);
              console.log(`Retry ${retries}/${maxRetries} for position ${position.positionId.slice(0, 8)} after 20s...`);
              await Helpers.sleep(20000); // Sleep 20 seconds before retry
            } else {
              throw lastError;
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        message.error(`${errorMessage}: ${errorMsg}`);
        console.error("handle position error: ", error);
      } finally {
        // Remove from processing set when done (success or error)
        processingPositions.current.delete(position.positionId);
      }
    },
    [nitroWallet, wallet, setPositions, message],
  );

  useEffect(() => {
    console.log("go here", {
      date: new Date().toString(),
      status: positions[0]?.status,
      hasCallback: positions[0]?.hasCallback,
    });
    for (const position of positions) {
      if (position.status === LongPositionStatus.STEP_1_BUY_LONG_ASSET) {
        handlePosition({
          position,
          errorMessage: "Failed to buy long asset",
          successMessage: "Successfully bought long asset for position",
          innerFn: handleStep1,
        });
        continue;
      }
      if (position.status === LongPositionStatus.STEP_2_SUPPLY_TOKEN) {
        handlePosition({
          position,
          errorMessage: "Failed to supply MIN tokens",
          successMessage: "Successfully supplied MIN tokens for position",
          innerFn: handleStep2,
        });
        continue;
      }
      if (position.status === LongPositionStatus.STEP_3_BORROW_TOKEN) {
        handlePosition({
          position,
          errorMessage: "Failed to borrow tokens",
          successMessage: "Successfully borrowed tokens for position",
          innerFn: handleStep3,
        });
        continue;
      }
      if (position.status === LongPositionStatus.STEP_BUY_MORE_LONG_ASSET) {
        const buyMoreAmount = position.amount.iTotalBuy - position.amount.mBought;
        handlePosition({
          position,
          errorMessage: "Failed to buy more long asset",
          successMessage: "Successfully bought more long asset for position",
          innerFn: async (input) => {
            return handleStep1({
              ...input,
              extra: {
                extraStatus: ExtraStatus.EXTRA_STEP_BUY_MORE,
                buyMoreAmount,
                nextStatus: LongPositionStatus.OPENING_POSITION,
                logStatus: LongPositionStatus.STEP_BUY_MORE_LONG_ASSET,
              },
            });
          },
        });
        continue;
      }
      if (position.status === LongPositionStatus.STEP_4_SELL_LONG_ASSET) {
        handlePosition({
          position,
          errorMessage: "Failed to sell long asset",
          successMessage: "Successfully sold long asset for position",
          innerFn: handleStep4,
        });
        continue;
      }
      if (position.status === LongPositionStatus.STEP_5_REPAY_ASSET) {
        handlePosition({
          position,
          errorMessage: "Failed to close loan",
          successMessage: "Successfully closed loan and repaid debt",
          innerFn: handleStep5,
        });
        continue;
      }
      if (position.status === LongPositionStatus.STEP_6_WITHDRAW_COLLATERAL) {
        handlePosition({
          position,
          errorMessage: "Failed to withdraw collateral",
          successMessage: "Successfully withdrew collateral for position",
          innerFn: handleStep6,
        });
        continue;
      }
      if (position.status === LongPositionStatus.STEP_SELL_ALL_LONG_ASSET) {
        handlePosition({
          position,
          errorMessage: "Failed to sell all long asset",
          successMessage: "Successfully sold all long asset for position",
          innerFn: async (input) => {
            return handleStep4({
              ...input,
              extra: {
                extraStatus: ExtraStatus.EXTRA_STEP_SELL_ALL,
                nextStatus: LongPositionStatus.CLOSED_POSITION,
                logStatus: LongPositionStatus.STEP_SELL_ALL_LONG_ASSET,
              },
            });
          },
        });
      }
    }
  }, [positions, handlePosition]);

  const handleClosePosition = async (positionId: string) => {
    try {
      setPositions((prev) =>
        prev.map((p) =>
          p.positionId === positionId
            ? {
                ...p,
                status: LongPositionStatus.STEP_4_SELL_LONG_ASSET,
                updatedAt: Date.now(),
              }
            : p,
        ),
      );
      message.success("Position closing initiated");
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
                    suffix="qMIN"
                    title="qMIN Supplied"
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
