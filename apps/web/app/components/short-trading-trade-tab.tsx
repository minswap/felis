"use client";

import { ArrowRightOutlined, InfoCircleOutlined } from "@ant-design/icons";
import invariant from "@minswap/tiny-invariant";
import { Asset, Bytes } from "@repo/ledger-core";
import { sha3 } from "@repo/ledger-utils";
import { DexV2Calculation, OrderV2Direction } from "@repo/minswap-dex-v2";
import { LendingMarket } from "@repo/minswap-lending-market";
import { Alert, App, Button, Card, Col, Divider, Form, InputNumber, Radio, Row, Space, Statistic, Tooltip } from "antd";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import {
  minAdaPriceAtom,
  nitroBalanceAtom,
  nitroWalletAtom,
  type ShortPositionState,
  ShortPositionStatus,
  setShortPositionAtom,
  shortPositionAtom,
} from "../atoms/walletAtom";
import { CONFIG } from "../config";
import { Utils } from "../lib/utils";

const MIN_REQUIRED_ADA = 1_200_000_000n; // 1200 ada
const AMOUNT_IN_L = 500_000_000n; // 500 ada
const SUPPLY_AMOUNT_L = 1_000_000_000n; // 1000 ada

// MARK: Trade Tab
export const ShortTradeTab = () => {
  const { message } = App.useApp();
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const positions = useAtomValue(shortPositionAtom);
  const setPositions = useSetAtom(setShortPositionAtom);
  const nitroBalance = useAtomValue(nitroBalanceAtom);
  const minAdaPrice = useAtomValue(minAdaPriceAtom);
  const [minAmountL, setMinAmountL] = useState<bigint>(0n);
  const [supplyAdaAmountL, _setSupplyAdaAmountL] = useState<bigint>(SUPPLY_AMOUNT_L);
  const [liquidationPrice, setLiquidationPrice] = useState<number>(0);

  useEffect(() => {
    if (minAdaPrice) {
      try {
        const result = DexV2Calculation.calculateSwapExactIn({
          datumReserves: [BigInt(minAdaPrice.datumReserves[0]), BigInt(minAdaPrice.datumReserves[1])],
          valueReserves: [BigInt(minAdaPrice.valueReserves[0]), BigInt(minAdaPrice.valueReserves[1])],
          tradingFee: {
            feeANumerator: BigInt(minAdaPrice.tradingFee.feeANumerator),
            feeBNumerator: BigInt(minAdaPrice.tradingFee.feeBNumerator),
          },
          amountIn: AMOUNT_IN_L,
          direction: OrderV2Direction.A_TO_B,
          feeSharingNumerator: minAdaPrice.feeSharingNumerator ? BigInt(minAdaPrice.feeSharingNumerator) : null,
        });
        setMinAmountL(result.amountOut);
        setLiquidationPrice(Number(minAdaPrice.price) * 1.1); // Liquidation at 10% price increase
      } catch (err) {
        console.error("Failed to calculate MIN amount:", err);
      }
    }
  }, [minAdaPrice]);

  const handleShort = async () => {
    invariant(nitroWallet, "Nitro wallet is not connected");
    const now = Date.now();
    const newShortPositionState: ShortPositionState = {
      positionId: sha3(Bytes.fromString(`${nitroWallet.walletInfo.address.bech32}.${now}`).hex),
      status: ShortPositionStatus.STEP_1_SUPPLY_TOKEN,
      nitroWalletAddress: nitroWallet.walletInfo.address.bech32,
      shortAsset: Asset.fromString(LendingMarket.mapMINToken[CONFIG.networkEnv]), // MIN
      createdAt: Date.now(),
      updatedAt: Date.now(),
      amount: {
        iTotalSupplyL: supplyAdaAmountL,
        iBorrowAmountL: minAmountL,
        iLiquidationPrice: liquidationPrice,
        mSuppliedL: 0n,
        mShortedL: 0n,
        mShortedEstimateAda: 0n,
        mBorrowedL: 0n,
        mTradingPrice: 0,
        mClosedPrice: 0,
        mClosedAda: 0n,
        mRepaidL: 0n,
        mWithdrawnL: 0n,
      },
      transactions: [],
    };
    setPositions([newShortPositionState]);
    message.success("Short Position opened successfully!");
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {/* POC Version Warning */}
      {nitroWallet?.walletInfo && nitroBalance >= MIN_REQUIRED_ADA ? (
        <Alert
          description={`This is a proof-of-concept version. SHORT position is hardcoded to 1000 ADA (0.5x leverage). Minimum Nitro wallet balance required: 1200 ADA. Current balance: ${(Number(nitroBalance) / 1_000_000).toFixed(2)} ADA`}
          message="⚠️ POC Version"
          showIcon
          type="warning"
        />
      ) : null}

      {nitroWallet?.walletInfo && nitroBalance < MIN_REQUIRED_ADA ? (
        <Alert
          description={`Your Nitro wallet balance is insufficient. Minimum required: 1200 ADA. Current: ${(Number(nitroBalance) / 1_000_000).toFixed(2)} ADA`}
          message="Insufficient Balance"
          showIcon
          type="error"
        />
      ) : null}

      <Alert
        description={`In Testnet-Preview, Liqwid has not supported price Oracle yet. Therefore, the POC Liquidation Scenario is auto-trigger when SHORT Token price go up 10%.
          For example, if you open SHORT tMIN at price 0.22 ADA/MIN, the Liquidation will be triggered when price reach 0.242 ADA/MIN.`}
        message="⚠️ Liquidation Scenario"
        showIcon
        type="error"
      />

      {/* Mode Selection */}
      <Row gutter={16}>
        <Col span={6}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Margin Mode</div>
          <Button block disabled type={"primary"}>
            Isolated
          </Button>
        </Col>
        <Col span={6}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Leverage</div>
          <Radio.Group onChange={() => {}} style={{ width: "100%" }} value={0.5}>
            <Radio disabled={true} value={1}>
              1.00x
            </Radio>
            <Radio value={0.5}>0.50x</Radio>
          </Radio.Group>
        </Col>
        <Col span={6}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Borrow/Repay</div>
          <Radio.Group onChange={() => {}} style={{ width: "100%" }} value={"auto"}>
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
              precision={6}
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
                onChange={() => {}}
                placeholder="0.00"
                step={0.01}
                style={{ width: "100%" }}
                value={Number(Number(AMOUNT_IN_L) / 1e6)}
              />
            </Form.Item>
          </Col>
          <Col span={2} style={{ display: "flex", alignItems: "flex-end" }}>
            <ArrowRightOutlined style={{ fontSize: 18 }} />
          </Col>
          <Col span={10}>
            <Form.Item label="Amount (tMIN)" style={{ marginBottom: 0 }}>
              <InputNumber
                disabled={true}
                min={0}
                onChange={() => {}}
                placeholder="0.00"
                step={0.01}
                style={{ width: "100%" }}
                value={Number(Utils.formatAmount(minAmountL))}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Divider />

      {/* Trading Info */}
      <Row gutter={16}>
        <Col span={8}>
          <Card style={{ background: "#f0f5ff" }}>
            <Statistic
              suffix="ADA"
              title={
                <Tooltip title="Total Supply Ada to Liqwid Platform">
                  Total Supply Ada <InfoCircleOutlined />
                </Tooltip>
              }
              value={Number(Utils.formatAmount(supplyAdaAmountL))}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ background: "#fff7e6" }}>
            <Statistic
              suffix="tMIN"
              title={
                <Tooltip title="Total Borrow tMIN from Liqwid Platform">
                  Total Borrow <InfoCircleOutlined />
                </Tooltip>
              }
              value={Number(Utils.formatAmount(minAmountL))}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ background: "#fff0feff" }}>
            <Statistic
              precision={6}
              suffix="ADA"
              title={
                <Tooltip title="Liquidation price for your position">
                  Liq.Price <InfoCircleOutlined />
                </Tooltip>
              }
              value={liquidationPrice}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
      </Row>

      <Button
        block
        disabled={!nitroWallet || positions.length > 0 || nitroBalance < MIN_REQUIRED_ADA}
        onClick={handleShort}
        size="large"
        type="primary"
      >
        {positions.length > 0
          ? "Close existing position first"
          : nitroBalance < MIN_REQUIRED_ADA
            ? "Insufficient balance"
            : "Open Short Position"}
      </Button>
    </Space>
  );
};
