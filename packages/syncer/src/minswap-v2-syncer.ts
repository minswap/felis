import { Asset, NetworkEnvironment, TxIn } from "@repo/ledger-core";
import {
  getDexV2Configs,
  OrderV2,
  OrderV2StepType,
  PoolV2,
} from "@repo/minswap-dex-v2";
import { Transaction } from "./transaction";
import { Maybe, Result } from "@repo/ledger-utils";
import { WrapAddress, WrapAsset, WrapNum } from "./types";

export namespace MinswapV2Syncer {
  export enum TxType {
    CREATE_POOL = "CREATE_POOL",
    CREATE_ORDER = "CREATE_ORDER",
  };

  export type TxCreateOrder = {
    type: TxType.CREATE_ORDER;
    newOrders: {
      sender: WrapAddress;
      receiver: WrapAddress;
      lpAsset: WrapAsset;
      assetIn: WrapAsset;
      amountIn: WrapNum;
      assetOut: WrapAsset;
      amountOut: WrapNum;
      minimumReceive: WrapNum;
      dexFee: WrapNum;
      deposit: WrapNum;
    }[];
  };

  export type TxCreatePool = {
    type: TxType.CREATE_POOL;
    lpAsset: WrapAsset;
    assetA: WrapAsset;
    assetB: WrapAsset;
    reserveA: WrapNum;
    reserveB: WrapNum;
    reserveLP: WrapNum;
    tradingFeeAPercent: WrapNum;
    tradingFeeBPercent: WrapNum;
  };

  export type MinswapV2Tx = TxCreateOrder | TxCreatePool;

  /**
   * A mapping from LP asset string to its underlying assets (assetA, assetB)
   */
  export type MapPool = Record<WrapAsset, {assetA: WrapAsset; assetB: WrapAsset;}>;

  export function parseTxCreatePool(tx: Transaction, networkEnv: NetworkEnvironment): Maybe<TxCreatePool> {
    const poolAuthenAsset = getDexV2Configs(networkEnv).poolAuthenAsset;
    if (tx.body.mint.get(poolAuthenAsset) <= 0n) {
      return null;
    }
    const poolOutput = tx.body.outputs.find((o) => {return o.value.get(poolAuthenAsset) > 0n;});
    if (!poolOutput) {
      return null;
    }
    const poolResult = PoolV2.fromUtxo(
      {
        input: TxIn.fromString(`${"0".repeat(64)}#${0}`), // dummy input
        output: poolOutput,
      },
      networkEnv,
    );
    if (Result.isError(poolResult)) {
      return null;
    }
    const pool = poolResult.value;
    return {
      type: TxType.CREATE_POOL,
      lpAsset: pool.lpAsset.toString(),
      assetA: pool.assetA.toString(),
      assetB: pool.assetB.toString(),
      reserveA: pool.datumReserveA.toString(),
      reserveB: pool.datumReserveB.toString(),
      reserveLP: pool.datum.totalLiquidity.toString(),
      tradingFeeAPercent: (Number(pool.baseFee.feeANumerator) / 100).toString(),
      tradingFeeBPercent: (Number(pool.baseFee.feeBNumerator) / 100).toString(),
    }
  }

  /**
   * @param mapPool: A mapping from LP asset string to its underlying assets
   */
  export function parseTxCreateOrder(
    tx: Transaction,
    mapPool: MapPool,
    networkEnv: NetworkEnvironment,
  ): Maybe<TxCreateOrder> {
    const newOrders: TxCreateOrder["newOrders"] = [];
    for (let i = 0; i < tx.body.outputs.length; i++) {
      const orderResult = OrderV2.fromUtxo({
        utxo: {
          input: TxIn.fromString(`${"0".repeat(64)}#0`), // dummy input
          output: tx.body.outputs[i],
        },
        networkEnv: networkEnv,
      });

      if (Result.isError(orderResult)) {
        continue;
      }

      const order = orderResult.value;
      const poolInfo = mapPool[order.lpAsset.toString()];

      if (!poolInfo) {
        // Unknown pool, skip
        continue;
      }

      const assetA = Asset.fromString(poolInfo.assetA);
      const assetB = Asset.fromString(poolInfo.assetB);

      const orderInfoResult = order.getOrderInfo([assetA, assetB]);
      if (Result.isError(orderInfoResult)) {
        continue;
      }

      const orderInfo = orderInfoResult.value;
      const step = order.datum.step;

      // Only handle swap-type orders
      if (orderInfo.type !== "SWAP") {
        continue;
      }

      // Get minimum receive based on step type
      let minimumReceive: bigint;
      switch (step.type) {
        case OrderV2StepType.SWAP_EXACT_IN:
          minimumReceive = step.minimumReceived;
          break;
        case OrderV2StepType.STOP_LOSS:
          minimumReceive = step.stopLossReceived;
          break;
        case OrderV2StepType.OCO:
          minimumReceive = step.minimumReceived;
          break;
        case OrderV2StepType.SWAP_EXACT_OUT:
          minimumReceive = step.expectedReceived;
          break;
        case OrderV2StepType.PARTIAL_SWAP:
          // For partial swap, calculate based on ratio
          minimumReceive = (step.totalSwapAmount * step.ioRatioNumerator) / step.ioRatioDenominator;
          break;
        default:
          continue;
      }

      newOrders.push({
        sender: order.refundReceiver.bech32,
        receiver: order.successReceiver.bech32,
        lpAsset: order.lpAsset.toString(),
        assetIn: orderInfo.swapAsset.toString(),
        amountIn: orderInfo.swapAmount.toString(),
        assetOut: orderInfo.toAsset.toString(),
        amountOut: minimumReceive.toString(),
        minimumReceive: minimumReceive.toString(),
        dexFee: order.datum.maxBatcherFee.toString(),
        deposit: orderInfo.depositAda.toString(),
      });
    }

    if (newOrders.length === 0) {
      return null;
    }

    return {
      type: TxType.CREATE_ORDER,
      newOrders: newOrders,
    };
  }

  /**
   * @param mapPool: A mapping from LP asset string to its underlying assets
   */
  export function parseTx(options: {tx: Transaction; mapPool: MapPool; networkEnv: NetworkEnvironment;}): Maybe<MinswapV2Tx> {
    const { tx, mapPool, networkEnv } = options;
    const txCreatePool = parseTxCreatePool(tx, networkEnv);
    if (Maybe.isJust(txCreatePool)) {
      return txCreatePool;
    }

    const txCreateOrder = parseTxCreateOrder(tx, mapPool, networkEnv);
    if (Maybe.isJust(txCreateOrder)) {
      return txCreateOrder;
    }

    return null;
  }
}
