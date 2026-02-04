import invariant from "@minswap/tiny-invariant";
import { DEXOrderTransaction } from "@minswap/felis-build-tx";
import { Address, Asset, NetworkEnvironment, Utxo, XJSON } from "@minswap/felis-ledger-core";
import { DexVersion, OrderV2Direction, OrderV2StepType } from "@minswap/felis-dex-v2";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@minswap/felis-tx-builder";
import { Duration, RustModule, safeFreeRustObjects } from "@minswap/felis-ledger-utils";
import { HashUtils } from "../utils";
import { CardanoscanProvider } from "../provider";
import { MarketConfig } from "../config";

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
      orderOutputIndex: 0,
      outputsHash,
      validTo,
    }
  };

  export type WaitingLongBuyOptions = {
    marketConfig: MarketConfig;
    txHash: string;
    orderOutputIndex: number;
    userAddress: Address;
    assetOut: Asset;
    cardanoscanProvider: CardanoscanProvider;
  };

  export type WaitingLongBuyResult =
    | { isSpent: false }
    | {
        isSpent: true;
        nextOrderType: LongOrderType;
        assetIn: string;
        amountIn: string;
        assetOut: string;
      };

  /**
   * Check if the order output has been spent (consumed by a subsequent transaction)
   * and prepare the next order details
   * @param options - Options containing transaction details and cardanoscan provider
   * @returns Result with next order details if spent, or isSpent: false if not yet processed
   */
  export const waitingLongBuy = async (options: WaitingLongBuyOptions): Promise<WaitingLongBuyResult> => {
    const { marketConfig, txHash, orderOutputIndex, userAddress, cardanoscanProvider, assetOut } = options;

    // Cache hex conversion of user address
    const userAddressHex = userAddress.toHex();

    // Search for the transaction that spent this UTXO
    const spendingTx = await cardanoscanProvider.findTransactionHasSpent(
      userAddress,
      txHash,
      orderOutputIndex,
      5, // pageSize - search 50 transactions per page
      10, // maxPage - search up to 10 pages (500 transactions total)
    );

    if (spendingTx) {
      // Order output has been spent
      // Now find the output that belongs to the user and contains the assetOut token
      const assetOutUnit = assetOut.toBlockFrostString();

      // Search through the spending transaction's outputs
      for (const output of spendingTx.outputs) {
        // Check if output address matches user address (in hex)
        if (output.address === userAddressHex) {
          // Check if output contains the assetOut token
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === assetOutUnit);
            if (matchingToken) {
              // Found the output with the matching token
              // Prepare next order: LONG_SUPPLY
              const amountOut = BigInt(matchingToken.value);
              return {
                isSpent: true,
                nextOrderType: LongOrderType.LONG_SUPPLY,
                assetIn: assetOut.toString(), // The asset we received becomes input for next order
                amountIn: amountOut.toString(), // The amount we received becomes input amount
                assetOut: marketConfig.collateralMarketId, // Supply to get collateral token
              };
            }
          }
        }
      }

      // Transaction found but couldn't find matching output
      // This is an error condition - the order was processed but we can't find the result
      throw new Error(
        `Order output spent (tx: ${spendingTx.hash}) but could not find matching output with asset ${assetOut.toString()}`,
      );
    }

    // Order output has not been spent yet
    return {
      isSpent: false,
    };
  };
}
