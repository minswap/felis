import { DEXOrderTransaction } from "@minswap/felis-build-tx";
import { DexVersion, OrderV2Direction, OrderV2StepType } from "@minswap/felis-dex-v2";
import { Address, Asset, getTimeFromSlotMagic, type NetworkEnvironment, Utxo } from "@minswap/felis-ledger-core";
import { Duration, Maybe, RustModule, safeFreeRustObjects } from "@minswap/felis-ledger-utils";
import { LiqwidProvider, LiqwidProviderV2 } from "@minswap/felis-lending-market";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@minswap/felis-tx-builder";
import invariant from "@minswap/tiny-invariant";
import type { MarketConfig } from "../config";
import type { CardanoscanProvider } from "../provider";
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

  export type BuiltResult = {
    txRaw: string;
    txId: string;
    validTo: number;
    outputsHash?: string;
  };

  // Common order data type for all Handle functions
  export type OrderData = {
    orderType: string;
    assetIn: string | null;
    amountIn: string | null;
    assetOut: string | null;
  };

  // Common options for all Handle functions
  export type HandleBuildTxOptions = {
    order: OrderData;
    marketConfig: MarketConfig;
    userAddress: string;
    networkEnv: NetworkEnvironment;
    utxos: string[];
    /** Amount to borrow (used for LONG_BORROW) */
    amountBorrow?: string;
  };

  export const handleLongBuy = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(
      order.orderType === LongOrderType.LONG_BUY || order.orderType === LongOrderType.LONG_BUY_MORE,
      "Invalid order type for handleLongBuy",
    );
    invariant(order.assetIn, "assetIn is required for LONG_BUY order");
    invariant(order.amountIn, "amountIn is required for LONG_BUY order");
    invariant(order.assetOut, "assetOut is required for LONG_BUY order");
    const walletUtxos: Utxo[] = utxos.map((u) => Utxo.fromHex(u));
    const sender = Address.fromBech32(userAddress);

    const txb = DEXOrderTransaction.createBulkOrdersTx({
      networkEnv,
      sender,
      orderOptions: [
        {
          lpAsset: Asset.fromString(marketConfig.ammLpAsset),
          version: DexVersion.DEX_V2,
          type: OrderV2StepType.SWAP_EXACT_IN,
          assetIn: marketConfig.assetA,
          amountIn: BigInt(order.amountIn),
          minimumAmountOut: 1n,
          direction: OrderV2Direction.A_TO_B,
          killOnFailed: false,
          isLimitOrder: false,
        },
      ],
    });
    const validTo = Date.now() + Duration.newMinutes(3).milliseconds;
    txb.validToUnixTime(validTo);

    const {
      txComplete,
      txId,
      newUtxoState: { changeUtxos },
    } = await txb.completeUnsafeForTxChaining({
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
    };
  };

  export const handleLongSupply = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, userAddress, networkEnv, utxos } = options;
    invariant(order.orderType === LongOrderType.LONG_SUPPLY, "Invalid order type for handleLongSupply");
    invariant(order.assetIn, "assetIn is required for LONG_SUPPLY order");
    invariant(order.amountIn, "amountIn is required for LONG_SUPPLY order");
    invariant(order.assetOut, "assetOut is required for LONG_SUPPLY order");

    // assetOut contains the lending market ID (collateral token qMIN or qADA)
    // We need to extract the market ID from the assetOut
    // For example: "186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0" -> "MIN"
    const marketId = order.assetOut as LiqwidProvider.MarketId;

    const buildTxResult = await LiqwidProvider.getSupplyTransaction({
      marketId,
      amount: Number(order.amountIn),
      address: userAddress,
      utxos,
      networkEnv,
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build supply transaction: ${buildTxResult.error.message}`);
    }

    const txRaw = buildTxResult.value;
    const ECSL = RustModule.getE;
    const eTx = ECSL.Transaction.from_hex(txRaw);
    const txBody = eTx.body();
    const ttl = txBody.ttl();
    invariant(Maybe.isJust(ttl), "TTL must be set in the transaction body");
    safeFreeRustObjects(eTx, txBody);

    const validTo = getTimeFromSlotMagic(networkEnv, ttl);
    const txId = LiqwidProvider.getLiqwidTxHash(txRaw);

    return {
      txRaw,
      txId,
      validTo: validTo.getTime(),
    };
  };

  export const handleLongBorrow = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, amountBorrow } = options;
    invariant(order.orderType === LongOrderType.LONG_BORROW, "Invalid order type for handleLongBorrow");
    invariant(order.assetIn, "assetIn is required for LONG_BORROW order");
    invariant(order.amountIn, "amountIn is required for LONG_BORROW order");
    invariant(amountBorrow, "amountBorrow is required for LONG_BORROW order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    const buildTxResult = await LiqwidProviderV2.Transactions.borrow(apiConfig, {
      address: userAddress,
      utxos,
      marketId: marketConfig.borrowMarketIdLong as LiqwidProviderV2.MarketId,
      amount: Number(amountBorrow),
      collaterals: [
        {
          id: marketConfig.assetBQTokenTicker,
          amount: Number(order.amountIn),
        },
      ],
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build borrow transaction: ${buildTxResult.error.message}`);
    }

    const txRaw = buildTxResult.value;
    const ECSL = RustModule.getE;
    const eTx = ECSL.Transaction.from_hex(txRaw);
    const txBody = eTx.body();
    const ttl = txBody.ttl();
    invariant(Maybe.isJust(ttl), "TTL must be set in the transaction body");
    safeFreeRustObjects(eTx, txBody);

    const validTo = getTimeFromSlotMagic(networkEnv, ttl);
    const txId = LiqwidProviderV2.getTxHash(txRaw);

    return {
      txRaw,
      txId,
      validTo: validTo.getTime(),
    };
  };

  /** Map of order types to their build transaction functions */
  export const MAP_BUILD_TX_FN: Record<string, (options: HandleBuildTxOptions) => Promise<BuiltResult>> = {
    [LongOrderType.LONG_BUY]: handleLongBuy,
    [LongOrderType.LONG_SUPPLY]: handleLongSupply,
    [LongOrderType.LONG_BORROW]: handleLongBorrow,
    [LongOrderType.LONG_BUY_MORE]: handleLongBuy, // Reuse handleLongBuy
  };

  // Common waiting result type for all waiting functions
  export type WaitingResult =
    | { isConfirmed: false }
    | {
        isConfirmed: true;
        nextOrderType: LongOrderType;
        assetIn: string;
        amountIn: string;
        assetOut: string;
      }
    | {
        isConfirmed: true;
        isFinal: true;
        positionStatus: PositionStatus;
      };

  export type WaitingOptions = {
    marketConfig: MarketConfig;
    txHash: string;
    userAddress: Address;
    cardanoscanProvider: CardanoscanProvider;
    /** Current order type being waited on */
    orderType: string;
    /** Order output index (used for LONG_BUY to check if output is spent) */
    orderOutputIndex?: number;
    /** Asset out from order (used for LONG_BUY to find the received token) */
    assetOut?: Asset;
    /** Position amount_in (used for LONG_BORROW to calculate borrow amount) */
    positionAmountIn?: string;
  };

  /**
   * Wait for LONG_BUY or LONG_BUY_MORE order output to be spent (consumed by DEX)
   * - For LONG_BUY: prepare the next LONG_SUPPLY order details
   * - For LONG_BUY_MORE: this is the final step, position becomes OPEN
   */
  export const waitingLongBuy = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, orderOutputIndex, userAddress, cardanoscanProvider, assetOut, orderType } = options;
    invariant(orderOutputIndex !== undefined, "orderOutputIndex is required for waitingLongBuy");
    invariant(assetOut, "assetOut is required for waitingLongBuy");

    const userAddressHex = userAddress.toHex();

    // Search for the transaction that spent this UTXO
    const spendingTx = await cardanoscanProvider.findTransactionHasSpent(
      userAddress,
      txHash,
      orderOutputIndex,
      5, // pageSize
      10, // maxPage
    );

    if (spendingTx) {
      const assetOutUnit = assetOut.toBlockFrostString();

      for (const output of spendingTx.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === assetOutUnit);
            if (matchingToken) {
              const amountOut = BigInt(matchingToken.value);

              // For LONG_BUY_MORE, this is the final step - position becomes OPEN
              if (orderType === LongOrderType.LONG_BUY_MORE) {
                return {
                  isConfirmed: true,
                  isFinal: true,
                  positionStatus: PositionStatus.OPEN,
                };
              }

              // For LONG_BUY, transition to LONG_SUPPLY
              return {
                isConfirmed: true,
                nextOrderType: LongOrderType.LONG_SUPPLY,
                assetIn: assetOut.toString(),
                amountIn: amountOut.toString(),
                assetOut: marketConfig.collateralMarketId,
              };
            }
          }
        }
      }

      throw new Error(
        `Order output spent (tx: ${spendingTx.hash}) but could not find matching output with asset ${assetOut.toString()}`,
      );
    }

    return { isConfirmed: false };
  };

  /**
   * Wait for LONG_SUPPLY transaction to be confirmed
   * and prepare the next LONG_BORROW order details
   */
  export const waitingLongSupply = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider } = options;

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(userAddress, txHash, 50, 10);

    if (txFoundOnChain) {
      const userAddressHex = userAddress.toHex();
      const qTokenAsset = Asset.fromString(marketConfig.assetBQTokenRaw);
      const qTokenUnit = qTokenAsset.toBlockFrostString();

      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === qTokenUnit);
            if (matchingToken) {
              const amountReceived = BigInt(matchingToken.value);
              return {
                isConfirmed: true,
                nextOrderType: LongOrderType.LONG_BORROW,
                assetIn: marketConfig.assetBQTokenRaw,
                amountIn: amountReceived.toString(),
                assetOut: marketConfig.assetA.toString(),
              };
            }
          }
        }
      }

      throw new Error(
        `LONG_SUPPLY tx confirmed (${txHash}) but could not find output with qToken ${marketConfig.assetBQTokenRaw}`,
      );
    }

    return { isConfirmed: false };
  };

  /**
   * Wait for LONG_BORROW transaction to be confirmed
   * and prepare the next LONG_BUY_MORE order details
   */
  export const waitingLongBorrow = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider, positionAmountIn } = options;
    invariant(positionAmountIn, "positionAmountIn is required for waitingLongBorrow");

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(userAddress, txHash, 50, 10);

    if (txFoundOnChain) {
      // Calculate borrow amount: position.amount_in * (market_config.leverage - 1)
      const amountBorrow = BigInt(Math.floor(Number(positionAmountIn) * (marketConfig.leverage - 1)));

      return {
        isConfirmed: true,
        nextOrderType: LongOrderType.LONG_BUY_MORE,
        assetIn: marketConfig.assetA.toString(),
        amountIn: amountBorrow.toString(),
        assetOut: marketConfig.assetB.toString(),
      };
    }

    return { isConfirmed: false };
  };

  /** Map of order types to their waiting functions */
  export const MAP_WAITING_FN: Record<string, (options: WaitingOptions) => Promise<WaitingResult>> = {
    [LongOrderType.LONG_BUY]: waitingLongBuy,
    [LongOrderType.LONG_SUPPLY]: waitingLongSupply,
    [LongOrderType.LONG_BORROW]: waitingLongBorrow,
    [LongOrderType.LONG_BUY_MORE]: waitingLongBuy, // Reuse waitingLongBuy
  };
}
