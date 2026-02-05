import { DEXOrderTransaction } from "@minswap/felis-build-tx";
import { DexVersion, OrderV2Direction, OrderV2StepType } from "@minswap/felis-dex-v2";
import { Address, Asset, getTimeFromSlotMagic, type NetworkEnvironment, Utxo } from "@minswap/felis-ledger-core";
import { Duration, Maybe, RustModule, safeFreeRustObjects } from "@minswap/felis-ledger-utils";
import { LiqwidProvider } from "@minswap/felis-lending-market";
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
  };

  export const handleLongBuy = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(order.orderType === LongOrderType.LONG_BUY, "Invalid order type for handleLongBuy");
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

  export type WaitingLongSupplyOptions = {
    marketConfig: MarketConfig;
    txHash: string;
    userAddress: Address;
    cardanoscanProvider: CardanoscanProvider;
  };

  export type WaitingLongSupplyResult =
    | { isConfirmed: false }
    | {
        isConfirmed: true;
        nextOrderType: LongOrderType;
        assetIn: string;
        amountIn: string;
        assetOut: string;
      };

  /**
   * Wait for LONG_SUPPLY transaction to be confirmed and prepare the next LONG_BORROW order
   * @param options - Options containing transaction details and cardanoscan provider
   * @returns Result with next order details if confirmed, or isConfirmed: false if not yet confirmed
   */
  export const waitingLongSupply = async (options: WaitingLongSupplyOptions): Promise<WaitingLongSupplyResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider } = options;

    // Search for the transaction to confirm it's on chain
    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      50, // pageSize
      10, // maxPage
    );

    if (txFoundOnChain) {
      // Transaction is confirmed on chain
      // Find the output that belongs to the user and contains the qToken (asset_b_q_token_raw)
      const userAddressHex = userAddress.toHex();
      const qTokenAsset = Asset.fromString(marketConfig.assetBQTokenRaw);
      const qTokenUnit = qTokenAsset.toBlockFrostString();

      // Search through the transaction outputs
      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === qTokenUnit);
            if (matchingToken) {
              // Found the output with the qToken
              // Prepare next order: LONG_BORROW
              const amountReceived = BigInt(matchingToken.value);
              return {
                isConfirmed: true,
                nextOrderType: LongOrderType.LONG_BORROW,
                assetIn: marketConfig.assetBQTokenRaw, // qToken (qMIN) becomes input for borrow
                amountIn: amountReceived.toString(),
                assetOut: marketConfig.assetA.toString(), // Borrow asset A (ADA)
              };
            }
          }
        }
      }

      // Transaction found but couldn't find matching qToken output
      throw new Error(
        `LONG_SUPPLY tx confirmed (${txHash}) but could not find output with qToken ${marketConfig.assetBQTokenRaw}`,
      );
    }

    // Transaction not yet confirmed
    return {
      isConfirmed: false,
    };
  };
}
