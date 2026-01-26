import { DatumSourceType, type NetworkEnvironment } from "@minswap/felis-ledger-core";
import { Maybe } from "@minswap/felis-ledger-utils";
import { WingridersV2 } from "@minswap/felis-wingriders-v2";
import type { Transaction } from "./transaction";
import type { WrapAddress, WrapAsset, WrapNum } from "./types";

export namespace WingridersV2Syncer {
  export enum TxType {
    CREATE_ORDER = "CREATE_ORDER",
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
      batcherFee: WrapNum;
      deposit: WrapNum;
    }[];
  };

  export type WingridersV2Tx = TxCreateOrder;

  type NewOrder = TxCreateOrder["newOrders"][number];

  function tryParseSwapOrder(
    output: Transaction["body"]["outputs"][number],
    plutusData: Transaction["witnessSet"]["plutusData"],
    networkEnv: NetworkEnvironment,
  ): Maybe<NewOrder> {
    // Check if output is to the order script
    const scriptHash = output.address.toScriptHash();
    if (!scriptHash || scriptHash.hex !== WingridersV2.ORDER_SCRIPT_HASH) {
      return null;
    }

    // WingRiders V2 can use inline datum or datum hash
    let datumHex: string | undefined;
    if (output.datumSource?.type === DatumSourceType.INLINE_DATUM) {
      datumHex = output.datumSource.data.hex;
    } else if (output.datumSource?.type === DatumSourceType.DATUM_HASH) {
      const datum = plutusData[output.datumSource.hash.hex];
      if (datum) {
        datumHex = datum.hex;
      }
    }

    if (!datumHex) {
      return null;
    }

    try {
      const orderDatum = WingridersV2.OrderDatum.fromDataHex(datumHex, networkEnv);

      // Only handle swap orders
      if (orderDatum.type !== WingridersV2.OrderType.Swap) {
        return null;
      }

      const orderInfo = WingridersV2.getOrderInfo({
        value: output.value,
        datum: orderDatum,
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
        batcherFee: orderInfo.batcherFee.toString(),
        deposit: orderInfo.deposit.toString(),
      };
    } catch {
      return null;
    }
  }

  export function parseTxCreateOrder(tx: Transaction, networkEnv: NetworkEnvironment): Maybe<TxCreateOrder> {
    const newOrders = tx.body.outputs
      .map((output) => tryParseSwapOrder(output, tx.witnessSet.plutusData, networkEnv))
      .filter((order): order is NewOrder => order !== null);

    if (newOrders.length === 0) {
      return null;
    }

    return {
      type: TxType.CREATE_ORDER,
      newOrders,
    };
  }

  export function parseTx(options: { tx: Transaction; networkEnv: NetworkEnvironment }): Maybe<WingridersV2Tx> {
    const { tx, networkEnv } = options;
    return parseTxCreateOrder(tx, networkEnv);
  }
}
