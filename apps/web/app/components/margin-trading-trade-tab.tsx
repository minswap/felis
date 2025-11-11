"use client";

import { ArrowRightOutlined, InfoCircleOutlined } from "@ant-design/icons";
import invariant from "@minswap/tiny-invariant";
import { ADA, Asset, Bytes } from "@repo/ledger-core";
import { sha3 } from "@repo/ledger-utils";
import { DexV2Calculation, OrderV2Direction } from "@repo/minswap-dex-v2";
import { LendingMarket } from "@repo/minswap-lending-market";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Divider,
  Form,
  InputNumber,
  Radio,
  Row,
  Slider,
  Space,
  Statistic,
  Tooltip,
} from "antd";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import {
  type LongPositionState,
  LongPositionStatus,
  longPositionAtom,
  minAdaPriceAtom,
  nitroBalanceAtom,
  nitroWalletAtom,
  setLongPositionAtom,
  walletAtom,
} from "../atoms/walletAtom";
import { CONFIG } from "../config";

// POC Configuration
const MIN_REQUIRED_ADA = 312_000_000n;
const HARDCODED_TOTAL_ADA = 450;
const HARDCODED_LEVERAGE = 1.5;

export const TradeTab = () => {
  const { message } = App.useApp();
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const wallet = useAtomValue(walletAtom);
  const positions = useAtomValue(longPositionAtom);
  const setPositions = useSetAtom(setLongPositionAtom);
  const nitroBalance = useAtomValue(nitroBalanceAtom);

  // Trading parameters
  const [leverage, setLeverage] = useState<1 | 1.5>(HARDCODED_LEVERAGE as 1.5);
  const [marginMode, _setMarginMode] = useState<"isolated">("isolated");
  const [autoBorrowRepay, setAutoBorrowRepay] = useState(true);

  // Input values
  const [adaAmount, setAdaAmount] = useState<number>(HARDCODED_TOTAL_ADA);
  const [minAmount, setMinAmount] = useState<number>(0);
  const [sliderValue, setSliderValue] = useState<number>(100);
  const minAdaPrice = useAtomValue(minAdaPriceAtom);

  // Loading states
  const [loading, setLoading] = useState(false);
  // const _hasEnoughBalance = nitroBalance >= MIN_REQUIRED_ADA;

  const handleAmountChange = (value: number | null) => {
    if (value === null) return;
    setMinAmount(value);
  };

  const handleAdaAmountChange = useCallback(
    (value: number | null) => {
      if (value === null) return;
      // const percentage = (value / Number(MIN_REQUIRED_ADA)) * 100;
      setSliderValue(100);

      if (minAdaPrice) {
        try {
          const amountInLovelace = BigInt(Math.floor(value * 1_000_000));
          const result = DexV2Calculation.calculateSwapExactIn({
            datumReserves: [BigInt(minAdaPrice.datumReserves[0]), BigInt(minAdaPrice.datumReserves[1])],
            valueReserves: [BigInt(minAdaPrice.valueReserves[0]), BigInt(minAdaPrice.valueReserves[1])],
            tradingFee: {
              feeANumerator: BigInt(minAdaPrice.tradingFee.feeANumerator),
              feeBNumerator: BigInt(minAdaPrice.tradingFee.feeBNumerator),
            },
            amountIn: amountInLovelace,
            direction: OrderV2Direction.A_TO_B,
            feeSharingNumerator: minAdaPrice.feeSharingNumerator ? BigInt(minAdaPrice.feeSharingNumerator) : null,
          });

          const minAmountReceived = Number(result.amountOut) / 1_000_000;
          setMinAmount(minAmountReceived);
        } catch (err) {
          console.error("Failed to calculate MIN amount:", err);
        }
      }
    },
    [minAdaPrice],
  );

  useEffect(() => {
    if (nitroBalance && nitroBalance >= MIN_REQUIRED_ADA) {
      handleAdaAmountChange(300);
    }
  }, [nitroBalance, handleAdaAmountChange]);

  // const handleSliderChange = (value: number) => {
  //   setSliderValue(value);
  //   if (minAdaPrice) {
  //     try {
  //       const amountInLovelace = BigInt(Math.floor(totalAda * 1_000_000));

  //       const result = DexV2Calculation.calculateSwapExactIn({
  //         datumReserves: [BigInt(minAdaPrice.datumReserves[0]), BigInt(minAdaPrice.datumReserves[1])],
  //         valueReserves: [BigInt(minAdaPrice.valueReserves[0]), BigInt(minAdaPrice.valueReserves[1])],
  //         tradingFee: {
  //           feeANumerator: BigInt(minAdaPrice.tradingFee.feeANumerator),
  //           feeBNumerator: BigInt(minAdaPrice.tradingFee.feeBNumerator),
  //         },
  //         amountIn: amountInLovelace,
  //         direction: OrderV2Direction.A_TO_B,
  //         feeSharingNumerator: minAdaPrice.feeSharingNumerator ? BigInt(minAdaPrice.feeSharingNumerator) : null,
  //       });

  //       const minAmountReceived = Number(result.amountOut) / 1_000_000;
  //       setMinAmount(minAmountReceived);
  //     } catch (err) {
  //       console.error("Failed to calculate MIN amount:", err);
  //     }
  //   }
  // };

  const borrowAmount = 150;
  const shouldBorrow = borrowAmount > 0;
  const adaDebt = shouldBorrow ? borrowAmount : 0;

  const calculateLiquidationPrice = (): number => {
    if (adaDebt <= 0) return 0;
    return adaDebt / minAmount;
  };

  const _liquidationPrice = calculateLiquidationPrice();

  const handleBuy = async () => {
    invariant(wallet && nitroWallet);
    if (adaAmount <= 0) {
      message.error("Please enter ADA amount");
      return;
    }

    if (!minAdaPrice) {
      message.error("Price data not available");
      return;
    }

    setLoading(true);
    try {
      const now = Date.now();
      const newLongPositionState: LongPositionState = {
        positionId: sha3(Bytes.fromString(`${nitroWallet.walletInfo.address.bech32}.${now}`).hex),
        status: LongPositionStatus.STEP_1_BUY_LONG_ASSET,
        nitroWalletAddress: nitroWallet.walletInfo.address.bech32,
        leverage,
        longAsset: Asset.fromString(LendingMarket.mapMINToken[CONFIG.networkEnv]), // MIN
        borrowAsset: ADA,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        amount: {
          iTotalBuy: BigInt(Math.floor(adaAmount * 1e6)),
          iTotalBorrow: 150_000_000n,
          iTotalOperationFee: LendingMarket.OpeningLongPosition.OPERATION_FEE_ADA,
          mTotalPaidFee: 0n,
          mBought: 0n,
          mTotalLong: 0n,
          mLongBalance: 0n,
          mBorrowed: 0n,
          mSupplied: 0n,
          mRepaid: 0n,
          mWithdrawn: 0n,
        },
        transactions: [],
      };
      setPositions([newLongPositionState]);
      message.success("Position opened successfully!");
      setAdaAmount(0);
      setMinAmount(0);
      setSliderValue(0);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`Failed to open position: ${errorMsg}`);
      console.error("Buy error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {/* POC Version Warning */}
      {nitroWallet?.walletInfo && nitroBalance >= MIN_REQUIRED_ADA ? (
        <Alert
          description={`This is a proof-of-concept version. Long position is hardcoded to 450 ADA (1.5x leverage). Minimum Nitro wallet balance required: 312 ADA. Current balance: ${(Number(nitroBalance) / 1_000_000).toFixed(2)} ADA`}
          message="⚠️ POC Version"
          showIcon
          type="warning"
        />
      ) : null}

      {nitroWallet?.walletInfo && nitroBalance < MIN_REQUIRED_ADA ? (
        <Alert
          description={`Your Nitro wallet balance is insufficient. Minimum required: 312 ADA. Current: ${(Number(nitroBalance) / 1_000_000).toFixed(2)} ADA`}
          message="Insufficient Balance"
          showIcon
          type="error"
        />
      ) : null}

      {/* Mode Selection */}
      <Row gutter={16}>
        <Col span={6}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Margin Mode</div>
          <Button block disabled type={marginMode === "isolated" ? "primary" : "default"}>
            Isolated
          </Button>
        </Col>
        <Col span={6}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Leverage</div>
          <Radio.Group onChange={(e) => setLeverage(e.target.value)} style={{ width: "100%" }} value={leverage}>
            <Radio disabled={true} value={1}>
              1.00x
            </Radio>
            <Radio value={1.5}>1.50x</Radio>
          </Radio.Group>
        </Col>
        <Col span={6}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Borrow/Repay</div>
          <Radio.Group
            onChange={(e) => setAutoBorrowRepay(e.target.value === "auto")}
            style={{ width: "100%" }}
            value={autoBorrowRepay ? "auto" : "manual"}
          >
            <Radio value="auto">Auto</Radio>
            <Radio disabled={true} value="manual">
              Manual
            </Radio>
          </Radio.Group>
        </Col>
        <Col span={6}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Order Type</div>
          <Button block disabled type="default">
            Market
          </Button>
        </Col>
      </Row>

      <Divider />

      {/* Market Price Info */}
      <Card style={{ background: "#fafafa" }}>
        <Row gutter={16}>
          <Col span={12}>
            <Statistic
              loading={minAdaPrice === null}
              suffix="ADA/MIN"
              title="Market Price"
              value={Number(minAdaPrice?.price) ?? 0}
            />
          </Col>
          <Col span={12}>
            <Statistic
              suffix="ADA"
              title="Your Available"
              value={((Number(nitroBalance) ?? 0) / 1_000_000).toFixed(2)}
            />
          </Col>
        </Row>
      </Card>

      <Divider />

      {/* Amount Inputs */}
      <Form layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Total (ADA)" style={{ marginBottom: 0 }}>
              <InputNumber
                disabled={true}
                min={0}
                onChange={handleAdaAmountChange}
                placeholder="0.00"
                step={0.01}
                style={{ width: "100%" }}
                value={adaAmount}
              />
            </Form.Item>
          </Col>
          <Col span={2} style={{ display: "flex", alignItems: "flex-end" }}>
            <ArrowRightOutlined style={{ fontSize: 18 }} />
          </Col>
          <Col span={10}>
            <Form.Item label="Amount (MIN)" style={{ marginBottom: 0 }}>
              <InputNumber
                disabled={true}
                min={0}
                onChange={handleAmountChange}
                placeholder="0.00"
                step={0.01}
                style={{ width: "100%" }}
                value={minAmount}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      {/* Slider */}
      <div>
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
          <span>Margin Slider</span>
          <span style={{ color: "#666" }}>{sliderValue.toFixed(0)}%</span>
        </div>
        <Slider
          disabled={true}
          marks={{ 0: "0%", 50: "50%", 100: "100%" }}
          max={100}
          onChange={() => {}}
          value={sliderValue}
        />
      </div>

      <Divider />

      {/* Trading Info */}
      <Row gutter={16}>
        <Col span={12}>
          <Card style={{ background: "#f0f5ff" }}>
            <Statistic
              suffix="ADA"
              title={
                <Tooltip title="Available ADA in your Nitro Wallet">
                  Avbl <InfoCircleOutlined />
                </Tooltip>
              }
              value={((Number(nitroBalance) ?? 0) / 1_000_000).toFixed(2)}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card style={{ background: "#f0f5ff" }}>
            <Statistic
              suffix="ADA"
              title={
                <Tooltip title="Maximum ADA you can use with leverage">
                  Max <InfoCircleOutlined />
                </Tooltip>
              }
              value={(((Number(nitroBalance) ?? 0) / 1_000_000) * leverage).toFixed(2)}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        {/* <Col span={8}>
          <Card style={{ background: "#f0f5ff" }}>
            <Statistic
              suffix="ADA"
              title={
                <Tooltip title="Liquidation price for your position">
                  Liq.Price <InfoCircleOutlined />
                </Tooltip>
              }
              value={liquidationPrice.toFixed(4)}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col> */}
      </Row>

      {/* Borrow/Repay Info */}
      {shouldBorrow && (
        <>
          <Alert
            message={`You will borrow ${borrowAmount.toFixed(2)} ADA to complete this trade`}
            showIcon
            type="info"
          />
          <Row gutter={16}>
            <Col span={12}>
              <Card style={{ background: "#fff7e6" }}>
                <Statistic
                  suffix="ADA"
                  title={
                    <Tooltip title="Amount automatically borrowed when placing order">
                      Borrow <InfoCircleOutlined />
                    </Tooltip>
                  }
                  value={borrowAmount.toFixed(2)}
                  valueStyle={{ fontSize: 14 }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card style={{ background: "#f6ffed" }}>
                <Statistic
                  suffix="ADA"
                  title={
                    <Tooltip title="Amount automatically repaid after transaction. Fees may alter final amount.">
                      Repay <InfoCircleOutlined />
                    </Tooltip>
                  }
                  value={borrowAmount.toFixed(2)}
                  valueStyle={{ fontSize: 14 }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* Buy Button */}
      <Button
        block
        disabled={!nitroWallet || minAmount <= 0 || positions.length > 0}
        loading={loading}
        onClick={handleBuy}
        size="large"
        type="primary"
      >
        {positions.length > 0
          ? "Close existing position first"
          : loading
            ? "Opening Position..."
            : "Open Long Position"}
      </Button>
    </Space>
  );
};
