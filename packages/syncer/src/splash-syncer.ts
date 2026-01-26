import { DatumSourceType, type NetworkEnvironment } from "@minswap/felis-ledger-core";
import { Maybe } from "@minswap/felis-ledger-utils";
import { Splash } from "@minswap/felis-splash";
import type { Transaction } from "./transaction";
import type { WrapAddress, WrapAsset, WrapNum } from "./types";

export namespace SplashSyncer {
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

  export type SplashTx = TxCreateOrder;

  type NewOrder = TxCreateOrder["newOrders"][number];

  function tryParseSwapOrder(
    output: Transaction["body"]["outputs"][number],
    plutusData: Transaction["witnessSet"]["plutusData"],
    networkEnv: NetworkEnvironment,
  ): Maybe<NewOrder> {
    // Check if output is to one of the Splash order script addresses
    const scriptHash = output.address.toScriptHash();
    if (!scriptHash || !Splash.getOrderScriptHashes().includes(scriptHash.hex)) {
      return null;
    }

    // Splash can use inline datum or datum hash
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
      const orderDatum = Splash.OrderDatum.fromDataHex(datumHex, networkEnv);

      const orderInfo = Splash.getOrderInfo({
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

  export function parseTx(options: { tx: Transaction; networkEnv: NetworkEnvironment }): Maybe<SplashTx> {
    const { tx, networkEnv } = options;
    return parseTxCreateOrder(tx, networkEnv);
  }
}
