import { Asset, DatumSourceType, NetworkEnvironment, TxIn } from "@repo/ledger-core";
import { Maybe, Result } from "@repo/ledger-utils";
import { SundaeSwapV1 } from "@repo/sundaeswap-v1";
import { Transaction } from "./transaction";
import { WrapAddress, WrapAsset, WrapNum } from "./types";

export namespace SundaeSwapV1Syncer {
  /**
   * MapPool is a mapping from asset to its pair assets
   * key: PoolIdent (i.e. "1f04")
   */
  export type MapPool = Record<string, {assetA: WrapAsset; assetB: WrapAsset;}>;

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
      dexFee: WrapNum;
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
    tradingFeePercent: WrapNum;
  };

  export type SundaeSwapV1Tx = TxCreateOrder | TxCreatePool;

  type NewOrder = TxCreateOrder["newOrders"][number];

  function tryParseSwapOrder(options: {
    output: Transaction["body"]["outputs"][number];
    plutusData: Transaction["witnessSet"]["plutusData"];
    networkEnv: NetworkEnvironment;
    mapPool: MapPool;
  }): Maybe<NewOrder> {
    const { output, plutusData, networkEnv, mapPool } = options;
    if (!output.address.bech32.startsWith(SundaeSwapV1.ORDER_ADDRESS)) {
      return null;
    }
    if (output.datumSource?.type === DatumSourceType.DATUM_HASH) {
      const datum = plutusData[output.datumSource.hash.hex];
      if (!datum) {
        return null;
      }
      const orderDatum = SundaeSwapV1.OrderDatum.fromDataHex(datum.hex, networkEnv);
      const poolInfo = mapPool[orderDatum.poolIdent.hex];
      if (!poolInfo) {
        return null;
      }
      const { assetA, assetB } = poolInfo;
      const orderInfo = SundaeSwapV1.getOrderInfo({
        value: output.value,
        datum: orderDatum,
        assetA: Asset.fromString(assetA),
        assetB: Asset.fromString(assetB),
      });
      return {
        sender: orderInfo.sender.bech32,
        receiver: orderInfo.receiver.bech32,
        assetIn: orderInfo.assetIn.toString(),
        amountIn: orderInfo.amountIn.toString(),
        assetOut: orderInfo.assetOut.toString(),
        minimumReceive: orderInfo.minimumReceive.toString(),
        dexFee: orderInfo.dexFee.toString(),
        deposit: orderInfo.deposit.toString(),
      };
    }

    return null;
  }

  function tryParsePool(
    output: Transaction["body"]["outputs"][number],
    plutusData: Transaction["witnessSet"]["plutusData"],
    networkEnv: NetworkEnvironment,
  ): Maybe<TxCreatePool> {
    if (output.datumSource?.type !== DatumSourceType.DATUM_HASH) {
      return null;
    }
    const datum = plutusData[output.datumSource.hash.hex];
    if (!datum) {
      return null;
    }
    const poolResult = SundaeSwapV1.Pool.fromUtxo(
      {
        input: TxIn.fromString(`${"0".repeat(64)}#0`), // dummy input
        output: output,
      },
      datum.hex,
      networkEnv,
    );
    if (Result.isError(poolResult)) {
      return null;
    }
    const pool = poolResult.value;
    const tradingFeeNumerator = pool.datum.tradingFee[0];
    const tradingFeeDenominator = pool.datum.tradingFee[1];
    const tradingFeePercent = (tradingFeeNumerator * 100) / tradingFeeDenominator;

    return {
      type: TxType.CREATE_POOL,
      poolIdent: pool.datum.ident.hex,
      lpAsset: pool.lpAsset.toString(),
      assetA: pool.assetA.toString(),
      assetB: pool.assetB.toString(),
      reserveA: pool.reserveA.toString(),
      reserveB: pool.reserveB.toString(),
      reserveLP: pool.liquidity.toString(),
      tradingFeePercent: tradingFeePercent.toString(),
    };
  }

  export function parseTxCreatePool(tx: Transaction, networkEnv: NetworkEnvironment): Maybe<TxCreatePool> {
    const pools = tx.body.outputs
      .map((output, index) => tryParsePool(output, tx.witnessSet.plutusData, networkEnv))
      .filter((pool): pool is TxCreatePool => pool !== null);

    if (pools.length === 0) {
      return null;
    }

    // Return the first pool found
    return pools[0];
  }

  export function parseTxCreateOrder(options: {tx: Transaction; networkEnv: NetworkEnvironment; mapPool: MapPool;}): Maybe<TxCreateOrder> {
    const { tx, networkEnv, mapPool } = options;
    const newOrders = tx.body.outputs
      .map((output) => tryParseSwapOrder({output, plutusData: tx.witnessSet.plutusData, networkEnv, mapPool}))
      .filter((order): order is NewOrder => order !== null);

    if (newOrders.length === 0) {
      return null;
    }

    return {
      type: TxType.CREATE_ORDER,
      newOrders,
    };
  }

  export function parseTx(options: { tx: Transaction; mapPool: MapPool; networkEnv: NetworkEnvironment }): Maybe<SundaeSwapV1Tx> {
    const { tx, networkEnv, mapPool } = options;
    const txCreatePool = parseTxCreatePool(tx, networkEnv);
    if (Maybe.isJust(txCreatePool)) {
      return txCreatePool;
    }

    return parseTxCreateOrder({tx, networkEnv, mapPool});
  }
}
