import { DatumSourceType, type NetworkEnvironment } from "@repo/ledger-core";
import { Maybe } from "@repo/ledger-utils";
import { WingridersV1 } from "@repo/wingriders-v1";
import type { Transaction } from "./transaction";
import type { WrapAddress, WrapAsset, WrapNum } from "./types";

export namespace WingridersV1Syncer {
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

  export type WingridersV1Tx = TxCreateOrder;

  type NewOrder = TxCreateOrder["newOrders"][number];

  function tryParseSwapOrder(
    output: Transaction["body"]["outputs"][number],
    plutusData: Transaction["witnessSet"]["plutusData"],
    networkEnv: NetworkEnvironment,
  ): Maybe<NewOrder> {
    // Check if output is to the order script
    const scriptHash = output.address.toScriptHash();
    if (!scriptHash || scriptHash.hex !== WingridersV1.ORDER_SCRIPT_HASH) {
      return null;
    }

    // WingRiders V1 uses datum hash
    if (output.datumSource?.type !== DatumSourceType.DATUM_HASH) {
      return null;
    }

    const datum = plutusData[output.datumSource.hash.hex];
    if (!datum) {
      return null;
    }

    try {
      const orderDatum = WingridersV1.OrderDatum.fromDataHex(datum.hex, networkEnv);

      // Only handle swap orders
      if (orderDatum.type !== WingridersV1.OrderType.Swap) {
        return null;
      }

      const orderInfo = WingridersV1.getOrderInfo({
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

  export function parseTx(options: { tx: Transaction; networkEnv: NetworkEnvironment }): Maybe<WingridersV1Tx> {
    const { tx, networkEnv } = options;
    return parseTxCreateOrder(tx, networkEnv);
  }
}
