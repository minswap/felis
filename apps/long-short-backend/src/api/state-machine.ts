import invariant from "@minswap/tiny-invariant";
import { DEXOrderTransaction } from "@minswap/felis-build-tx";
import { Address, Asset, NetworkEnvironment, Utxo, XJSON } from "@minswap/felis-ledger-core";
import { DexVersion, OrderV2Direction, OrderV2StepType } from "@minswap/felis-dex-v2";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@minswap/felis-tx-builder";
import { Duration, RustModule, safeFreeRustObjects } from "@minswap/felis-ledger-utils";
import { HashUtils } from "../utils";

export namespace StateMachine {
  export enum PositionSide {
    LONG = "LONG",
    SHORT = "SHORT",
  }

  export enum PositionStatus {
    PENDING = "PENDING",
    OPEN = "OPEN",
    CLOSING = "CLOSING",
    CLOSED = "CLOSED",
  }

  export enum LongOrderType {
    LONG_BUY = "LONG_BUY",
    LONG_SUPPLY = "LONG_SUPPLY",
    LONG_BORROW = "LONG_BORROW",
    LONG_BUY_MORE = "LONG_BUY_MORE",
    LONG_SUPPLY_MORE = "LONG_SUPPLY_MORE",
    LONG_WITHDRAW = "LONG_WITHDRAW",
    LONG_SELL = "LONG_SELL",
    LONG_REPAY = "LONG_REPAY",
  }

  export type HandleLongBuyOptions = {
    order: {
      order_type: string;
      asset_in: string | null;
      amount_in: string | null;
      asset_out: string | null;
    };
    marketConfig: {
      market_id: string;
      asset_a: string;
      asset_b: string;
      amm_lp_asset: string;
    };
    userAddress: string;
    networkEnv: NetworkEnvironment;
    utxos: string[];
  };

  export const handleLongBuy = async (options: HandleLongBuyOptions) => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(order.order_type === LongOrderType.LONG_BUY, "Invalid order type for handleLongBuy");
    invariant(order.asset_in, "asset_in is required for LONG_BUY order");
    invariant(order.amount_in, "amount_in is required for LONG_BUY order");
    invariant(order.asset_out, "asset_out is required for LONG_BUY order");
    const walletUtxos: Utxo[] = utxos.map((u) => Utxo.fromHex(u));
    const sender = Address.fromBech32(userAddress);

    const txb = DEXOrderTransaction.createBulkOrdersTx({
      networkEnv,
      sender,
      orderOptions: [{
        lpAsset: Asset.fromString(marketConfig.amm_lp_asset),
        version: DexVersion.DEX_V2,
        type: OrderV2StepType.SWAP_EXACT_IN,
        assetIn: Asset.fromString(marketConfig.asset_a),
        amountIn: BigInt(order.amount_in.toString()),
        minimumAmountOut: 1n,
        direction: OrderV2Direction.A_TO_B,
        killOnFailed: false,
        isLimitOrder: false,
      }],
    });
    const validTo = new Date().getTime() + Duration.newMinutes(3).milliseconds;
    txb.validToUnixTime(validTo);

    const {txComplete, txId, newUtxoState: { changeUtxos } } = await txb.completeUnsafeForTxChaining({
      coinSelectionAlgorithm: CoinSelectionAlgorithm.SPEND_ALL,
      walletUtxos,
      changeAddress: sender,
      provider: new EmulatorProvider(networkEnv),
    });
    const txRaw = txComplete.complete();
    const ECSL = RustModule.getE;
    const eTx = ECSL.Transaction.from_hex(txRaw);
    const outputsHash = HashUtils.sha256(changeUtxos.map((u) => Utxo.toHex(u)).join(","));

    safeFreeRustObjects(eTx);

    return {
      txRaw,
      txId: txId,
      outputsHash,
      validTo,
    }
  };
}
