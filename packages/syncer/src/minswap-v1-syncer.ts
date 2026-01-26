import { DatumSourceType, NetworkEnvironment, TxIn } from "@minswap/felis-ledger-core";
import { Maybe, Result } from "@minswap/felis-ledger-utils";
import { Order, StepType } from "@minswap/felis-dex-v1";
import { Transaction } from "./transaction";
import { WrapAddress, WrapAsset, WrapNum } from "./types";

export namespace MinswapV1Syncer {
  export enum TxType {
    CREATE_POOL = "CREATE_POOL",
    CREATE_ORDER = "CREATE_ORDER",
  };

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

  export type MinswapV1Tx = TxCreateOrder;

  type NewOrder = TxCreateOrder["newOrders"][number];

  function getMinimumReceive(step: Order["datum"]["step"]): Maybe<bigint> {
    switch (step.type) {
      case StepType.SWAP_EXACT_IN:
        return step.minimumReceived;
      case StepType.SWAP_EXACT_OUT:
        return step.expectedReceived;
      default:
        return null;
    }
  }

  function tryParseSwapOrder(
    output: Transaction["body"]["outputs"][number],
    plutusData: Transaction["witnessSet"]["plutusData"],
    networkEnv: NetworkEnvironment,
  ): Maybe<NewOrder> {
    if (output.datumSource?.type !== DatumSourceType.DATUM_HASH) {
      return null;
    }

    const datum = plutusData[output.datumSource.hash.hex];
    if (!datum) {
      return null;
    }

    const orderResult = Order.fromUtxo(
      {
        input: TxIn.fromString(`${"0".repeat(64)}#0`), // dummy input
        output: output,
      },
      datum,
      networkEnv,
    );
    if (Result.isError(orderResult)) {
      return null;
    }

    const order = orderResult.value;
    if (order.orderInfo.type !== "SWAP") {
      return null;
    }

    const minimumReceive = getMinimumReceive(order.datum.step);
    if (minimumReceive == null) {
      return null;
    }

    return {
      sender: order.datum.sender.bech32,
      receiver: order.datum.receiver.bech32,
      assetIn: order.orderInfo.swapAsset.toString(),
      amountIn: order.orderInfo.swapAmount.toString(),
      assetOut: order.orderInfo.toAsset.toString(),
      minimumReceive: minimumReceive.toString(),
      dexFee: order.datum.batcherFee.toString(),
      deposit: order.datum.outputADA.toString(),
    };
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

  export function parseTx(options: {tx: Transaction; networkEnv: NetworkEnvironment;}): Maybe<MinswapV1Tx> {
    const { tx, networkEnv } = options;
    const txCreateOrder = parseTxCreateOrder(tx, networkEnv);
    if (Maybe.isJust(txCreateOrder)) {
      return txCreateOrder;
    }

    return null;
  }
}
