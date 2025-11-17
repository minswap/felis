"use client";

import { CloseOutlined, DollarOutlined, SwapOutlined, TrophyOutlined } from "@ant-design/icons";
import invariant from "@minswap/tiny-invariant";
import { Address, Asset } from "@repo/ledger-core";
import { DexV2Calculation, OrderV2Direction } from "@repo/minswap-dex-v2";
import { LendingMarket, LiqwidProvider } from "@repo/minswap-lending-market";
import { Alert, App, Button, Card, Col, Divider, Progress, Row, Space, Statistic, Tag } from "antd";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import {
  minAdaPriceAtom,
  nitroWalletAtom,
  type ShortPositionState,
  ShortPositionStatus,
  ShortPositionStatus as ShortPositionStatusEnum,
  setShortPositionAtom,
  shortPositionAtom,
} from "../atoms/walletAtom";
import { CONFIG } from "../config";
import {
  ExtraStatus,
  shortHandleStep1,
  shortHandleStep2,
  shortHandleStep3,
  shortHandleStep4,
  shortHandleStep5,
  shortHandleStep6,
  usePosition,
} from "../lib/use-position";
import { Utils } from "../lib/utils";

const getStatusColor = (status: ShortPositionStatus) => {
  switch (status) {
    case ShortPositionStatusEnum.STEP_1_SUPPLY_TOKEN:
      return "processing";
    case ShortPositionStatus.STEP_2_BORROW_TOKEN:
      return "purple";
    case ShortPositionStatus.STEP_3_SHORT_TOKEN:
      return "magenta";
    case ShortPositionStatusEnum.OPENING_POSITION:
      return "success";
    case ShortPositionStatusEnum.STEP_4_BUY_BACK_TOKEN:
      return "orange";
    case ShortPositionStatusEnum.STEP_5_REPAY_ASSET:
      return "geekblue";
    case ShortPositionStatusEnum.STEP_6_WITHDRAW_COLLATERAL:
      return "cyan";
    case ShortPositionStatusEnum.CLOSED_POSITION:
      return "red";
    default:
      return "default";
  }
};

const getStatusText = (status: ShortPositionStatus) => {
  switch (status) {
    case ShortPositionStatusEnum.STEP_1_SUPPLY_TOKEN:
      return "Supplying Token";
    case ShortPositionStatusEnum.STEP_2_BORROW_TOKEN:
      return "Borrowing Token";
    case ShortPositionStatusEnum.STEP_3_SHORT_TOKEN:
      return "Short Token";
    case ShortPositionStatusEnum.STEP_4_BUY_BACK_TOKEN:
      return "Buying Back Token";
    case ShortPositionStatusEnum.STEP_5_REPAY_ASSET:
      return "Repaying Asset";
    case ShortPositionStatusEnum.STEP_6_WITHDRAW_COLLATERAL:
      return "Withdrawing Collateral";
    default:
      return status.replace(/_/g, " ");
  }
};

const getProgressPercent = (_position: ShortPositionState) => {
  if (_position.amount.mShortedL < 0n) {
    return 50;
  }
  return 100;
};

const calculatePnlA = (options: {
  mClosedAda: bigint;
  minAdaPrice: LendingMarket.PriceInAdaResponse | null;
  shortReceivedL: bigint;
  totalRepay: bigint;
  supplyEarned: number;
}): number => {
  const { mClosedAda, minAdaPrice, shortReceivedL, totalRepay, supplyEarned } = options;
  if (mClosedAda > 0n) {
    const pnlA = (Number(shortReceivedL) - Number(mClosedAda)) / 1e6 + supplyEarned;
    return pnlA;
  }
  if (!minAdaPrice) {
    return 0;
  }
  const result = DexV2Calculation.calculateSwapExactOut({
    datumReserves: [BigInt(minAdaPrice.datumReserves[0]), BigInt(minAdaPrice.datumReserves[1])],
    valueReserves: [BigInt(minAdaPrice.valueReserves[0]), BigInt(minAdaPrice.valueReserves[1])],
    tradingFee: {
      feeANumerator: BigInt(minAdaPrice.tradingFee.feeANumerator),
      feeBNumerator: BigInt(minAdaPrice.tradingFee.feeBNumerator),
    },
    expectedReceive: totalRepay,
    direction: OrderV2Direction.A_TO_B,
    feeSharingNumerator: minAdaPrice.feeSharingNumerator ? BigInt(minAdaPrice.feeSharingNumerator) : null,
  });
  if (result.type === "err") {
    return 0;
  }
  const buyBackL = result.value.necessaryAmountIn;
  const pnlL = Number(shortReceivedL) - Number(buyBackL);
  const pnlA = pnlL / 1e6 + supplyEarned;
  return pnlA;
};

// MARK: Short Position Tab
export const ShortPositionTab = () => {
  const { message } = App.useApp();
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const positions = useAtomValue(shortPositionAtom);
  const setShortPositions = useSetAtom(setShortPositionAtom);
  const positionHandler = usePosition();
  const [supplyApy, setSupplyApy] = useState<number>(0);
  const [borrowApy, setBorrowApy] = useState<number>(0);
  const [borrowInterest, setBorrowInterest] = useState<number>(0);
  const [supplyInterest, setSupplyInterest] = useState<number>(0);
  // const [liquidationCall, setLiquidationCall] = useState<boolean>(false);

  const minAdaPrice = useAtomValue(minAdaPriceAtom);

  useEffect(() => {
    const getSupplyApy = async (paymentKey: string) => {
      const result = await LiqwidProvider.getNetApy({
        input: {
          paymentKeys: [paymentKey],
          supplies: [
            {
              marketId: "Ada",
              amount: 1000,
            },
          ],
          currency: "USD",
        },
        networkEnv: CONFIG.networkEnv,
      });
      if (result.type === "err") {
        return 0;
      } else {
        return Math.floor(result.value.supplyApy * 100 * 100) / 100;
      }
    };
    if (nitroWallet) {
      const pkh = nitroWallet.walletInfo.address.toPubKeyHash()?.keyHash.hex;
      if (pkh) {
        getSupplyApy(pkh).then((apy) => setSupplyApy(Number(apy)));
      }
    }
  }, [nitroWallet]);

  // polling data
  useEffect(() => {
    if (!nitroWallet) {
      return;
    }
    const paymentKey = nitroWallet?.walletInfo.address.toPubKeyHash()?.keyHash.hex;
    if (!paymentKey) {
      return;
    }
    const fetchData = async () => {
      const loansData = await LiqwidProvider.getLoansBorrow({
        input: {
          paymentKeys: [paymentKey],
        },
        networkEnv: CONFIG.networkEnv,
      });
      if (loansData.type === "ok") {
        const loan = loansData.value[loansData.value.length - 1];
        if (loan) {
          setBorrowApy(loan.APY * 100);
          setBorrowInterest(loan.interest);
        }
      }

      const supplyEarned = await LiqwidProvider.getYieldEarned({
        input: { addresses: [nitroWallet.walletInfo.address.bech32] },
        networkEnv: CONFIG.networkEnv,
      });
      if (supplyEarned.type === "ok") {
        for (const market of supplyEarned.value.markets) {
          if (market.id === "Ada") {
            setSupplyInterest(market.amount);
          }
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [nitroWallet]);

  useEffect(() => {
    console.log("go here", {
      date: new Date().toString(),
      status: positions[0]?.status,
      hasCallback: positions[0]?.hasCallback,
    });
    for (const position of positions) {
      if (position.status === ShortPositionStatusEnum.STEP_1_SUPPLY_TOKEN) {
        positionHandler.handlePosition({
          position,
          errorMessage: "Failed to supply asset",
          successMessage: "Successfully Supplied asset for position",
          positionType: "short",
          innerFn: async (input) => {
            if (input.position.hasCallback && input.position.hasCallback >= 10) {
              const transactions = [...input.position.transactions];
              transactions.pop();
              return {
                ...input.position,
                amount: {
                  ...position.amount,
                  mSuppliedL: 0n,
                },
                transactions,
                status: ShortPositionStatusEnum.STEP_1_SUPPLY_TOKEN,
                hasCallback: undefined,
                callbackExtra: undefined,
              } as ShortPositionState;
            }
            return shortHandleStep1({
              ...input,
              extra: {
                extraStatus: ExtraStatus.EXTRA_SHORT_STEP_1,
                marketId: "Ada",
                amount: position.amount.iTotalSupplyL,
              },
            });
          },
        });
      } else if (position.status === ShortPositionStatusEnum.STEP_2_BORROW_TOKEN) {
        positionHandler.handlePosition({
          position,
          errorMessage: "Failed to borrow asset",
          successMessage: "Successfully borrowed asset for position",
          positionType: "short",
          innerFn: async (input) => {
            if (input.position.hasCallback && input.position.hasCallback >= 10) {
              const transactions = [...input.position.transactions];
              transactions.pop();
              return {
                ...input.position,
                amount: {
                  ...position.amount,
                  mBorrowedL: 0n,
                },
                transactions,
                status: ShortPositionStatusEnum.STEP_2_BORROW_TOKEN,
                hasCallback: undefined,
                callbackExtra: undefined,
              } as ShortPositionState;
            }
            return shortHandleStep2({
              ...input,
              extra: {
                extraStatus: ExtraStatus.EXTRA_SHORT_STEP_2,
                borrowAmountL: Number(position.amount.iBorrowAmountL),
                collateralMode: {
                  mode: LendingMarket.CollateralMode.ISOLATED_MARGIN,
                  borrowMarketId: "MIN",
                  supplyMarketId: "Ada",
                },
                borrowMarketId: "MIN",
              },
            });
          },
        });
      } else if (position.status === ShortPositionStatusEnum.STEP_3_SHORT_TOKEN) {
        positionHandler.handlePosition({
          position,
          errorMessage: "Failed to short asset",
          successMessage: "Successfully shorted asset for position",
          positionType: "short",
          innerFn: async (input) => {
            const priceData = await LendingMarket.fetchAdaMinPrice(CONFIG.networkEnv);
            return shortHandleStep3({
              ...input,
              extra: {
                extraStatus: ExtraStatus.EXTRA_SHORT_STEP_3,
                priceInAdaResponse: priceData,
                amountIn: position.amount.mBorrowedL,
              },
            });
          },
        });
      } else if (position.status === ShortPositionStatusEnum.STEP_4_BUY_BACK_TOKEN) {
        positionHandler.handlePosition({
          position,
          errorMessage: "Failed to buy back asset",
          successMessage: "Successfully bought back asset for position",
          positionType: "short",
          innerFn: async (input) => {
            const priceData = await LendingMarket.fetchAdaMinPrice(CONFIG.networkEnv);
            let loanTxHash: string | null = null;
            for (const { txHash, step } of position.transactions) {
              if (step === ShortPositionStatusEnum.STEP_2_BORROW_TOKEN) {
                loanTxHash = txHash;
              }
            }
            invariant(loanTxHash, "Loan transaction hash not found");
            const totalRepay = await LendingMarket.calculateRepayAllAmountL({
              networkEnv: CONFIG.networkEnv,
              address: Address.fromBech32(position.nitroWalletAddress),
              loanTxHash,
            });
            return shortHandleStep4({
              ...input,
              extra: {
                extraStatus: ExtraStatus.EXTRA_SHORT_STEP_4,
                priceInAdaResponse: priceData,
                expectedReceive: totalRepay + totalRepay / 1000n,
              },
            });
          },
        });
      } else if (position.status === ShortPositionStatusEnum.STEP_5_REPAY_ASSET) {
        positionHandler.handlePosition({
          position,
          errorMessage: "Failed to repay asset",
          successMessage: "Successfully repaid asset for position",
          positionType: "short",
          innerFn: shortHandleStep5,
        });
      } else if (position.status === ShortPositionStatusEnum.STEP_6_WITHDRAW_COLLATERAL) {
        positionHandler.handlePosition({
          position,
          errorMessage: "Failed to withdraw collateral",
          successMessage: "Successfully withdrew collateral for position",
          positionType: "short",
          innerFn: async (input) => {
            return shortHandleStep6({
              ...input,
              extra: {
                extraStatus: ExtraStatus.EXTRA_SHORT_STEP_6,
                supplyMarketId: "Ada",
                qToken: Asset.fromString(LiqwidProvider.mapQAdaToken[CONFIG.networkEnv]),
              },
            });
          },
        });
      }
    }
  }, [positions, positionHandler]); // IMPORTANT: Don't add more

  const handleClosePosition = useCallback(
    (positionId: string, liquidationCall?: boolean) => {
      try {
        setShortPositions((prev) =>
          prev.map((p) =>
            p.positionId === positionId
              ? {
                  ...p,
                  status: ShortPositionStatusEnum.STEP_4_BUY_BACK_TOKEN,
                  updatedAt: Date.now(),
                  liquidationCall: liquidationCall,
                }
              : p,
          ),
        );
        message.success("Position closing initiated");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        message.error(`Failed to close position: ${errorMsg}`);
      }
    },
    [setShortPositions, message],
  );

  // liquidation notice and POC notice
  useEffect(() => {
    const lastPrice = minAdaPrice?.price;
    if (!lastPrice) {
      return;
    }
    for (const position of positions) {
      const liqPrice = position.amount.iLiquidationPrice;
      if (Number(lastPrice) >= liqPrice && position.liquidationCall !== true) {
        handleClosePosition(position.positionId, true);
        message.warning(
          `Position #${position.positionId.slice(
            0,
            8,
          )} has been liquidated as the market price reached the liquidation price of ${liqPrice} ADA/MIN.`,
        );
      }
    }
  }, [minAdaPrice, positions, handleClosePosition, message]);

  if (positions.length === 0) {
    return (
      <Alert
        description="Open a short position from the Trade tab to see it here."
        message="No active positions"
        showIcon
        style={{ margin: "16px" }}
        type="info"
      />
    );
  }

  const isPositionInProgress = positions.some(
    (p) =>
      [ShortPositionStatusEnum.OPENING_POSITION, ShortPositionStatusEnum.CLOSED_POSITION].includes(p.status) === false,
  );

  // const adhoc = (positionId: string) => {
  //   setShortPositions((prev) =>
  //     prev.map((p) =>
  //       p.positionId === positionId
  //         ? {
  //             ...p,
  //             status: ShortPositionStatusEnum.STEP_6_WITHDRAW_COLLATERAL,
  //             hasCallback: 0,
  //             callbackExtra: undefined,
  //           }
  //         : p,
  //     ),
  //   );
  // };

  return (
    <div style={{ padding: "16px" }}>
      <Space direction="vertical" size="large" style={{ width: "100%", marginBottom: "24px" }}>
        {isPositionInProgress && (
          <Alert
            description="The short position is currently processing. Please keep the tab open and should refresh the page if error happened until the position reaches completion or CLOSED status."
            message="⚠️ Position in Progress"
            showIcon
            type="warning"
          />
        )}
        <Alert
          description="This is a POC (Proof of Concept) version. Some fields are hardcoded or may display incorrect numbers. All issues will be fixed in Milestone 3."
          message="⚠️ POC Version - Limited Accuracy"
          showIcon
          type="warning"
        />
        <Alert
          description={`In Testnet-Preview, Liqwid has not supported price Oracle yet. Therefore, the POC Liquidation Scenario is auto-trigger when SHORT Token price go up 10%.
          For example, if you open SHORT tMIN at price 0.22 ADA/MIN, the Liquidation will be triggered when price reach 0.242 ADA/MIN.`}
          message="⚠️ Liquidation Scenario"
          showIcon
          type="error"
        />
      </Space>

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {positions.map((position) => {
          let pnlA = 0;
          if (
            [
              ShortPositionStatusEnum.STEP_1_SUPPLY_TOKEN,
              ShortPositionStatus.STEP_2_BORROW_TOKEN,
              ShortPositionStatusEnum.STEP_3_SHORT_TOKEN,
            ].includes(position.status)
          ) {
            pnlA = 0;
          } else {
            pnlA = calculatePnlA({
              minAdaPrice: minAdaPrice,
              shortReceivedL: position.amount.mShortedEstimateAda ?? 470_000_000n,
              totalRepay: position.amount.mBorrowedL + BigInt(Math.floor(borrowInterest * 1e6)),
              supplyEarned: supplyInterest,
              mClosedAda: position.amount.mClosedAda ?? 0n,
            });
          }
          const isPositionComplete = position.status === ShortPositionStatusEnum.OPENING_POSITION;

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
              {/* <Button onClick={() => adhoc(position.positionId)}/> */}
              {position.liquidationCall && (
                <Alert
                  description="Your position is being liquidated. The system is automatically closing your position."
                  message="🔴 Position Liquidating"
                  showIcon
                  style={{ marginBottom: 16 }}
                  type="error"
                />
              )}
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
                    value={`${0.7}x`}
                    valueStyle={{ color: "#1890ff", fontWeight: "bold" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    prefix={<SwapOutlined />}
                    title="Short Asset"
                    value={position.shortAsset.tokenName.toString()}
                  />
                </Col>
                <Col span={6}>
                  <Statistic title="Supply Asset" value={"ADA"} />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    prefix={pnlA >= 0 ? "+" : ""}
                    suffix="ADA"
                    title="P&L"
                    value={pnlA}
                    valueStyle={{
                      color: pnlA >= 0 ? "#3f8600" : "#cf1322",
                      fontWeight: "bold",
                    }}
                  />
                </Col>
              </Row>
              <Divider />
              {/* supply */}
              <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="ADA"
                    title="Total Supply"
                    value={Utils.formatAmount(position.amount.iTotalSupplyL)}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="ADA"
                    title="Current Supply"
                    value={Utils.formatAmount(position.amount.mSuppliedL ?? 0n)}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="%"
                    title="Supply APY"
                    value={supplyApy}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="ADA"
                    title="Supply Earned"
                    value={supplyInterest}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
              </Row>
              {/* Borrow */}
              <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="tMIN"
                    title="Total tMIN Short"
                    value={Utils.formatAmount(position.amount.mShortedL ?? 0n)}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="tMIN"
                    title="Total tMIN Borrowed"
                    value={Utils.formatAmount(position.amount.mBorrowedL ?? 0n)}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="%"
                    title="Borrow APY"
                    value={borrowApy}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={2}
                    suffix="tMIN"
                    title="Borrow Interest"
                    value={borrowInterest}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
              </Row>
              {/* Price */}
              <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={6}>
                  <Statistic
                    precision={3}
                    suffix="ADA/MIN"
                    title="Trading Price"
                    value={Number(position.amount.mTradingPrice) ?? 0}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    loading={minAdaPrice === null}
                    precision={3}
                    suffix="ADA/MIN"
                    title="Current Market Price"
                    value={Number(minAdaPrice?.price) ?? 0}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={3}
                    suffix="ADA/MIN"
                    title="Liquidation Price"
                    value={(Number(position.amount.mTradingPrice) ?? 0) * 1.1}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    precision={3}
                    suffix="ADA/MIN"
                    title="Closed Price"
                    value={Number(position.amount.mClosedPrice) ?? 0}
                    valueStyle={{ fontSize: "14px" }}
                  />
                </Col>
              </Row>
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
