"use client";

import { useState, useEffect } from "react";
import {
  Card,
  Button,
  Space,
  Row,
  Col,
  InputNumber,
  Slider,
  Statistic,
  Tabs,
  Divider,
  Alert,
  Badge,
  App,
  Radio,
  Tooltip,
  Form,
} from "antd";
import {
  ArrowRightOutlined,
  InfoCircleOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import type { WalletInfo } from "../lib/wallet-utils";
import { Utils } from "../lib/utils";

interface MarginTradingProps {
  nitroWallet: {
    walletInfo: (WalletInfo & { rootAddress: string }) | null;
    isConnected: boolean;
  };
}

interface Position {
  minAmount: bigint;
  adaDebt: bigint;
  adaPosition: bigint;
  liquidationPrice: number;
  pnl: bigint; // PNL in ADA
}

export const MarginTrading = ({ nitroWallet }: MarginTradingProps) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  // Trading parameters
  const [leverage, setLeverage] = useState<1 | 2>(2);
  const [orderType, setOrderType] = useState<"market">("market");
  const [tradeMode, setTradeMode] = useState<"buy">("buy");
  const [marginMode, setMarginMode] = useState<"isolated">("isolated");
  const [autoBorrowRepay, setAutoBorrowRepay] = useState(true);

  // Input values
  const [minAmount, setMinAmount] = useState<number>(0);
  const [adaTotal, setAdaTotal] = useState<number>(0);
  const [minPrice, setMinPrice] = useState<number>(0);
  const [sliderValue, setSliderValue] = useState<number>(0);

  // Loading states
  const [loading, setLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);

  // Position state
  const [position, setPosition] = useState<Position | null>(null);
  const [hasOpenPosition, setHasOpenPosition] = useState(false);

  const nitroBalance = nitroWallet.walletInfo?.balance ?? 0n;
  const availableAda = Number(nitroBalance) / 1_000_000;

  // Fetch MIN price
  useEffect(() => {
    const fetchMinPrice = async () => {
      setPriceLoading(true);
      try {
        // TODO: Implement LendingMarket.fetchAdaMinPrice
        // For now, using placeholder price
        setMinPrice(0.5); // 1 MIN = 0.5 ADA (placeholder)
        message.info("MIN price fetched: 0.5 ADA per MIN");
      } catch (err) {
        message.error("Failed to fetch MIN price");
      } finally {
        setPriceLoading(false);
      }
    };

    if (nitroWallet.isConnected) {
      fetchMinPrice();
    }
  }, [nitroWallet.isConnected, message]);

  // Calculate max ADA for leverage trading
  const maxAdaForLeverage = availableAda * leverage;

  // Handle amount change (MIN)
  const handleAmountChange = (value: number | null) => {
    if (value === null) return;
    setMinAmount(value);

    // Calculate corresponding ADA total
    const totalAda = value * minPrice;
    setAdaTotal(totalAda);

    // Update slider
    const percentage = (totalAda / maxAdaForLeverage) * 100;
    setSliderValue(Math.min(percentage, 100));
  };

  // Handle total change (ADA)
  const handleTotalChange = (value: number | null) => {
    if (value === null) return;
    setAdaTotal(value);

    // Calculate corresponding MIN amount
    const amount = minPrice > 0 ? value / minPrice : 0;
    setMinAmount(amount);

    // Update slider
    const percentage = (value / maxAdaForLeverage) * 100;
    setSliderValue(Math.min(percentage, 100));
  };

  // Handle slider change
  const handleSliderChange = (value: number) => {
    setSliderValue(value);

    // Calculate ADA total from slider
    const totalAda = (value / 100) * maxAdaForLeverage;
    setAdaTotal(totalAda);

    // Calculate MIN amount
    const amount = minPrice > 0 ? totalAda / minPrice : 0;
    setMinAmount(amount);
  };

  // Calculate borrow amount
  const borrowAmount = adaTotal - availableAda;
  const shouldBorrow = borrowAmount > 0;

  // Calculate liquidation price (placeholder)
  const calculateLiquidationPrice = (): number => {
    if (adaDebt <= 0) return 0;
    // Simplified calculation: liq price = debt / position size
    return adaDebt / minAmount;
  };

  const adaDebt = shouldBorrow ? borrowAmount : 0;
  const liquidationPrice = calculateLiquidationPrice();

  // Handle buy
  const handleBuy = async () => {
    if (!nitroWallet.isConnected || !nitroWallet.walletInfo) {
      message.error("Wallet not connected");
      return;
    }

    if (minAmount <= 0) {
      message.error("Please enter amount");
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement actual trading logic
      // 1. Create Order to Minswap Dex V2 to buy ADA=>MIN
      // 2. Supply MIN to Liqwid Platform to get qMIN Token
      // 3. Borrow ADA from Liqwid
      // 4. Use ADA borrowed to buy more MIN to adapt margin amount (if need)

      message.info("Opening position - Transaction building in progress");
      console.log({
        leverage,
        minAmount,
        adaTotal,
        adaDebt,
        shouldBorrow,
        liquidationPrice,
      });

      // Placeholder: Simulate position opened
      const newPosition: Position = {
        minAmount: BigInt(Math.floor(minAmount * 1_000_000)),
        adaDebt: BigInt(Math.floor(adaDebt * 1_000_000)),
        adaPosition: BigInt(Math.floor(availableAda * 1_000_000)),
        liquidationPrice,
        pnl: 0n,
      };
      setPosition(newPosition);
      setHasOpenPosition(true);
      message.success("Position opened successfully!");

      // Reset form
      setMinAmount(0);
      setAdaTotal(0);
      setSliderValue(0);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`Failed to open position: ${errorMsg}`);
      console.error("Buy error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Handle close position
  const handleClosePosition = async () => {
    if (!position) {
      message.error("No position to close");
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement close position logic
      // 1. Sell all MIN
      // 2. Repay all borrowed ADA
      // 3. Withdraw all qMIN tokens to MIN
      // 4. Sell all MIN to ADA

      message.info("Closing position - Transaction building in progress");
      console.log("Closing position:", position);

      setPosition(null);
      setHasOpenPosition(false);
      message.success("Position closed successfully!");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`Failed to close position: ${errorMsg}`);
      console.error("Close error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="Isolated Margin Long $MIN"
      style={{ marginTop: 16 }}
      extra={
        <Badge
          count={hasOpenPosition ? 1 : 0}
          style={{ backgroundColor: "#ff4d4f" }}
        />
      }
    >
      {!nitroWallet.isConnected && (
        <Alert
          message="Please connect Nitro Wallet to trade"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Tabs
        items={[
          {
            key: "trade",
            label: "Trade",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size="large">
                {/* Mode Selection */}
                <Row gutter={16}>
                  <Col span={6}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>
                      Margin Mode
                    </div>
                    <Button
                      type={marginMode === "isolated" ? "primary" : "default"}
                      block
                      disabled
                    >
                      Isolated
                    </Button>
                  </Col>
                  <Col span={6}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>
                      Leverage
                    </div>
                    <Radio.Group
                      value={leverage}
                      onChange={(e) => setLeverage(e.target.value)}
                      style={{ width: "100%" }}
                    >
                      <Radio value={1}>1.00x</Radio>
                      <Radio value={2}>2.00x</Radio>
                    </Radio.Group>
                  </Col>
                  <Col span={6}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>
                      Borrow/Repay
                    </div>
                    <Radio.Group
                      value={autoBorrowRepay ? "auto" : "manual"}
                      onChange={(e) => setAutoBorrowRepay(e.target.value === "auto")}
                      style={{ width: "100%" }}
                    >
                      <Radio value="auto">Auto</Radio>
                      <Radio value="manual">Manual</Radio>
                    </Radio.Group>
                  </Col>
                  <Col span={6}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>
                      Order Type
                    </div>
                    <Button type="default" block disabled>
                      Market
                    </Button>
                  </Col>
                </Row>

                <Divider />

                {/* Trade Mode */}
                <Row gutter={16}>
                  <Col span={12}>
                    <Button
                      type={tradeMode === "buy" ? "primary" : "default"}
                      block
                      size="large"
                      disabled
                    >
                      BUY
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button type="default" block size="large" disabled>
                      SELL
                    </Button>
                  </Col>
                </Row>

                <Divider />

                {/* Market Price Info */}
                <Card style={{ background: "#fafafa" }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Statistic
                        title="Market Price"
                        value={minPrice}
                        suffix="ADA/MIN"
                        loading={priceLoading}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="Your Available"
                        value={availableAda.toFixed(2)}
                        suffix="ADA"
                      />
                    </Col>
                  </Row>
                </Card>

                <Divider />

                {/* Amount Inputs */}
                <Form layout="vertical">
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label="Amount (MIN)" style={{ marginBottom: 0 }}>
                        <InputNumber
                          value={minAmount}
                          onChange={handleAmountChange}
                          placeholder="0.00"
                          style={{ width: "100%" }}
                          min={0}
                          step={0.01}
                          disabled={!nitroWallet.isConnected || hasOpenPosition}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={2} style={{ display: "flex", alignItems: "flex-end" }}>
                      <ArrowRightOutlined style={{ fontSize: 18 }} />
                    </Col>
                    <Col span={10}>
                      <Form.Item label="Total (ADA)" style={{ marginBottom: 0 }}>
                        <InputNumber
                          value={adaTotal}
                          onChange={handleTotalChange}
                          placeholder="0.00"
                          style={{ width: "100%" }}
                          min={0}
                          step={0.01}
                          disabled={!nitroWallet.isConnected || hasOpenPosition}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>

                {/* Slider */}
                <div>
                  <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                    <span>Margin Slider</span>
                    <span style={{ color: "#666" }}>
                      {sliderValue.toFixed(0)}%
                    </span>
                  </div>
                  <Slider
                    value={sliderValue}
                    onChange={handleSliderChange}
                    max={100}
                    disabled={!nitroWallet.isConnected || hasOpenPosition}
                    marks={{ 0: "0%", 50: "50%", 100: "100%" }}
                  />
                </div>

                <Divider />

                {/* Trading Info */}
                <Row gutter={16}>
                  <Col span={8}>
                    <Card style={{ background: "#f0f5ff" }}>
                      <Statistic
                        title={
                          <Tooltip title="Available ADA in your Nitro Wallet">
                            Avbl <InfoCircleOutlined />
                          </Tooltip>
                        }
                        value={availableAda.toFixed(2)}
                        suffix="ADA"
                        valueStyle={{ fontSize: 14 }}
                      />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card style={{ background: "#f0f5ff" }}>
                      <Statistic
                        title={
                          <Tooltip title="Maximum ADA you can use with leverage">
                            Max <InfoCircleOutlined />
                          </Tooltip>
                        }
                        value={maxAdaForLeverage.toFixed(2)}
                        suffix="ADA"
                        valueStyle={{ fontSize: 14 }}
                      />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card style={{ background: "#f0f5ff" }}>
                      <Statistic
                        title={
                          <Tooltip title="Liquidation price for your position">
                            Liq.Price <InfoCircleOutlined />
                          </Tooltip>
                        }
                        value={liquidationPrice.toFixed(4)}
                        suffix="ADA"
                        valueStyle={{ fontSize: 14 }}
                      />
                    </Card>
                  </Col>
                </Row>

                {/* Borrow/Repay Info */}
                {shouldBorrow && (
                  <>
                    <Alert
                      message={`You will borrow ${borrowAmount.toFixed(2)} ADA to complete this trade`}
                      type="info"
                      showIcon
                    />
                    <Row gutter={16}>
                      <Col span={12}>
                        <Card style={{ background: "#fff7e6" }}>
                          <Statistic
                            title={
                              <Tooltip title="Amount automatically borrowed when placing order">
                                Borrow <InfoCircleOutlined />
                              </Tooltip>
                            }
                            value={borrowAmount.toFixed(2)}
                            suffix="ADA"
                            valueStyle={{ fontSize: 14 }}
                          />
                        </Card>
                      </Col>
                      <Col span={12}>
                        <Card style={{ background: "#f6ffed" }}>
                          <Statistic
                            title={
                              <Tooltip title="Amount automatically repaid after transaction. Fees may alter final amount.">
                                Repay <InfoCircleOutlined />
                              </Tooltip>
                            }
                            value={borrowAmount.toFixed(2)}
                            suffix="ADA"
                            valueStyle={{ fontSize: 14 }}
                          />
                        </Card>
                      </Col>
                    </Row>
                  </>
                )}

                {/* Buy Button */}
                <Button
                  type="primary"
                  size="large"
                  block
                  onClick={handleBuy}
                  loading={loading}
                  disabled={!nitroWallet.isConnected || hasOpenPosition || minAmount <= 0}
                >
                  {loading ? "Opening Position..." : "Open Long Position"}
                </Button>
              </Space>
            ),
          },
          {
            key: "position",
            label: `Position${hasOpenPosition ? " (Active)" : ""}`,
            children: hasOpenPosition && position ? (
              <Space direction="vertical" style={{ width: "100%" }} size="large">
                <Alert
                  message="Active Position"
                  type="success"
                  showIcon
                />

                <Row gutter={16}>
                  <Col span={12}>
                    <Card>
                      <Statistic
                        title="PNL (ADA)"
                        value={Number(position.pnl) / 1_000_000}
                        precision={2}
                        suffix="ADA"
                        valueStyle={{
                          color: Number(position.pnl) >= 0 ? "#52c41a" : "#ff4d4f",
                        }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card>
                      <Statistic
                        title="MIN Position"
                        value={Number(position.minAmount) / 1_000_000}
                        precision={2}
                        suffix="MIN"
                      />
                    </Card>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={12}>
                    <Card>
                      <Statistic
                        title="ADA Debt"
                        value={Number(position.adaDebt) / 1_000_000}
                        precision={2}
                        suffix="ADA"
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card>
                      <Statistic
                        title="ADA Position"
                        value={Number(position.adaPosition) / 1_000_000}
                        precision={2}
                        suffix="ADA"
                      />
                    </Card>
                  </Col>
                </Row>

                <Card style={{ background: "#fff7e6" }}>
                  <Statistic
                    title="Liquidation Price"
                    value={position.liquidationPrice}
                    precision={4}
                    suffix="ADA/MIN"
                  />
                </Card>

                <Button
                  type="primary"
                  danger
                  size="large"
                  block
                  icon={<CloseOutlined />}
                  onClick={handleClosePosition}
                  loading={loading}
                >
                  {loading ? "Closing Position..." : "Close Position"}
                </Button>
              </Space>
            ) : (
              <Alert
                message="No active position"
                type="info"
                showIcon
              />
            ),
          },
        ]}
      />
    </Card>
  );
};
