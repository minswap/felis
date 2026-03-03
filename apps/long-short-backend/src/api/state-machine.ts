import { DEXOrderTransaction } from "@minswap/felis-build-tx";
import { DexVersion, OrderV2Direction, OrderV2StepType } from "@minswap/felis-dex-v2";
import { Address, Asset, getTimeFromSlotMagic, type NetworkEnvironment, Utxo } from "@minswap/felis-ledger-core";
import { Duration, Maybe, RustModule, safeFreeRustObjects } from "@minswap/felis-ledger-utils";
import { LiqwidProvider, LiqwidProviderV2 } from "@minswap/felis-lending-market";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@minswap/felis-tx-builder";
import invariant from "@minswap/tiny-invariant";
import type { MarketConfig } from "../config";
import { CardanoscanProvider } from "../provider";
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
    LONG_SELL = "LONG_SELL",
    LONG_REPAY = "LONG_REPAY",
    LONG_WITHDRAW = "LONG_WITHDRAW",
    LONG_SELL_ALL = "LONG_SELL_ALL",
  }

  export enum ShortOrderType {
    SHORT_SUPPLY = "SHORT_SUPPLY",
    SHORT_BORROW = "SHORT_BORROW",
    SHORT_SELL = "SHORT_SELL",
    SHORT_BUY = "SHORT_BUY",
    SHORT_REPAY = "SHORT_REPAY",
    SHORT_WITHDRAW = "SHORT_WITHDRAW",
  }

  export type BuiltResult = {
    txRaw: string;
    txId: string;
    validTo: number;
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
    /** Amount to borrow (used for LONG_BORROW / SHORT_BORROW) */
    amountBorrow?: string;
    /** Loan transaction ID (used for LONG_REPAY / SHORT_REPAY to identify the loan) */
    loanTxId?: string;
    /** Loan output index (used for LONG_REPAY / SHORT_REPAY) */
    loanOutputIndex?: number;
    /** Collateral qToken amount (used for LONG_REPAY / SHORT_REPAY to redeem collateral) */
    collateralAmount?: string;
    /** Supply amountOut from SUPPLY order (used for LONG_WITHDRAW / SHORT_WITHDRAW) */
    supplyAmountOut?: string;
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

    const { txComplete, txId } = await txb.completeUnsafeForTxChaining({
      coinSelectionAlgorithm: CoinSelectionAlgorithm.SPEND_ALL,
      walletUtxos,
      changeAddress: sender,
      provider: new EmulatorProvider(networkEnv),
    });
    const txRaw = txComplete.complete();
    const ECSL = RustModule.getE;
    const eTx = ECSL.Transaction.from_hex(txRaw);
    safeFreeRustObjects(eTx);

    return {
      txRaw,
      txId: txId,
      validTo,
    };
  };

  export const handleLongSupply = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(order.orderType === LongOrderType.LONG_SUPPLY, "Invalid order type for handleLongSupply");
    invariant(order.assetIn, "assetIn is required for LONG_SUPPLY order");
    invariant(order.amountIn, "amountIn is required for LONG_SUPPLY order");

    const marketId = marketConfig.longCollateralMarketId as LiqwidProvider.MarketId;

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

  /**
   * Build LONG_SELL or LONG_SELL_ALL transaction: Sell asset B for asset A (B_TO_A swap via DEX)
   */
  export const handleLongSell = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(
      order.orderType === LongOrderType.LONG_SELL || order.orderType === LongOrderType.LONG_SELL_ALL,
      "Invalid order type for handleLongSell",
    );
    invariant(order.assetIn, "assetIn is required for LONG_SELL order");
    invariant(order.amountIn, "amountIn is required for LONG_SELL order");
    invariant(order.assetOut, "assetOut is required for LONG_SELL order");

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
          assetIn: marketConfig.assetB,
          amountIn: BigInt(order.amountIn),
          minimumAmountOut: 1n,
          direction: OrderV2Direction.B_TO_A,
          killOnFailed: false,
          isLimitOrder: false,
        },
      ],
    });
    const validTo = Date.now() + Duration.newMinutes(3).milliseconds;
    txb.validToUnixTime(validTo);

    const { txComplete, txId } = await txb.completeUnsafeForTxChaining({
      coinSelectionAlgorithm: CoinSelectionAlgorithm.SPEND_ALL,
      walletUtxos,
      changeAddress: sender,
      provider: new EmulatorProvider(networkEnv),
    });
    const txRaw = txComplete.complete();
    const ECSL = RustModule.getE;
    const eTx = ECSL.Transaction.from_hex(txRaw);
    safeFreeRustObjects(eTx);

    return {
      txRaw,
      txId: txId,
      validTo,
    };
  };

  /**
   * Build LONG_REPAY transaction: Repay loan to Liqwid and redeem collateral
   * Uses repayLoan API with loanUtxoId format: "{txHash}-{outputIndex}"
   */
  export const handleLongRepay = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, loanTxId, loanOutputIndex, collateralAmount } =
      options;
    invariant(order.orderType === LongOrderType.LONG_REPAY, "Invalid order type for handleLongRepay");
    invariant(order.assetIn, "assetIn is required for LONG_REPAY order");
    invariant(order.amountIn, "amountIn is required for LONG_REPAY order");
    invariant(loanTxId, "loanTxId is required for LONG_REPAY order");
    invariant(loanOutputIndex !== undefined, "loanOutputIndex is required for LONG_REPAY order");
    invariant(collateralAmount, "collateralAmount is required for LONG_REPAY order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    // Format loanUtxoId as "{txHash}-{outputIndex}"
    const loanUtxoId = `${loanTxId}-${loanOutputIndex}`;

    // Format collateral ID as "{MarketId}.{policyId}"
    // assetBQTokenTicker is the market ID (e.g., "MIN")
    // We need the policy ID from assetBQTokenRaw (format: "policyId.assetName" or "policyId")
    const qTokenParts = marketConfig.assetBQTokenRaw.split(".");
    const qTokenPolicyId = qTokenParts[0];
    const collateralId = `${marketConfig.borrowMarketIdLong}.${qTokenPolicyId}`;

    const buildTxResult = await LiqwidProviderV2.Transactions.repayLoan(apiConfig, {
      address: userAddress,
      utxos,
      loanUtxoId,
      collaterals: [
        {
          id: collateralId,
          amount: Number(collateralAmount),
        },
      ],
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build repay transaction: ${buildTxResult.error.message}`);
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

  /**
   * Build LONG_WITHDRAW transaction: Withdraw underlying asset from Liqwid
   * Uses the amountOut from LONG_SUPPLY order as the withdraw amount
   */
  export const handleLongWithdraw = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, supplyAmountOut } = options;
    invariant(order.orderType === LongOrderType.LONG_WITHDRAW, "Invalid order type for handleLongWithdraw");
    invariant(order.assetIn, "assetIn is required for LONG_WITHDRAW order");
    invariant(order.amountIn, "amountIn is required for LONG_WITHDRAW order");
    invariant(supplyAmountOut, "supplyAmountOut is required for LONG_WITHDRAW order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    const buildTxResult = await LiqwidProviderV2.Transactions.withdraw(apiConfig, {
      address: userAddress,
      utxos,
      marketId: marketConfig.longCollateralMarketId as LiqwidProviderV2.MarketId,
      amount: Number(supplyAmountOut),
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build withdraw transaction: ${buildTxResult.error.message}`);
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

  // ============================================================================
  // SHORT Build Functions
  // ============================================================================

  /**
   * Build SHORT_SUPPLY transaction: Supply asset A (ADA) to Liqwid, receive qADA
   */
  export const handleShortSupply = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(order.orderType === ShortOrderType.SHORT_SUPPLY, "Invalid order type for handleShortSupply");
    invariant(order.assetIn, "assetIn is required for SHORT_SUPPLY order");
    invariant(order.amountIn, "amountIn is required for SHORT_SUPPLY order");

    const marketId = marketConfig.shortCollateralMarketId as LiqwidProvider.MarketId;
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

  /**
   * Build SHORT_BORROW transaction: Borrow asset B using qADA as collateral
   */
  export const handleShortBorrow = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, amountBorrow } = options;
    invariant(order.orderType === ShortOrderType.SHORT_BORROW, "Invalid order type for handleShortBorrow");
    invariant(order.assetIn, "assetIn is required for SHORT_BORROW order");
    invariant(order.amountIn, "amountIn is required for SHORT_BORROW order");
    invariant(amountBorrow, "amountBorrow is required for SHORT_BORROW order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    const buildTxResult = await LiqwidProviderV2.Transactions.borrow(apiConfig, {
      address: userAddress,
      utxos,
      marketId: marketConfig.borrowMarketIdShort as LiqwidProviderV2.MarketId,
      amount: Number(amountBorrow),
      collaterals: [
        {
          id: marketConfig.assetAQTokenTicker,
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

  /**
   * Build SHORT_SELL transaction: Sell asset B for asset A via DEX (B_TO_A swap)
   * Reuses the same DEX swap pattern as handleLongSell
   */
  export const handleShortSell = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(order.orderType === ShortOrderType.SHORT_SELL, "Invalid order type for handleShortSell");
    invariant(order.assetIn, "assetIn is required for SHORT_SELL order");
    invariant(order.amountIn, "amountIn is required for SHORT_SELL order");
    invariant(order.assetOut, "assetOut is required for SHORT_SELL order");

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
          assetIn: marketConfig.assetB,
          amountIn: BigInt(order.amountIn),
          minimumAmountOut: 1n,
          direction: OrderV2Direction.B_TO_A,
          killOnFailed: false,
          isLimitOrder: false,
        },
      ],
    });
    const validTo = Date.now() + Duration.newMinutes(3).milliseconds;
    txb.validToUnixTime(validTo);

    const { txComplete, txId } = await txb.completeUnsafeForTxChaining({
      coinSelectionAlgorithm: CoinSelectionAlgorithm.SPEND_ALL,
      walletUtxos,
      changeAddress: sender,
      provider: new EmulatorProvider(networkEnv),
    });
    const txRaw = txComplete.complete();
    const ECSL = RustModule.getE;
    const eTx = ECSL.Transaction.from_hex(txRaw);
    safeFreeRustObjects(eTx);

    return {
      txRaw,
      txId: txId,
      validTo,
    };
  };

  /**
   * Build SHORT_BUY transaction: Buy asset B with asset A via DEX (A_TO_B swap)
   * Reuses the same DEX swap pattern as handleLongBuy
   */
  export const handleShortBuy = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(order.orderType === ShortOrderType.SHORT_BUY, "Invalid order type for handleShortBuy");
    invariant(order.assetIn, "assetIn is required for SHORT_BUY order");
    invariant(order.amountIn, "amountIn is required for SHORT_BUY order");
    invariant(order.assetOut, "assetOut is required for SHORT_BUY order");

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

    const { txComplete, txId } = await txb.completeUnsafeForTxChaining({
      coinSelectionAlgorithm: CoinSelectionAlgorithm.SPEND_ALL,
      walletUtxos,
      changeAddress: sender,
      provider: new EmulatorProvider(networkEnv),
    });
    const txRaw = txComplete.complete();
    const ECSL = RustModule.getE;
    const eTx = ECSL.Transaction.from_hex(txRaw);
    safeFreeRustObjects(eTx);

    return {
      txRaw,
      txId: txId,
      validTo,
    };
  };

  /**
   * Build SHORT_REPAY transaction: Repay asset B loan to Liqwid and redeem qADA collateral
   */
  export const handleShortRepay = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, loanTxId, loanOutputIndex, collateralAmount } =
      options;
    invariant(order.orderType === ShortOrderType.SHORT_REPAY, "Invalid order type for handleShortRepay");
    invariant(order.assetIn, "assetIn is required for SHORT_REPAY order");
    invariant(order.amountIn, "amountIn is required for SHORT_REPAY order");
    invariant(loanTxId, "loanTxId is required for SHORT_REPAY order");
    invariant(loanOutputIndex !== undefined, "loanOutputIndex is required for SHORT_REPAY order");
    invariant(collateralAmount, "collateralAmount is required for SHORT_REPAY order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    // Format loanUtxoId as "{txHash}-{outputIndex}"
    const loanUtxoId = `${loanTxId}-${loanOutputIndex}`;

    // Format collateral ID: use assetAQTokenRaw (qADA) for SHORT
    const qTokenParts = marketConfig.assetAQTokenRaw.split(".");
    const qTokenPolicyId = qTokenParts[0];
    const collateralId = `${marketConfig.borrowMarketIdShort}.${qTokenPolicyId}`;

    const buildTxResult = await LiqwidProviderV2.Transactions.repayLoan(apiConfig, {
      address: userAddress,
      utxos,
      loanUtxoId,
      collaterals: [
        {
          id: collateralId,
          amount: Number(collateralAmount),
        },
      ],
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build repay transaction: ${buildTxResult.error.message}`);
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

  /**
   * Build SHORT_WITHDRAW transaction: Withdraw asset A (ADA) from Liqwid
   */
  export const handleShortWithdraw = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, supplyAmountOut } = options;
    invariant(order.orderType === ShortOrderType.SHORT_WITHDRAW, "Invalid order type for handleShortWithdraw");
    invariant(order.assetIn, "assetIn is required for SHORT_WITHDRAW order");
    invariant(order.amountIn, "amountIn is required for SHORT_WITHDRAW order");
    invariant(supplyAmountOut, "supplyAmountOut is required for SHORT_WITHDRAW order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    const buildTxResult = await LiqwidProviderV2.Transactions.withdraw(apiConfig, {
      address: userAddress,
      utxos,
      marketId: marketConfig.shortCollateralMarketId as LiqwidProviderV2.MarketId,
      amount: Number(supplyAmountOut),
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build withdraw transaction: ${buildTxResult.error.message}`);
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

  // Common waiting result type for all waiting functions
  export type WaitingResult =
    | { isConfirmed: false }
    | {
        isConfirmed: true;
        nextOrderType: LongOrderType | ShortOrderType;
        assetIn: string;
        amountIn: string;
        assetOut: string;
        /** Amount received from this order (to update order.amount_out) */
        amountOut: string;
      }
    | {
        isConfirmed: true;
        isFinal: true;
        positionStatus: PositionStatus;
        /** Amount received from this order (to update order.amount_out) */
        amountOut: string;
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
    /** Loan transaction ID (used for LONG_REPAY to identify the loan) */
    loanTxId?: string;
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
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
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
                  amountOut: amountOut.toString(),
                };
              }

              // For LONG_BUY, transition to LONG_SUPPLY
              return {
                isConfirmed: true,
                nextOrderType: LongOrderType.LONG_SUPPLY,
                assetIn: assetOut.toString(),
                amountIn: amountOut.toString(),
                assetOut: marketConfig.assetBQTokenRaw,
                amountOut: amountOut.toString(),
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

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

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
                amountOut: amountReceived.toString(),
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

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      // Calculate borrow amount: position.amount_in * (leverage - 1)
      const amountBorrow = BigInt(Math.floor(Number(positionAmountIn) * (marketConfig.longLeverage - 1)));

      return {
        isConfirmed: true,
        nextOrderType: LongOrderType.LONG_BUY_MORE,
        assetIn: marketConfig.assetA.toString(),
        amountIn: amountBorrow.toString(),
        assetOut: marketConfig.assetB.toString(),
        amountOut: amountBorrow.toString(),
      };
    }

    return { isConfirmed: false };
  };

  /**
   * Wait for LONG_SELL or LONG_SELL_ALL order output to be spent (consumed by DEX)
   * - For LONG_SELL: prepare the next LONG_REPAY order details
   * - For LONG_SELL_ALL: this is the final step, position becomes CLOSED
   */
  export const waitingLongSell = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, orderOutputIndex, userAddress, cardanoscanProvider, orderType } = options;
    invariant(orderOutputIndex !== undefined, "orderOutputIndex is required for waitingLongSell");

    const userAddressHex = userAddress.toHex();

    // Search for the transaction that spent this UTXO
    const spendingTx = await cardanoscanProvider.findTransactionHasSpent(
      userAddress,
      txHash,
      orderOutputIndex,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (spendingTx) {
      // For LONG_SELL/LONG_SELL_ALL, assetOut is asset A (ADA), so we look for ADA in outputs
      // ADA is represented as "lovelace" in the output value
      for (const output of spendingTx.outputs) {
        if (output.address === userAddressHex) {
          // For ADA, the value is in the output.value field directly
          const amountOut = BigInt(output.value);

          // For LONG_SELL_ALL, this is the final step - position becomes CLOSED
          if (orderType === LongOrderType.LONG_SELL_ALL) {
            return {
              isConfirmed: true,
              isFinal: true,
              positionStatus: PositionStatus.CLOSED,
              amountOut: amountOut.toString(),
            };
          }

          // For LONG_SELL, transition to LONG_REPAY
          return {
            isConfirmed: true,
            nextOrderType: LongOrderType.LONG_REPAY,
            assetIn: marketConfig.assetA.toString(),
            amountIn: amountOut.toString(),
            assetOut: marketConfig.assetBQTokenRaw, // qToken to be redeemed
            amountOut: amountOut.toString(),
          };
        }
      }

      throw new Error(`Order output spent (tx: ${spendingTx.hash}) but could not find matching output for user`);
    }

    return { isConfirmed: false };
  };

  /**
   * Wait for LONG_REPAY transaction to be confirmed
   * and prepare the next LONG_WITHDRAW order details
   */
  export const waitingLongRepay = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider } = options;

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      const userAddressHex = userAddress.toHex();
      const qTokenAsset = Asset.fromString(marketConfig.assetBQTokenRaw);
      const qTokenUnit = qTokenAsset.toBlockFrostString();

      // Find qToken received after repaying (collateral redeemed)
      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === qTokenUnit);
            if (matchingToken) {
              const qTokenAmount = BigInt(matchingToken.value);
              return {
                isConfirmed: true,
                nextOrderType: LongOrderType.LONG_WITHDRAW,
                assetIn: marketConfig.assetBQTokenRaw,
                amountIn: qTokenAmount.toString(),
                assetOut: marketConfig.assetB.toString(),
                amountOut: qTokenAmount.toString(),
              };
            }
          }
        }
      }

      throw new Error(
        `LONG_REPAY tx confirmed (${txHash}) but could not find output with qToken ${marketConfig.assetBQTokenRaw}`,
      );
    }

    return { isConfirmed: false };
  };

  /**
   * Wait for LONG_WITHDRAW transaction to be confirmed
   * and prepare the next LONG_SELL_ALL order details
   */
  export const waitingLongWithdraw = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider } = options;

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      const userAddressHex = userAddress.toHex();
      const assetBUnit = marketConfig.assetB.toBlockFrostString();

      // Find asset B received after withdraw
      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === assetBUnit);
            if (matchingToken) {
              const amountOut = BigInt(matchingToken.value);
              return {
                isConfirmed: true,
                nextOrderType: LongOrderType.LONG_SELL_ALL,
                assetIn: marketConfig.assetB.toString(),
                amountIn: amountOut.toString(),
                assetOut: marketConfig.assetA.toString(),
                amountOut: amountOut.toString(),
              };
            }
          }
        }
      }

      throw new Error(
        `LONG_WITHDRAW tx confirmed (${txHash}) but could not find output with asset ${marketConfig.assetB.toString()}`,
      );
    }

    return { isConfirmed: false };
  };

  // ============================================================================
  // SHORT Waiting Functions
  // ============================================================================

  /**
   * Wait for SHORT_SUPPLY transaction to be confirmed
   * Extract qADA amount and transition to SHORT_BORROW
   */
  export const waitingShortSupply = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider } = options;

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      const userAddressHex = userAddress.toHex();
      const qTokenAsset = Asset.fromString(marketConfig.assetAQTokenRaw);
      const qTokenUnit = qTokenAsset.toBlockFrostString();

      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === qTokenUnit);
            if (matchingToken) {
              const amountReceived = BigInt(matchingToken.value);
              return {
                isConfirmed: true,
                nextOrderType: ShortOrderType.SHORT_BORROW,
                assetIn: marketConfig.assetAQTokenRaw,
                amountIn: amountReceived.toString(),
                assetOut: marketConfig.assetB.toString(),
                amountOut: amountReceived.toString(),
              };
            }
          }
        }
      }

      throw new Error(
        `SHORT_SUPPLY tx confirmed (${txHash}) but could not find output with qToken ${marketConfig.assetAQTokenRaw}`,
      );
    }

    return { isConfirmed: false };
  };

  /**
   * Wait for SHORT_BORROW transaction to be confirmed
   * Calculate borrowed amount and transition to SHORT_SELL
   */
  export const waitingShortBorrow = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider, positionAmountIn } = options;
    invariant(positionAmountIn, "positionAmountIn is required for waitingShortBorrow");

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      const userAddressHex = userAddress.toHex();
      const assetBUnit = marketConfig.assetB.toBlockFrostString();

      // Find asset B (borrowed token) in outputs
      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === assetBUnit);
            if (matchingToken) {
              const amountBorrowed = BigInt(matchingToken.value);
              return {
                isConfirmed: true,
                nextOrderType: ShortOrderType.SHORT_SELL,
                assetIn: marketConfig.assetB.toString(),
                amountIn: amountBorrowed.toString(),
                assetOut: marketConfig.assetA.toString(),
                amountOut: amountBorrowed.toString(),
              };
            }
          }
        }
      }

      throw new Error(
        `SHORT_BORROW tx confirmed (${txHash}) but could not find output with asset ${marketConfig.assetB.toString()}`,
      );
    }

    return { isConfirmed: false };
  };

  /**
   * Wait for SHORT_SELL order output to be spent (consumed by DEX)
   * This is the final opening step — position becomes OPEN
   */
  export const waitingShortSell = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { txHash, orderOutputIndex, userAddress, cardanoscanProvider } = options;
    invariant(orderOutputIndex !== undefined, "orderOutputIndex is required for waitingShortSell");

    const userAddressHex = userAddress.toHex();

    const spendingTx = await cardanoscanProvider.findTransactionHasSpent(
      userAddress,
      txHash,
      orderOutputIndex,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (spendingTx) {
      // SHORT_SELL sells asset B for ADA, so we look for ADA in outputs
      for (const output of spendingTx.outputs) {
        if (output.address === userAddressHex) {
          const amountOut = BigInt(output.value);
          return {
            isConfirmed: true,
            isFinal: true,
            positionStatus: PositionStatus.OPEN,
            amountOut: amountOut.toString(),
          };
        }
      }

      throw new Error(`Order output spent (tx: ${spendingTx.hash}) but could not find matching output for user`);
    }

    return { isConfirmed: false };
  };

  /**
   * Wait for SHORT_BUY order output to be spent (consumed by DEX)
   * Extract asset B received and transition to SHORT_REPAY
   */
  export const waitingShortBuy = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, orderOutputIndex, userAddress, cardanoscanProvider, assetOut } = options;
    invariant(orderOutputIndex !== undefined, "orderOutputIndex is required for waitingShortBuy");
    invariant(assetOut, "assetOut is required for waitingShortBuy");

    const userAddressHex = userAddress.toHex();

    const spendingTx = await cardanoscanProvider.findTransactionHasSpent(
      userAddress,
      txHash,
      orderOutputIndex,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (spendingTx) {
      const assetOutUnit = assetOut.toBlockFrostString();

      for (const output of spendingTx.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === assetOutUnit);
            if (matchingToken) {
              const amountOut = BigInt(matchingToken.value);
              return {
                isConfirmed: true,
                nextOrderType: ShortOrderType.SHORT_REPAY,
                assetIn: assetOut.toString(),
                amountIn: amountOut.toString(),
                assetOut: marketConfig.assetAQTokenRaw, // qADA to be redeemed
                amountOut: amountOut.toString(),
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
   * Wait for SHORT_REPAY transaction to be confirmed
   * Extract redeemed qADA and transition to SHORT_WITHDRAW
   */
  export const waitingShortRepay = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider } = options;

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      const userAddressHex = userAddress.toHex();
      const qTokenAsset = Asset.fromString(marketConfig.assetAQTokenRaw);
      const qTokenUnit = qTokenAsset.toBlockFrostString();

      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === qTokenUnit);
            if (matchingToken) {
              const qTokenAmount = BigInt(matchingToken.value);
              return {
                isConfirmed: true,
                nextOrderType: ShortOrderType.SHORT_WITHDRAW,
                assetIn: marketConfig.assetAQTokenRaw,
                amountIn: qTokenAmount.toString(),
                assetOut: marketConfig.assetA.toString(),
                amountOut: qTokenAmount.toString(),
              };
            }
          }
        }
      }

      throw new Error(
        `SHORT_REPAY tx confirmed (${txHash}) but could not find output with qToken ${marketConfig.assetAQTokenRaw}`,
      );
    }

    return { isConfirmed: false };
  };

  /**
   * Wait for SHORT_WITHDRAW transaction to be confirmed
   * This is the final closing step — position becomes CLOSED
   */
  export const waitingShortWithdraw = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { txHash, userAddress, cardanoscanProvider } = options;

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      const userAddressHex = userAddress.toHex();

      // For SHORT_WITHDRAW, we withdraw ADA — look for ADA value in outputs
      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          const amountOut = BigInt(output.value);
          return {
            isConfirmed: true,
            isFinal: true,
            positionStatus: PositionStatus.CLOSED,
            amountOut: amountOut.toString(),
          };
        }
      }

      throw new Error(`SHORT_WITHDRAW tx confirmed (${txHash}) but could not find output for user ${userAddressHex}`);
    }

    return { isConfirmed: false };
  };

  /** Map of order types to their build transaction functions */
  export const MAP_BUILD_TX_FN: Record<string, (options: HandleBuildTxOptions) => Promise<BuiltResult>> = {
    [LongOrderType.LONG_BUY]: handleLongBuy,
    [LongOrderType.LONG_SUPPLY]: handleLongSupply,
    [LongOrderType.LONG_BORROW]: handleLongBorrow,
    [LongOrderType.LONG_BUY_MORE]: handleLongBuy,
    [LongOrderType.LONG_SELL]: handleLongSell,
    [LongOrderType.LONG_REPAY]: handleLongRepay,
    [LongOrderType.LONG_WITHDRAW]: handleLongWithdraw,
    [LongOrderType.LONG_SELL_ALL]: handleLongSell,
    [ShortOrderType.SHORT_SUPPLY]: handleShortSupply,
    [ShortOrderType.SHORT_BORROW]: handleShortBorrow,
    [ShortOrderType.SHORT_SELL]: handleShortSell,
    [ShortOrderType.SHORT_BUY]: handleShortBuy,
    [ShortOrderType.SHORT_REPAY]: handleShortRepay,
    [ShortOrderType.SHORT_WITHDRAW]: handleShortWithdraw,
  };

  /** Map of order types to their waiting functions */
  export const MAP_WAITING_FN: Record<string, (options: WaitingOptions) => Promise<WaitingResult>> = {
    [LongOrderType.LONG_BUY]: waitingLongBuy,
    [LongOrderType.LONG_SUPPLY]: waitingLongSupply,
    [LongOrderType.LONG_BORROW]: waitingLongBorrow,
    [LongOrderType.LONG_BUY_MORE]: waitingLongBuy, // Reuse waitingLongBuy
    [LongOrderType.LONG_SELL]: waitingLongSell,
    [LongOrderType.LONG_REPAY]: waitingLongRepay,
    [LongOrderType.LONG_WITHDRAW]: waitingLongWithdraw,
    [LongOrderType.LONG_SELL_ALL]: waitingLongSell,
    [ShortOrderType.SHORT_SUPPLY]: waitingShortSupply,
    [ShortOrderType.SHORT_BORROW]: waitingShortBorrow,
    [ShortOrderType.SHORT_SELL]: waitingShortSell,
    [ShortOrderType.SHORT_BUY]: waitingShortBuy,
    [ShortOrderType.SHORT_REPAY]: waitingShortRepay,
    [ShortOrderType.SHORT_WITHDRAW]: waitingShortWithdraw,
  };
}
