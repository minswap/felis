import {
  ADA,
  Address,
  Asset,
  Bytes,
  DatumSource,
  NetworkEnvironment,
  TxOut,
  Value,
} from "@repo/ledger-core";
import { TxBuilder } from "@repo/tx-builder";
import {
  BATCHER_FEE_DEX_V2,
  buildDexV2OrderAddress,
  DexVersion,
  getDefaultDexV2OrderAddress,
  OrderV2AmountType,
  OrderV2AuthorizationMethodType,
  OrderV2Datum,
  OrderV2Direction,
  OrderV2ExpirySetting,
  OrderV2ExtraDatum,
  OrderV2Killable,
  OrderV2Step,
  OrderV2StepType,
  OrderV2SwapRouting,
  OUTPUT_ADA,
} from "@repo/minswap-dex-v2";
import invariant from "@minswap/tiny-invariant";
import { Maybe } from "@repo/ledger-utils";
import { MetadataMessage } from "./metadata";

export namespace DEXOrderTransaction {
  // TODO
  export type V1OrderOptions = {
    version: DexVersion.DEX_V1;
  };

  // TODO
  export type StableswapOrderOptions = {
    version: DexVersion.STABLESWAP;
  };

  export type V2DepositOptions = {
    type: OrderV2StepType.DEPOSIT;
    assetA: Asset;
    assetB: Asset;
    amountA: bigint;
    amountB: bigint;
    minimumLPReceived: bigint;
    killOnFailed: boolean;
  };

  export type V2WithdrawOptions = {
    type: OrderV2StepType.WITHDRAW;
    lpAmount: bigint;
    minimumAssetAReceived: bigint;
    minimumAssetBReceived: bigint;
    killOnFailed: boolean;
  };

  export type V2SwapExactInOptions = {
    type: OrderV2StepType.SWAP_EXACT_IN;
    assetIn: Asset;
    amountIn: bigint;
    minimumAmountOut: bigint;
    direction: OrderV2Direction;
    killOnFailed: boolean;
    isLimitOrder: boolean;
    extraFeeOutput?: TxOut;
  };

  export type V2SwapExactOutOptions = {
    type: OrderV2StepType.SWAP_EXACT_OUT;
    assetIn: Asset;
    maximumAmountIn: bigint;
    expectedReceived: bigint;
    direction: OrderV2Direction;
    killOnFailed: boolean;
    extraFeeOutput?: TxOut;
  };

  export type V2StopOptions = {
    type: OrderV2StepType.STOP_LOSS;
    assetIn: Asset;
    amountIn: bigint;
    stopAmount: bigint;
    direction: OrderV2Direction;
  };

  export type V2OCOOptions = {
    type: OrderV2StepType.OCO;
    assetIn: Asset;
    amountIn: bigint;
    limitAmount: bigint;
    stopAmount: bigint;
    direction: OrderV2Direction;
  };

  export type V2ZapOutOptions = {
    type: OrderV2StepType.ZAP_OUT;
    lpAmount: bigint;
    direction: OrderV2Direction;
    minimumReceived: bigint;
    killOnFailed: boolean;
  };

  export type V2PartialSwapOptions = {
    type: OrderV2StepType.PARTIAL_SWAP;
    assetIn: Asset;
    amountIn: bigint;
    direction: OrderV2Direction;
    expectedInOutRatio: [bigint, bigint];
    maximumSwapTime: bigint;
    minimumSwapAmountRequired: bigint;
  };

  export type V2WithdrawImbalanceOptions = {
    type: OrderV2StepType.WITHDRAW_IMBALANCE;
    lpAmount: bigint;
    ratioAssetA: bigint;
    ratioAssetB: bigint;
    minimumAssetA: bigint;
    killOnFailed: boolean;
  };

  export type V2MultiRoutingOptions = {
    type: OrderV2StepType.SWAP_MULTI_ROUTING;
    assetIn: Asset;
    amountIn: bigint;
    routings: OrderV2SwapRouting[];
    minimumReceived: bigint;
    extraFeeOutput?: TxOut;
  };

  export type V2OrderOptions = (
    | V2DepositOptions
    | V2WithdrawOptions
    | V2SwapExactInOptions
    | V2SwapExactOutOptions
    | V2StopOptions
    | V2OCOOptions
    | V2ZapOutOptions
    | V2PartialSwapOptions
    | V2WithdrawImbalanceOptions
    | V2MultiRoutingOptions
  ) & {
    lpAsset: Asset;
    version: DexVersion.DEX_V2;
    expiredOptions?: OrderV2ExpirySetting;
  };

  export type MultiDEXOrderOptions =
    | V1OrderOptions
    | V2OrderOptions
    | StableswapOrderOptions;

  export type BulkOrdersOption = {
    networkEnv: NetworkEnvironment;
    sender: Address;
    orderOptions: MultiDEXOrderOptions[];
    outerTxb?: TxBuilder;
    receiver?: Address;
  };

  export function buildOrderValue(option: MultiDEXOrderOptions): Value {
    switch (option.version) {
      case DexVersion.DEX_V1: {
        throw new Error("Not implemented");
      }
      case DexVersion.STABLESWAP: {
        throw new Error("Not implemented");
      }
      case DexVersion.DEX_V2: {
        switch (option.type) {
          case OrderV2StepType.DEPOSIT: {
            const { assetA, assetB, amountA, amountB, minimumLPReceived } =
              option;
            invariant(
              amountA >= 0n && amountB >= 0n && amountA + amountB > 0n,
              "amount must be positive"
            );
            invariant(
              minimumLPReceived > 0n,
              "minimum LP received must be positive"
            );
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(assetA, amountA)
              .add(assetB, amountB);
            return orderValue;
          }
          case OrderV2StepType.WITHDRAW: {
            const {
              lpAsset,
              lpAmount,
              minimumAssetAReceived,
              minimumAssetBReceived,
            } = option;
            invariant(lpAmount > 0n, "LP amount must be positive");
            invariant(
              minimumAssetAReceived > 0n && minimumAssetBReceived > 0n,
              "minimum asset received must be positive"
            );
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(lpAsset, lpAmount);
            return orderValue;
          }
          case OrderV2StepType.SWAP_EXACT_IN: {
            const { assetIn, amountIn, minimumAmountOut } = option;
            invariant(amountIn > 0n, "amount in must be positive");
            invariant(
              minimumAmountOut > 0n,
              "minimum amount out must be positive"
            );
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(assetIn, amountIn);
            return orderValue;
          }
          case OrderV2StepType.SWAP_EXACT_OUT: {
            const { assetIn, maximumAmountIn, expectedReceived } = option;
            invariant(maximumAmountIn > 0n, "amount in must be positive");
            invariant(
              expectedReceived > 0n,
              "minimum amount out must be positive"
            );
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(assetIn, maximumAmountIn);
            return orderValue;
          }
          case OrderV2StepType.STOP_LOSS: {
            const { assetIn, amountIn, stopAmount } = option;
            invariant(amountIn > 0n, "amount in must be positive");
            invariant(stopAmount > 0n, "stop amount out must be positive");
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(assetIn, amountIn);
            return orderValue;
          }
          case OrderV2StepType.OCO: {
            const { assetIn, amountIn, stopAmount, limitAmount } = option;
            invariant(amountIn > 0n, "amount in must be positive");
            invariant(stopAmount > 0n, "stop amount out must be positive");
            invariant(limitAmount > 0n, "limit amount out must be positive");
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(assetIn, amountIn);
            return orderValue;
          }
          case OrderV2StepType.ZAP_OUT: {
            const { lpAsset, lpAmount, minimumReceived } = option;
            invariant(lpAmount > 0n, "lp amount in must be positive");
            invariant(
              minimumReceived > 0n,
              "minimum amount out must be positive"
            );
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(lpAsset, lpAmount);
            return orderValue;
          }
          case OrderV2StepType.PARTIAL_SWAP: {
            const { assetIn, amountIn, expectedInOutRatio } = option;
            invariant(amountIn > 0n, "amount in must be positive");
            const [expectedInOutRatioNumerator, expectedInOutRatioDenominator] =
              expectedInOutRatio;
            invariant(
              expectedInOutRatioNumerator > 0n &&
                expectedInOutRatioDenominator > 0n,
              "expected input and output ratio must be positive"
            );
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(assetIn, amountIn);
            return orderValue;
          }
          case OrderV2StepType.WITHDRAW_IMBALANCE: {
            const {
              lpAsset,
              lpAmount,
              ratioAssetA,
              ratioAssetB,
              minimumAssetA,
            } = option;
            invariant(lpAmount > 0n, "LP amount must be positive");
            invariant(
              ratioAssetA > 0n && ratioAssetB > 0n && minimumAssetA > 0n,
              "minimum asset and ratio received must be positive"
            );
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(lpAsset, lpAmount);
            return orderValue;
          }
          case OrderV2StepType.SWAP_MULTI_ROUTING: {
            const { assetIn, amountIn } = option;
            invariant(amountIn > 0n, "Amount must be positive");
            const orderValue = new Value()
              .add(ADA, OUTPUT_ADA)
              .add(assetIn, amountIn);
            return orderValue;
          }
          default: {
            throw new Error(`Unexpected Step Type`);
          }
        }
      }
    }
  }

  export function buildV2OrderStep(option: V2OrderOptions): OrderV2Step {
    switch (option.type) {
      case OrderV2StepType.DEPOSIT: {
        const { amountA, amountB, minimumLPReceived, killOnFailed } = option;
        invariant(
          amountA >= 0n && amountB >= 0n && amountA + amountB > 0n,
          "amount must be positive"
        );
        invariant(
          minimumLPReceived > 0n,
          "minimum LP received must be positive"
        );
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.DEPOSIT,
          depositAmountOption: {
            type: OrderV2AmountType.SPECIFIC_AMOUNT,
            depositAmountA: amountA,
            depositAmountB: amountB,
          },
          minimumLP: minimumLPReceived,
          killable: killOnFailed
            ? OrderV2Killable.KILL_ON_FAILED
            : OrderV2Killable.PENDING_ON_FAILED,
        };
        return orderStep;
      }
      case OrderV2StepType.WITHDRAW: {
        const {
          lpAmount,
          minimumAssetAReceived,
          minimumAssetBReceived,
          killOnFailed,
        } = option;
        invariant(lpAmount > 0n, "LP amount must be positive");
        invariant(
          minimumAssetAReceived > 0n && minimumAssetBReceived > 0n,
          "minimum asset received must be positive"
        );
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.WITHDRAW,
          withdrawalAmountOption: {
            type: OrderV2AmountType.SPECIFIC_AMOUNT,
            withdrawalLPAmount: lpAmount,
          },
          minimumAssetA: minimumAssetAReceived,
          minimumAssetB: minimumAssetBReceived,
          killable: killOnFailed
            ? OrderV2Killable.KILL_ON_FAILED
            : OrderV2Killable.PENDING_ON_FAILED,
        };
        return orderStep;
      }
      case OrderV2StepType.SWAP_EXACT_IN: {
        const { amountIn, direction, minimumAmountOut, killOnFailed } = option;
        invariant(amountIn > 0n, "amount in must be positive");
        invariant(minimumAmountOut > 0n, "minimum amount out must be positive");
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.SWAP_EXACT_IN,
          direction: direction,
          swapAmountOption: {
            type: OrderV2AmountType.SPECIFIC_AMOUNT,
            swapAmount: amountIn,
          },
          minimumReceived: minimumAmountOut,
          killable: killOnFailed
            ? OrderV2Killable.KILL_ON_FAILED
            : OrderV2Killable.PENDING_ON_FAILED,
        };
        return orderStep;
      }
      case OrderV2StepType.SWAP_EXACT_OUT: {
        const { maximumAmountIn, expectedReceived, direction, killOnFailed } =
          option;
        invariant(maximumAmountIn > 0n, "amount in must be positive");
        invariant(expectedReceived > 0n, "minimum amount out must be positive");
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.SWAP_EXACT_OUT,
          direction: direction,
          maximumSwapAmountOption: {
            type: OrderV2AmountType.SPECIFIC_AMOUNT,
            swapAmount: maximumAmountIn,
          },
          expectedReceived: expectedReceived,
          killable: killOnFailed
            ? OrderV2Killable.KILL_ON_FAILED
            : OrderV2Killable.PENDING_ON_FAILED,
        };
        return orderStep;
      }
      case OrderV2StepType.STOP_LOSS: {
        const { amountIn, direction, stopAmount } = option;
        invariant(amountIn > 0n, "amount in must be positive");
        invariant(stopAmount > 0n, "stop amount out must be positive");
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.STOP_LOSS,
          direction: direction,
          swapAmountOption: {
            type: OrderV2AmountType.SPECIFIC_AMOUNT,
            swapAmount: amountIn,
          },
          stopLossReceived: stopAmount,
        };
        return orderStep;
      }
      case OrderV2StepType.OCO: {
        const { amountIn, direction, stopAmount, limitAmount } = option;
        invariant(amountIn > 0n, "amount in must be positive");
        invariant(stopAmount > 0n, "stop amount out must be positive");
        invariant(limitAmount > 0n, "limit amount out must be positive");
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.OCO,
          direction: direction,
          swapAmountOption: {
            type: OrderV2AmountType.SPECIFIC_AMOUNT,
            swapAmount: amountIn,
          },
          stopLossReceived: stopAmount,
          minimumReceived: limitAmount,
        };
        return orderStep;
      }
      case OrderV2StepType.ZAP_OUT: {
        const { lpAmount, minimumReceived, direction, killOnFailed } = option;
        invariant(lpAmount > 0n, "lp amount in must be positive");
        invariant(minimumReceived > 0n, "minimum amount out must be positive");
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.ZAP_OUT,
          direction: direction,
          withdrawalAmountOption: {
            type: OrderV2AmountType.SPECIFIC_AMOUNT,
            withdrawalLPAmount: lpAmount,
          },
          minimumReceived: minimumReceived,
          killable: killOnFailed
            ? OrderV2Killable.KILL_ON_FAILED
            : OrderV2Killable.PENDING_ON_FAILED,
        };
        return orderStep;
      }
      case OrderV2StepType.PARTIAL_SWAP: {
        const {
          amountIn,
          direction,
          expectedInOutRatio,
          maximumSwapTime,
          minimumSwapAmountRequired,
        } = option;
        invariant(amountIn > 0n, "amount in must be positive");
        const [expectedInOutRatioNumerator, expectedInOutRatioDenominator] =
          expectedInOutRatio;
        invariant(
          expectedInOutRatioNumerator > 0n &&
            expectedInOutRatioDenominator > 0n,
          "expected input and output ratio must be positive"
        );
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.PARTIAL_SWAP,
          direction: direction,
          totalSwapAmount: amountIn,
          ioRatioNumerator: expectedInOutRatioNumerator,
          ioRatioDenominator: expectedInOutRatioDenominator,
          hops: maximumSwapTime,
          minimumSwapAmountRequired: minimumSwapAmountRequired,
          maxBatcherFeeEachTime:
            BATCHER_FEE_DEX_V2[OrderV2StepType.PARTIAL_SWAP],
        };
        return orderStep;
      }
      case OrderV2StepType.WITHDRAW_IMBALANCE: {
        const {
          lpAmount,
          ratioAssetA,
          ratioAssetB,
          minimumAssetA,
          killOnFailed,
        } = option;
        invariant(lpAmount > 0n, "LP amount must be positive");
        invariant(
          ratioAssetA > 0n && ratioAssetB > 0n && minimumAssetA > 0n,
          "minimum asset and ratio received must be positive"
        );
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.WITHDRAW_IMBALANCE,
          withdrawalAmountOption: {
            type: OrderV2AmountType.SPECIFIC_AMOUNT,
            withdrawalLPAmount: lpAmount,
          },
          ratioAssetA: ratioAssetA,
          ratioAssetB: ratioAssetB,
          minimumAssetA: minimumAssetA,
          killable: killOnFailed
            ? OrderV2Killable.KILL_ON_FAILED
            : OrderV2Killable.PENDING_ON_FAILED,
        };
        return orderStep;
      }
      case OrderV2StepType.SWAP_MULTI_ROUTING: {
        const { amountIn, routings, minimumReceived } = option;
        invariant(amountIn > 0n, "Amount must be positive");
        const orderStep: OrderV2Step = {
          type: OrderV2StepType.SWAP_MULTI_ROUTING,
          routings: routings,
          swapAmountOption: {
            type: OrderV2AmountType.SPECIFIC_AMOUNT,
            swapAmount: amountIn,
          },
          minimumReceived: minimumReceived,
        };
        return orderStep;
      }
    }
  }

    export function getOrderMetadata(option: MultiDEXOrderOptions): string {
    switch (option.version) {
      case DexVersion.DEX_V1: {
        throw new Error("Not implemented");
      }
      case DexVersion.STABLESWAP: {
        throw new Error("Not implemented");
      }
      case DexVersion.DEX_V2: {
        switch (option.type) {
          case OrderV2StepType.SWAP_EXACT_IN: {
            if (option.isLimitOrder) {
              return MetadataMessage.DEX_LIMIT_ORDER;
            } else {
              return MetadataMessage.DEX_MARKET_ORDER;
            }
          }
          case OrderV2StepType.STOP_LOSS: {
            return MetadataMessage.DEX_STOP_ORDER;
          }
          case OrderV2StepType.OCO: {
            return MetadataMessage.DEX_OCO_ORDER;
          }
          case OrderV2StepType.SWAP_EXACT_OUT: {
            return MetadataMessage.DEX_MARKET_ORDER;
          }
          case OrderV2StepType.DEPOSIT: {
            const isZapIn = option.amountA === 0n || option.amountB === 0n;
            if (isZapIn) {
              return MetadataMessage.DEX_ZAP_IN_ORDER;
            } else {
              return MetadataMessage.DEX_DEPOSIT_ORDER;
            }
          }
          case OrderV2StepType.WITHDRAW: {
            return MetadataMessage.DEX_WITHDRAW_ORDER;
          }
          case OrderV2StepType.ZAP_OUT: {
            return MetadataMessage.DEX_ZAP_OUT_ORDER;
          }
          case OrderV2StepType.PARTIAL_SWAP: {
            return MetadataMessage.DEX_PARTIAL_SWAP_ORDER;
          }
          case OrderV2StepType.WITHDRAW_IMBALANCE: {
            return MetadataMessage.DEX_WITHDRAW_ORDER;
          }
          case OrderV2StepType.SWAP_MULTI_ROUTING: {
            return MetadataMessage.DEX_ROUTING_ORDER;
          }
          default: {
            throw new Error("Unexpected Step Type");
          }
        }
      }
    }
  }

  export function createBulkOrdersTx({
    networkEnv,
    sender,
    orderOptions,
    outerTxb,
    receiver,
  }: BulkOrdersOption): TxBuilder {
    const txb = outerTxb ?? new TxBuilder(networkEnv);

    const sumOrdersValue = new Value();
    for (const option of orderOptions) {
      const orderValue = buildOrderValue(option);
      sumOrdersValue.addAll(orderValue);
    }

    const limitOrders: string[] = [];
    const eternlOutputs: TxOut[] = [];
    for (let i = 0; i < orderOptions.length; i++) {
      const option = orderOptions[i];
      const orderValue = buildOrderValue(option);
      switch (option.version) {
        case DexVersion.DEX_V1: {
          throw new Error("Not implemented");
        }
        case DexVersion.STABLESWAP: {
          throw new Error("Not implemented");
        }
        case DexVersion.DEX_V2: {
          if (
            option.type === OrderV2StepType.SWAP_EXACT_IN &&
            option.isLimitOrder
          ) {
            limitOrders.push(i.toString());
          }
          if (
            option.type === OrderV2StepType.SWAP_EXACT_IN ||
            option.type === OrderV2StepType.SWAP_EXACT_OUT ||
            option.type === OrderV2StepType.SWAP_MULTI_ROUTING
          ) {
            if (option.extraFeeOutput) {
              eternlOutputs.push(option.extraFeeOutput);
            }
          }
          const batcherFeePerOrder = BATCHER_FEE_DEX_V2[option.type];
          let totalBatcherFee: bigint;
          if (option.type === OrderV2StepType.PARTIAL_SWAP) {
            totalBatcherFee = batcherFeePerOrder * option.maximumSwapTime;
          } else {
            totalBatcherFee = batcherFeePerOrder;
          }
          orderValue.add(ADA, totalBatcherFee);

          const orderStep = buildV2OrderStep(option);
          const orderDatum: OrderV2Datum = {
            author: {
              canceller: {
                type: OrderV2AuthorizationMethodType.SIGNATURE,
                hash: Maybe.unwrap(
                  sender.toPubKeyHash(),
                  "only support PubKey sender"
                ).keyHash,
              },
              refundReceiver: sender,
              refundReceiverDatum: OrderV2ExtraDatum.newNoDatum(),
              successReceiver: receiver ?? sender,
              successReceiverDatum: OrderV2ExtraDatum.newNoDatum(),
            },
            step: orderStep,
            lpAsset: option.lpAsset,
            maxBatcherFee: totalBatcherFee,
            expiredOptions: option.expiredOptions,
          };
          const senderStakeAddress = sender.toStakeAddress();
          const orderAddress = senderStakeAddress
            ? buildDexV2OrderAddress(senderStakeAddress, networkEnv)
            : getDefaultDexV2OrderAddress(networkEnv);
          txb.payTo(
            TxOut.newScriptOut({
              address: orderAddress,
              value: orderValue,
              datumSource: DatumSource.newInlineDatum(
                Bytes.fromHex(OrderV2Datum.toDataHex(orderDatum))
              ),
            })
          );
          break;
        }
      }
    }

    if (eternlOutputs.length > 0) {
      const mergedEternlOutputs: Record<string, TxOut> = {};
      for (const eternlOutput of eternlOutputs) {
        if (eternlOutput.address.bech32 in mergedEternlOutputs) {
          mergedEternlOutputs[eternlOutput.address.bech32].value.addAll(
            eternlOutput.value
          );
        } else {
          mergedEternlOutputs[eternlOutput.address.bech32] = eternlOutput;
        }
      }
      for (const out of Object.values(mergedEternlOutputs)) {
        txb.payTo(out);
      }
    }

    const metadata =
      orderOptions.length > 1
        ? MetadataMessage.DEX_MIXED_ORDERS
        : getOrderMetadata(orderOptions[0]);

    const limitOrderMessage = limitOrders.length > 0 ? limitOrders : undefined;
    txb
      .addMessageMetadata("msg", [metadata])
      .addMessageMetadata("limitOrders", limitOrderMessage);
    return txb;
  }
}
