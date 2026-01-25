import { DatumSourceType, type NetworkEnvironment, TxIn } from "@repo/ledger-core";
import { Maybe, Result } from "@repo/ledger-utils";
import { SundaeSwapV3 } from "@repo/sundaeswap-v3";
import type { Transaction } from "./transaction";
import type { WrapAddress, WrapAsset, WrapNum } from "./types";

export namespace SundaeSwapV3Syncer {
  /**
   * MapPool is a mapping from pool ident to its pair assets
   * key: PoolIdent hex (e.g. "1f04...")
   */
  export type MapPool = Record<string, { assetA: WrapAsset; assetB: WrapAsset }>;

  export enum TxType {
    CREATE_ORDER = "CREATE_ORDER",
    CREATE_POOL = "CREATE_POOL",
  }

  export type TxCreateOrder = {
    type: TxType.CREATE_ORDER;
    newOrders: {
      sender: WrapAddress;
      receiver: WrapAddress;
      assetIn: WrapAsset;
      amountIn: WrapNum;
      assetOut: WrapAsset;
      minimumReceive: WrapNum;
      maxProtocolFee: WrapNum;
      deposit: WrapNum;
    }[];
  };

  export type TxCreatePool = {
    type: TxType.CREATE_POOL;
    poolIdent: string;
    lpAsset: WrapAsset;
    assetA: WrapAsset;
    assetB: WrapAsset;
    reserveA: WrapNum;
    reserveB: WrapNum;
    reserveLP: WrapNum;
    bidFeePercent: WrapNum;
    askFeePercent: WrapNum;
  };

  export type SundaeSwapV3Tx = TxCreateOrder | TxCreatePool;

  type NewOrder = TxCreateOrder["newOrders"][number];

  function tryParseSwapOrder(options: {
    output: Transaction["body"]["outputs"][number];
    networkEnv: NetworkEnvironment;
    mapPool: MapPool;
  }): Maybe<NewOrder> {
    const { output, networkEnv, mapPool } = options;

    // Check if output is to the order script
    const scriptHash = output.address.toScriptHash();
    if (!scriptHash || scriptHash.hex !== SundaeSwapV3.ORDER_SCRIPT_HASH) {
      return null;
    }

    // V3 uses inline datums
    if (output.datumSource?.type !== DatumSourceType.INLINE_DATUM) {
      return null;
    }

    try {
      const orderDatum = SundaeSwapV3.OrderDatum.fromDataHex(output.datumSource.data.hex, networkEnv);

      // Only handle swap orders
      if (orderDatum.details.type !== SundaeSwapV3.OrderDetailsType.Swap) {
        return null;
      }

      // Get pool info from mapPool
      const poolIdent = orderDatum.poolIdent;
      if (!poolIdent) {
        return null;
      }

      const poolInfo = mapPool[poolIdent.hex];
      if (!poolInfo) {
        return null;
      }

      const orderInfo = SundaeSwapV3.getOrderInfo({
        value: output.value,
        datum: orderDatum,
        networkEnv,
      });

      if (!orderInfo) {
        return null;
      }

      return {
        sender: orderInfo.sender.bech32,
        receiver: orderInfo.receiver.bech32,
        assetIn: orderInfo.assetIn.toString(),
        amountIn: orderInfo.amountIn.toString(),
        assetOut: orderInfo.assetOut.toString(),
        minimumReceive: orderInfo.minimumReceive.toString(),
        maxProtocolFee: orderInfo.maxProtocolFee.toString(),
        deposit: orderInfo.deposit.toString(),
      };
    } catch {
      return null;
    }
  }

  function tryParsePool(
    output: Transaction["body"]["outputs"][number],
    networkEnv: NetworkEnvironment,
  ): Maybe<TxCreatePool> {
    // V3 uses inline datums
    if (output.datumSource?.type !== DatumSourceType.INLINE_DATUM) {
      return null;
    }

    const poolResult = SundaeSwapV3.Pool.fromUtxo(
      {
        input: TxIn.fromString(`${"0".repeat(64)}#0`), // dummy input
        output: output,
      },
      output.datumSource.data.hex,
      networkEnv,
    );

    if (Result.isError(poolResult)) {
      return null;
    }

    const pool = poolResult.value;
    const bidFeePercent = (Number(pool.bidFeeNumerator) * 100) / Number(SundaeSwapV3.FEE_DENOMINATOR);
    const askFeePercent = (Number(pool.askFeeNumerator) * 100) / Number(SundaeSwapV3.FEE_DENOMINATOR);

    return {
      type: TxType.CREATE_POOL,
      poolIdent: pool.ident.hex,
      lpAsset: pool.lpAsset.toString(),
      assetA: pool.assetA.toString(),
      assetB: pool.assetB.toString(),
      reserveA: pool.reserveA.toString(),
      reserveB: pool.reserveB.toString(),
      reserveLP: pool.liquidity.toString(),
      bidFeePercent: bidFeePercent.toString(),
      askFeePercent: askFeePercent.toString(),
    };
  }

  export function parseTxCreatePool(tx: Transaction, networkEnv: NetworkEnvironment): Maybe<TxCreatePool> {
    const pools = tx.body.outputs
      .map((output) => tryParsePool(output, networkEnv))
      .filter((pool): pool is TxCreatePool => pool !== null);

    if (pools.length === 0) {
      return null;
    }

    // Return the first pool found
    return pools[0];
  }

  export function parseTxCreateOrder(options: {
    tx: Transaction;
    networkEnv: NetworkEnvironment;
    mapPool: MapPool;
  }): Maybe<TxCreateOrder> {
    const { tx, networkEnv, mapPool } = options;
    const newOrders = tx.body.outputs
      .map((output) => tryParseSwapOrder({ output, networkEnv, mapPool }))
      .filter((order): order is NewOrder => order !== null);

    if (newOrders.length === 0) {
      return null;
    }

    return {
      type: TxType.CREATE_ORDER,
      newOrders,
    };
  }

  export function parseTx(options: {
    tx: Transaction;
    mapPool: MapPool;
    networkEnv: NetworkEnvironment;
  }): Maybe<SundaeSwapV3Tx> {
    const { tx, networkEnv, mapPool } = options;

    const txCreatePool = parseTxCreatePool(tx, networkEnv);
    if (Maybe.isJust(txCreatePool)) {
      return txCreatePool;
    }

    return parseTxCreateOrder({ tx, networkEnv, mapPool });
  }
}
