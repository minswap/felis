import { DEXOrderTransaction } from "@minswap/felis-build-tx";
import { DexVersion, OrderV2Direction, OrderV2StepType } from "@minswap/felis-dex-v2";
import { Address, Asset, getTimeFromSlotMagic, type NetworkEnvironment, Utxo } from "@minswap/felis-ledger-core";
import { Duration, Maybe, RustModule, safeFreeRustObjects } from "@minswap/felis-ledger-utils";
import { LiqwidProvider, LiqwidProviderV2 } from "@minswap/felis-lending-market";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@minswap/felis-tx-builder";
import invariant from "@minswap/tiny-invariant";
import type { MarketConfig } from "../config";
import { DEFAULT_DENOMINATOR, ERROR_BUILD_TX_CODE, REPAY_MIN_VALUE_THRESHOLD_NUM } from "../constants";
import { CardanoscanProvider } from "../provider";
import type { KupoService } from "../provider/kupo";
import { logger } from "../utils";
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
    LONG_REPAY_FRACTION = "LONG_REPAY_FRACTION",
    LONG_WITHDRAW_FRACTION = "LONG_WITHDRAW_FRACTION",
    LONG_SELL_FREED = "LONG_SELL_FREED",
    LONG_WITHDRAW = "LONG_WITHDRAW",
    LONG_SELL_ALL = "LONG_SELL_ALL",
  }

  export enum ShortOrderType {
    SHORT_SUPPLY = "SHORT_SUPPLY",
    SHORT_BORROW = "SHORT_BORROW",
    SHORT_SELL = "SHORT_SELL",
    SHORT_BUY = "SHORT_BUY",
    SHORT_REPAY = "SHORT_REPAY",
    SHORT_REPAY_FRACTION = "SHORT_REPAY_FRACTION",
    SHORT_WITHDRAW_FRACTION = "SHORT_WITHDRAW_FRACTION",
    SHORT_BUY_FREED = "SHORT_BUY_FREED",
    SHORT_WITHDRAW = "SHORT_WITHDRAW",
    SHORT_SELL_ALL = "SHORT_SELL_ALL",
  }

  export type BuiltResult = {
    txRaw: string;
    txId: string;
    validTo: number;
    /** When set, position-service should switch from fractional to full repay flow */
    redirectToFullRepay?: {
      /** The order type to update (e.g. SHORT_REPAY) */
      targetOrderType: string;
      /** Amount in for the full repay order */
      amountIn: string;
      /** Asset in for the full repay order */
      assetIn: string;
      /** Expected output asset for the full repay order */
      assetOut: string;
      /** Fractional order types to delete */
      deleteOrderTypes: string[];
    };
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
    /** Loan transaction ID (used for SHORT_REPAY to identify the loan) */
    loanTxId?: string;
    /** Loan output index (used for SHORT_REPAY) */
    loanOutputIndex?: number;
    /** Collateral qToken amount (used for SHORT_REPAY to redeem collateral) */
    collateralAmount?: string;
    /** Kupo service for querying user wallet balance */
    kupoService: KupoService;
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

  const checkLongRepayFunds = async (
    networkEnv: NetworkEnvironment,
    userAddress: string,
    marketConfig: MarketConfig,
    availableADA: number,
  ): Promise<{ canFullRepay: boolean; canRepay: boolean; loan: LiqwidProviderV2.Loan; loanAmount: bigint }> => {
    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);
    const userAddr = Address.fromBech32(userAddress);
    const pkh = userAddr.toPubKeyHash()?.keyHash.hex;
    invariant(pkh, "Failed to extract public key hash from user address");
    const loansResult = await LiqwidProviderV2.Data.loansForUser(apiConfig, [pkh]);
    if (loansResult.type === "err") {
      throw new Error(`Failed to fetch loans before repay: ${loansResult.error.message}`);
    }
    const loan = loansResult.value.find((l) => l.marketId === marketConfig.borrowMarketIdLong);
    invariant(loan, `No active loan found for market ${marketConfig.borrowMarketIdLong}`);
    const loanAmount = BigInt(Math.round(loan.amount * 1_000_000));
    const canFullRepay = BigInt(availableADA) >= loanAmount;

    let canRepay = true;
    const marketsResult = await LiqwidProviderV2.Data.markets(apiConfig, {
      ids: [marketConfig.borrowMarketIdLong],
    });
    if (marketsResult.type === "ok" && marketsResult.value.results.length > 0) {
      const liqwidMarket = marketsResult.value.results[0];
      const minValueRaw = BigInt(Math.round(liqwidMarket.parameters.minValue * 1_000_000));
      const minThreshold = (minValueRaw * REPAY_MIN_VALUE_THRESHOLD_NUM) / DEFAULT_DENOMINATOR;
      if (!canFullRepay && loanAmount <= minThreshold) {
        canRepay = false;
      }
    }

    return { canFullRepay, canRepay, loan, loanAmount };
  };

  /**
   * Build LONG_REPAY transaction: Full repay — pay off entire loan and redeem all collateral.
   * Only called when waitingLongSell / waitingLongSellFreed confirmed canFullRepay = true.
   * Fetches loan from Liqwid API to get current UTXO and collateral info.
   */
  export const handleLongRepay = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, kupoService } = options;
    invariant(order.orderType === LongOrderType.LONG_REPAY, "Invalid order type for handleLongRepay");
    invariant(order.assetIn, "assetIn is required for LONG_REPAY order");
    invariant(order.amountIn, "amountIn is required for LONG_REPAY order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    // Fetch current loan from API (always up-to-date)
    const userAddr = Address.fromBech32(userAddress);
    const pkh = userAddr.toPubKeyHash()?.keyHash.hex;
    invariant(pkh, "Failed to extract public key hash from user address");
    const loansResult = await LiqwidProviderV2.Data.loansForUser(apiConfig, [pkh]);
    if (loansResult.type === "err") {
      throw new Error(`Failed to fetch loans for full repay: ${loansResult.error.message}`);
    }
    const loan = loansResult.value.find((l) => l.marketId === marketConfig.borrowMarketIdLong);
    invariant(loan, `No active loan found for market ${marketConfig.borrowMarketIdLong}`);

    // Check if the user has enough ADA in wallet to cover the full debt
    const loanAmountRaw = BigInt(Math.round(loan.amount * 1_000_000));
    const walletBalance = await kupoService.getBalanceOfPubKeyAddress(userAddress);
    const availableAda = walletBalance.get(marketConfig.assetA);
    if (availableAda < loanAmountRaw) {
      throw new Error(ERROR_BUILD_TX_CODE.ERROR_CANNOT_REPAY);
    }

    const loanUtxoId = `${loan.transactionId}-${loan.transactionIndex}`;

    // Format collateral ID as "{MarketId}.{policyId}"
    const qTokenParts = marketConfig.assetBQTokenRaw.split(".");
    const qTokenPolicyId = qTokenParts[0];
    const collateralId = `${marketConfig.borrowMarketIdLong}.${qTokenPolicyId}`;

    const qTokenAmountFloat = loan.collaterals[0]?.qTokenAmount;
    invariant(qTokenAmountFloat !== undefined, "Loan has no collateral");
    const qTokenAmountRaw = Math.round(qTokenAmountFloat * 1_000_000);

    logger.info("handleLongRepay: full repay", {
      loanId: loan.id,
      loanAmount: loan.amount,
      qTokenAmountRaw,
      loanUtxoId,
    });

    const buildTxResult = await LiqwidProviderV2.Transactions.repayLoan(apiConfig, {
      address: userAddress,
      utxos,
      loanUtxoId,
      collaterals: [
        {
          id: collateralId,
          amount: qTokenAmountRaw,
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

  // ============================================================================
  // FRACTIONAL LONG REPAY FLOW
  // ============================================================================
  //
  // Triggered when LONG_SELL output (ADA received) < current loan amount.
  //
  // Full cycle until position is fully closed:
  //
  //   LONG_SELL
  //      │ (ADA received < loan)
  //      ▼
  //   LONG_REPAY_FRACTION  ──── modifyBorrow(newDebt, reducedCollateral, redeemCollateral=true)
  //      │
  //      ▼
  //   LONG_WITHDRAW_FRACTION ── withdraw freed qTokens → assetB
  //      │
  //      ▼
  //   LONG_SELL_FREED  ────────── sell freed assetB → ADA
  //      │
  //      ├── accumulated ADA < remaining loan? ──► loop back to LONG_REPAY_FRACTION
  //      │
  //      └── accumulated ADA >= remaining loan? ──► LONG_REPAY (full repay)
  //                                                       │
  //                                                  LONG_WITHDRAW
  //                                                       │
  //                                                  LONG_SELL_ALL
  //
  // Key constraints:
  //   1. newDebt = currentDebt - partialRepayAmount, must satisfy newDebt >= market.parameters.minValue.
  //      If loanAmount - availableADA < minValue, target newDebt = minValue instead
  //      (repay less this round so the position stays legal), then on the next
  //      LONG_SELL_FREED the remaining minValue will be fully repayable.
  //   2. newCollateral is proportionally reduced:
  //      newCollateral = floor(totalCollateral * newDebt / currentDebt)
  //   3. The loan UTXO ID changes after each modifyBorrow. Handlers fetch the current
  //      loan from the Liqwid API (always up-to-date).
  //   4. Decision to enter fractional flow is made in waitingLongSell / waitingLongSellFreed
  //      (each function does only one thing: handleLongRepay = full repay only).
  // ============================================================================

  /**
   * Build LONG_REPAY_FRACTION: Partial debt repay via modifyBorrow.
   * Self-contained — fetches current loan from Liqwid API.
   * Reduces debt by available ADA while keeping full collateral unchanged.
   * Step 2 (LONG_WITHDRAW_FRACTION) reduces collateral proportionally in a separate tx.
   */
  export const handleLongRepayFraction = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, kupoService } = options;
    invariant(order.orderType === LongOrderType.LONG_REPAY_FRACTION, "Invalid order type for handleLongRepayFraction");
    invariant(order.assetIn, "assetIn is required for LONG_REPAY_FRACTION order");
    invariant(order.amountIn, "amountIn (ADA available to repay) is required for LONG_REPAY_FRACTION order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    // Fetch current loan from API (always up-to-date, even after prior modifyBorrow calls)
    const userAddr = Address.fromBech32(userAddress);
    const pkh = userAddr.toPubKeyHash()?.keyHash.hex;
    invariant(pkh, "Failed to extract public key hash from user address");
    const loansResult = await LiqwidProviderV2.Data.loansForUser(apiConfig, [pkh]);
    if (loansResult.type === "err") {
      throw new Error(`Failed to fetch loans for partial repay: ${loansResult.error.message}`);
    }
    const loan = loansResult.value.find((l) => l.marketId === marketConfig.borrowMarketIdLong);
    invariant(loan, `No active loan found for market ${marketConfig.borrowMarketIdLong}`);

    const loanUtxoId = `${loan.transactionId}-${loan.transactionIndex}`;

    // Fetch market to get minimum borrow amount constraint.
    const marketResult = await LiqwidProviderV2.Data.market(
      apiConfig,
      marketConfig.borrowMarketIdLong as LiqwidProviderV2.MarketId,
    );
    if (marketResult.type === "err") {
      throw new Error(`Failed to fetch market for partial repay: ${marketResult.error.message}`);
    }
    invariant(marketResult.value, `Market ${marketConfig.borrowMarketIdLong} not found`);
    const minValueLovelace = Math.round(marketResult.value.parameters.minValue * 1_000_000); // ADA → Lovelace

    // loan.amount is in ADA (float); convert to Lovelace to match order.amountIn and API expectations.
    const currentDebtLovelace = Math.round(loan.amount * 1_000_000);
    const availableLovelace = Number(order.amountIn); // already in Lovelace

    // Query wallet balance via Kupo — if wallet has enough ADA, build full repay tx instead
    const walletBalance = await kupoService.getBalanceOfPubKeyAddress(userAddress);
    const walletAda = walletBalance.get(marketConfig.assetA);
    if (walletAda >= BigInt(currentDebtLovelace)) {
      logger.info("handleLongRepayFraction: wallet has enough for full repay, redirecting", {
        walletAda: walletAda.toString(),
        currentDebtLovelace,
      });
      const fullRepayResult = await handleLongRepay({
        ...options,
        order: { ...order, orderType: LongOrderType.LONG_REPAY, amountIn: walletAda.toString() },
      });
      return {
        ...fullRepayResult,
        redirectToFullRepay: {
          targetOrderType: LongOrderType.LONG_REPAY,
          amountIn: walletAda.toString(),
          assetIn: marketConfig.assetA.toString(),
          assetOut: marketConfig.assetBQTokenRaw,
          deleteOrderTypes: [
            LongOrderType.LONG_REPAY_FRACTION,
            LongOrderType.LONG_WITHDRAW_FRACTION,
            LongOrderType.LONG_SELL_FREED,
          ],
        },
      };
    }

    const qTokenAmountFloat = loan.collaterals[0]?.qTokenAmount;
    invariant(qTokenAmountFloat !== undefined, "Loan has no collateral — cannot compute partial repay");
    // qTokenAmount from API is human-readable (divided by 10^6), convert to raw on-chain amount
    const qTokenAmountRaw = Math.round(qTokenAmountFloat * 1_000_000);

    // Remaining debt must stay >= minValue so the position stays protocol-legal.
    const newDebt = Math.max(currentDebtLovelace - availableLovelace, minValueLovelace);

    // Check: both the repay amount AND remaining debt must be >= minValue.
    const repayAmount = currentDebtLovelace - newDebt;
    if (repayAmount < minValueLovelace || (availableLovelace < currentDebtLovelace && newDebt < minValueLovelace)) {
      throw new Error(ERROR_BUILD_TX_CODE.ERROR_CANNOT_REPAY);
    }

    logger.info("handleLongRepayFraction", {
      currentDebtLovelace,
      availableLovelace,
      minValueLovelace,
      qTokenAmountRaw,
      newDebt,
      loanId: loan.id,
    });

    const qTokenParts = marketConfig.assetBQTokenRaw.split(".");
    const qTokenPolicyId = qTokenParts[0];
    const collateralId = `${marketConfig.borrowMarketIdLong}.${qTokenPolicyId}`;

    // Step 1 of fractional close: reduce debt only, keep FULL collateral unchanged.
    // Step 2 (LONG_WITHDRAW_FRACTION) will reduce collateral proportionally in a separate tx.
    const buildTxResult = await LiqwidProviderV2.Transactions.repayLoanFraction(apiConfig, {
      address: userAddress,
      utxos,
      loanUtxoId,
      amount: newDebt,
      collaterals: [{ id: collateralId, amount: qTokenAmountRaw }],
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build repay-fraction transaction: ${buildTxResult.error.message}`);
    }

    const txRaw = buildTxResult.value;
    const ECSL = RustModule.getE;
    const eTx = ECSL.Transaction.from_hex(txRaw);
    const txBody = eTx.body();
    const ttl = txBody.ttl();
    safeFreeRustObjects(eTx, txBody);

    // Liqwid may build repay-fraction tx without TTL; default to 3 minutes
    const validTo = Maybe.isJust(ttl) ? getTimeFromSlotMagic(networkEnv, ttl) : new Date(Date.now() + 3 * 60 * 1000);
    const txId = LiqwidProviderV2.getTxHash(txRaw);

    return { txRaw, txId, validTo: validTo.getTime() };
  };

  /**
   * Wait for LONG_REPAY_FRACTION tx confirmation.
   *
   * LONG_REPAY_FRACTION is a Liqwid modifyBorrow tx that reduces debt while keeping
   * full collateral. No tokens are returned to the user (ADA is consumed as repayment).
   *
   * On confirmation → transition to LONG_WITHDRAW_FRACTION:
   *   amountIn = originalDebtLovelace (for proportional collateral calc in handleLongWithdrawFraction)
   */
  export const waitingLongRepayFraction = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider, originalDebtLovelace } = options;
    invariant(originalDebtLovelace, "originalDebtLovelace is required for waitingLongRepayFraction");

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      // LONG_REPAY_FRACTION has no output (ADA consumed as repayment) → no amountOut
      return {
        isConfirmed: true,
        nextOrderType: LongOrderType.LONG_WITHDRAW_FRACTION,
        assetIn: marketConfig.assetA.toString(), // placeholder (handler fetches loan from API)
        amountIn: originalDebtLovelace, // original debt for proportional collateral calc
        assetOut: marketConfig.assetB.toString(), // asset B will be received after withdraw
      };
    }

    return { isConfirmed: false };
  };

  /**
   * Build LONG_WITHDRAW_FRACTION: Reduce collateral via modifyBorrow after a partial repay.
   * Keeps the same debt level, reduces collateral proportionally, and redeems freed qTokens
   * to the underlying asset (sent to wallet for selling in LONG_SELL_FREED).
   */
  export const handleLongWithdrawFraction = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(
      order.orderType === LongOrderType.LONG_WITHDRAW_FRACTION,
      "Invalid order type for handleLongWithdrawFraction",
    );

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    // Fetch current loan state (after LONG_REPAY_FRACTION: debt reduced, collateral unchanged)
    const userAddr = Address.fromBech32(userAddress);
    const pkh = userAddr.toPubKeyHash()?.keyHash.hex;
    invariant(pkh, "Failed to extract public key hash from user address");
    const loansResult = await LiqwidProviderV2.Data.loansForUser(apiConfig, [pkh]);
    if (loansResult.type === "err") {
      throw new Error(`Failed to fetch loans for withdraw fraction: ${loansResult.error.message}`);
    }
    const loan = loansResult.value.find((l) => l.marketId === marketConfig.borrowMarketIdLong);
    invariant(loan, `No active loan found for market ${marketConfig.borrowMarketIdLong}`);

    // Use loan UTXO info from the API (always up-to-date after modifyBorrow calls)
    const loanUtxoId = `${loan.transactionId}-${loan.transactionIndex}`;

    const currentDebtLovelace = Math.round(loan.amount * 1_000_000);
    const qTokenAmountFloat = loan.collaterals[0]?.qTokenAmount;
    invariant(qTokenAmountFloat !== undefined, "Loan has no collateral");
    const qTokenAmountRaw = Math.round(qTokenAmountFloat * 1_000_000);

    // Fetch market to compute proportional collateral based on original debt ratio.
    // order.amountIn stores the original debt (before LONG_REPAY_FRACTION) for proportional calc.
    const originalDebtLovelace = order.amountIn ? Number(order.amountIn) : currentDebtLovelace;
    const proportionalCollateral = Math.floor(qTokenAmountRaw * (currentDebtLovelace / originalDebtLovelace));

    logger.info("handleLongWithdrawFraction", {
      currentDebtLovelace,
      originalDebtLovelace,
      qTokenAmountRaw,
      proportionalCollateral,
      freedCollateral: qTokenAmountRaw - proportionalCollateral,
      loanId: loan.id,
    });

    const qTokenParts = marketConfig.assetBQTokenRaw.split(".");
    const qTokenPolicyId = qTokenParts[0];
    const collateralId = `${marketConfig.borrowMarketIdLong}.${qTokenPolicyId}`;

    // Step 2: keep same debt, reduce collateral proportionally, redeem freed qTokens to underlying.
    const buildTxResult = await LiqwidProviderV2.Transactions.repayLoanFraction(apiConfig, {
      address: userAddress,
      utxos,
      loanUtxoId,
      amount: currentDebtLovelace,
      collaterals: [{ id: collateralId, amount: proportionalCollateral }],
      redeemCollateral: true,
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build withdraw-fraction transaction: ${buildTxResult.error.message}`);
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

    return { txRaw, txId, validTo: validTo.getTime() };
  };

  /**
   * Wait for LONG_WITHDRAW_FRACTION tx confirmation.
   * Finds asset B received (freed collateral redeemed to underlying) and transitions to LONG_SELL_FREED.
   */
  export const waitingLongWithdrawFraction = async (options: WaitingOptions): Promise<WaitingResult> => {
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

      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          if (output.tokens && output.tokens.length > 0) {
            const matchingToken = output.tokens.find((token) => token.assetId === assetBUnit);
            if (matchingToken) {
              const amountOut = BigInt(matchingToken.value);
              return {
                isConfirmed: true,
                nextOrderType: LongOrderType.LONG_SELL_FREED,
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
        `LONG_WITHDRAW_FRACTION tx confirmed (${txHash}) but could not find output with asset ${marketConfig.assetB.toString()}`,
      );
    }

    return { isConfirmed: false };
  };

  /**
   * Build LONG_SELL_FREED: Sell freed assetB for ADA. Same DEX swap as handleLongSell.
   */
  export const handleLongSellFreed = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    invariant(options.order.orderType === LongOrderType.LONG_SELL_FREED, "Invalid order type for handleLongSellFreed");
    return handleLongSell({ ...options, order: { ...options.order, orderType: LongOrderType.LONG_SELL } });
  };

  /**
   * Wait for LONG_SELL_FREED order output to be spent (DEX consumed).
   *
   * On confirmation, transitions to LONG_REPAY (full repay) with the ADA received.
   * The LONG_REPAY handler will check if funds are sufficient; if not, it will
   * trigger another fractional cycle automatically.
   */
  export const waitingLongSellFreed = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, orderOutputIndex, userAddress, cardanoscanProvider, networkEnv } = options;
    invariant(orderOutputIndex !== undefined, "orderOutputIndex is required for waitingLongSellFreed");

    const userAddressHex = userAddress.toHex();

    const spendingTx = await cardanoscanProvider.findTransactionHasSpent(
      userAddress,
      txHash,
      orderOutputIndex,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (spendingTx) {
      for (const output of spendingTx.outputs) {
        if (output.address === userAddressHex) {
          const amountOut = BigInt(output.value);

          // Check if we now have enough ADA to fully repay the remaining loan.
          const { canFullRepay, canRepay, loanAmount } = await checkLongRepayFunds(
            networkEnv,
            userAddress.bech32,
            marketConfig,
            Number(amountOut),
          );

          logger.info("waitingLongSellFreed: repay check", {
            available: amountOut.toString(),
            loanAmount: loanAmount.toString(),
            canFullRepay,
            canRepay,
          });

          if (!canRepay) {
            throw new Error(ERROR_BUILD_TX_CODE.ERROR_CANNOT_REPAY);
          }

          if (canFullRepay) {
            // Enough ADA → transition to existing LONG_REPAY (from closePosition)
            return {
              isConfirmed: true,
              nextOrderType: LongOrderType.LONG_REPAY,
              assetIn: marketConfig.assetA.toString(),
              amountIn: amountOut.toString(),
              assetOut: marketConfig.assetBQTokenRaw,
              amountOut: amountOut.toString(),
            };
          }

          // Still not enough → loop: create another fractional cycle
          return {
            isConfirmed: true,
            nextOrderType: LongOrderType.LONG_REPAY_FRACTION,
            assetIn: marketConfig.assetA.toString(),
            amountIn: amountOut.toString(),
            assetOut: marketConfig.assetA.toString(),
            amountOut: amountOut.toString(),
            additionalOrders: [
              { orderType: LongOrderType.LONG_REPAY_FRACTION },
              { orderType: LongOrderType.LONG_WITHDRAW_FRACTION },
              { orderType: LongOrderType.LONG_SELL_FREED },
            ],
            originalDebtLovelace: loanAmount.toString(),
          };
        }
      }

      throw new Error(`LONG_SELL_FREED output spent (tx: ${spendingTx.hash}) but could not find ADA output for user`);
    }

    return { isConfirmed: false };
  };

  /**
   * Build LONG_WITHDRAW transaction: Withdraw underlying asset from Liqwid
   * Uses the amountOut from LONG_SUPPLY order as the withdraw amount
   */
  export const handleLongWithdraw = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(order.orderType === LongOrderType.LONG_WITHDRAW, "Invalid order type for handleLongWithdraw");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);
    const marketId = marketConfig.longCollateralMarketId as LiqwidProviderV2.MarketId;

    // Get current qToken balance from UTxOs (may differ from original supply after fractional cycles)
    const qTokenAsset = Asset.fromString(marketConfig.assetBQTokenRaw);
    let qTokenBalance = 0n;
    for (const utxoHex of utxos) {
      const utxo = Utxo.fromHex(utxoHex);
      const amount = utxo.output.value.get(qTokenAsset);
      if (amount > 0n) {
        qTokenBalance += amount;
      }
    }
    invariant(qTokenBalance > 0n, "No qToken balance found in user UTxOs for LONG_WITHDRAW");

    // Convert qToken amount to underlying amount via market exchange rate
    const marketResult = await LiqwidProviderV2.Data.market(apiConfig, marketId);
    if (marketResult.type === "err") {
      throw new Error(`Failed to fetch market data: ${marketResult.error.message}`);
    }
    const market = marketResult.value;
    invariant(market, `Market ${marketId} not found`);
    const withdrawAmount = Math.floor(Number(qTokenBalance) * market.exchangeRate);

    logger.info("handleLongWithdraw", {
      qTokenBalance: qTokenBalance.toString(),
      exchangeRate: market.exchangeRate,
      withdrawAmount,
    });

    const buildTxResult = await LiqwidProviderV2.Transactions.withdraw(apiConfig, {
      address: userAddress,
      utxos,
      marketId,
      amount: withdrawAmount,
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
    invariant(
      order.orderType === ShortOrderType.SHORT_SELL || order.orderType === ShortOrderType.SHORT_SELL_ALL,
      "Invalid order type for handleShortSell",
    );
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

  const checkShortRepayFunds = async (
    networkEnv: NetworkEnvironment,
    userAddress: string,
    marketConfig: MarketConfig,
    availableAssetB: number,
  ): Promise<{
    canFullRepay: boolean;
    canRepay: boolean;
    loan: LiqwidProviderV2.Loan;
    loanAmountRaw: bigint;
  }> => {
    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);
    const userAddr = Address.fromBech32(userAddress);
    const pkh = userAddr.toPubKeyHash()?.keyHash.hex;
    invariant(pkh, "Failed to extract public key hash from user address");
    const loansResult = await LiqwidProviderV2.Data.loansForUser(apiConfig, [pkh]);
    if (loansResult.type === "err") {
      throw new Error(`Failed to fetch loans before short repay: ${loansResult.error.message}`);
    }
    const loan = loansResult.value.find((l) => l.marketId === marketConfig.borrowMarketIdShort);
    invariant(loan, `No active loan found for market ${marketConfig.borrowMarketIdShort}`);
    const loanAmountRaw = BigInt(Math.round(loan.amount * 1_000_000));
    const canFullRepay = BigInt(availableAssetB) >= loanAmountRaw;

    // Fetch Liqwid market minValue to check if repay is possible
    // Liqwid requires: repay >= minValue AND remaining debt >= minValue (or full repay)
    // If debt <= minValue * REPAY_MIN_VALUE_THRESHOLD_NUM / DEFAULT_DENOMINATOR, neither full nor fractional repay is possible without more funds
    const marketsResult = await LiqwidProviderV2.Data.markets(apiConfig, {
      ids: [marketConfig.borrowMarketIdShort],
    });
    let canRepay = true;
    if (marketsResult.type === "ok" && marketsResult.value.results.length > 0) {
      const liqwidMarket = marketsResult.value.results[0];
      const minValueRaw = BigInt(Math.round(liqwidMarket.parameters.minValue * 1_000_000));
      // Threshold: debt must be > minValue * multiplier for fractional repay to work
      // (repay portion >= minValue AND leftover >= minValue)
      const minThreshold = (minValueRaw * REPAY_MIN_VALUE_THRESHOLD_NUM) / DEFAULT_DENOMINATOR;

      if (!canFullRepay && loanAmountRaw <= minThreshold) {
        canRepay = false;
      }
    }

    return { canFullRepay, canRepay, loan, loanAmountRaw };
  };

  /**
   * Build SHORT_REPAY transaction: Full repay — pay off entire loan and redeem all collateral.
   * Fetches loan from Liqwid API to get current UTXO and collateral info.
   */
  export const handleShortRepay = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, kupoService } = options;
    invariant(order.orderType === ShortOrderType.SHORT_REPAY, "Invalid order type for handleShortRepay");
    invariant(order.assetIn, "assetIn is required for SHORT_REPAY order");
    invariant(order.amountIn, "amountIn is required for SHORT_REPAY order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    // Fetch current loan from API (always up-to-date, even after modifyBorrow)
    const userAddr = Address.fromBech32(userAddress);
    const pkh = userAddr.toPubKeyHash()?.keyHash.hex;
    invariant(pkh, "Failed to extract public key hash from user address");
    const loansResult = await LiqwidProviderV2.Data.loansForUser(apiConfig, [pkh]);
    if (loansResult.type === "err") {
      throw new Error(`Failed to fetch loans for full repay: ${loansResult.error.message}`);
    }
    const loan = loansResult.value.find((l) => l.marketId === marketConfig.borrowMarketIdShort);
    invariant(loan, `No active loan found for market ${marketConfig.borrowMarketIdShort}`);

    // Check if the user has enough asset B in wallet to cover the full debt
    const loanAmountRaw = BigInt(Math.round(loan.amount * 1_000_000));
    const walletBalance = await kupoService.getBalanceOfPubKeyAddress(userAddress);
    const availableRaw = walletBalance.get(marketConfig.assetB);
    if (availableRaw < loanAmountRaw) {
      throw new Error(ERROR_BUILD_TX_CODE.ERROR_CANNOT_REPAY);
    }

    const loanUtxoId = `${loan.transactionId}-${loan.transactionIndex}`;

    const collateral = loan.collaterals[0];
    invariant(collateral, "Loan has no collateral");
    invariant(collateral.market, "Loan collateral has no market info");
    const qTokenAmountRaw = Math.round(collateral.qTokenAmount * 1_000_000);
    const collateralId = `${collateral.market.id}.${collateral.id}`;

    logger.info("handleShortRepay: full repay", {
      loanId: loan.id,
      loanAmount: loan.amount,
      qTokenAmountRaw,
      loanUtxoId,
      collateralId,
    });

    const buildTxResult = await LiqwidProviderV2.Transactions.repayLoan(apiConfig, {
      address: userAddress,
      utxos,
      loanUtxoId,
      collaterals: [
        {
          id: collateralId,
          amount: qTokenAmountRaw,
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

  // ============================================================================
  // FRACTIONAL SHORT REPAY FLOW
  // ============================================================================
  //
  // Triggered when SHORT_BUY output (asset B received) < current loan amount.
  //
  // Full cycle until position is fully closed:
  //
  //   SHORT_BUY
  //      │ (asset B received < loan)
  //      ▼
  //   SHORT_REPAY_FRACTION  ──── modifyBorrow(newDebt, keepCollateral)
  //      │
  //      ▼
  //   SHORT_WITHDRAW_FRACTION ── modifyBorrow(sameDebt, reducedCollateral, redeemCollateral=true) → ADA
  //      │
  //      ▼
  //   SHORT_BUY_FREED  ────────── buy asset B with freed ADA (A_TO_B swap)
  //      │
  //      ├── asset B received < remaining loan? ──► loop back to SHORT_REPAY_FRACTION
  //      │
  //      └── asset B received >= remaining loan? ──► SHORT_REPAY (full repay)
  //                                                       │
  //                                                  SHORT_WITHDRAW
  // ============================================================================

  /**
   * Build SHORT_REPAY_FRACTION: Partial debt repay via modifyBorrow.
   * Self-contained — fetches current loan from Liqwid API.
   * Reduces debt by available asset B while keeping full collateral (qADA) unchanged.
   * Step 2 (SHORT_WITHDRAW_FRACTION) reduces collateral proportionally in a separate tx.
   */
  export const handleShortRepayFraction = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos, kupoService } = options;
    invariant(
      order.orderType === ShortOrderType.SHORT_REPAY_FRACTION,
      "Invalid order type for handleShortRepayFraction",
    );
    invariant(order.assetIn, "assetIn is required for SHORT_REPAY_FRACTION order");
    invariant(order.amountIn, "amountIn (asset B available to repay) is required for SHORT_REPAY_FRACTION order");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    // Fetch current loan from API (always up-to-date, even after prior modifyBorrow calls)
    const userAddr = Address.fromBech32(userAddress);
    const pkh = userAddr.toPubKeyHash()?.keyHash.hex;
    invariant(pkh, "Failed to extract public key hash from user address");
    const loansResult = await LiqwidProviderV2.Data.loansForUser(apiConfig, [pkh]);
    if (loansResult.type === "err") {
      throw new Error(`Failed to fetch loans for short partial repay: ${loansResult.error.message}`);
    }
    const loan = loansResult.value.find((l) => l.marketId === marketConfig.borrowMarketIdShort);
    invariant(loan, `No active loan found for market ${marketConfig.borrowMarketIdShort}`);

    const loanUtxoId = `${loan.transactionId}-${loan.transactionIndex}`;

    // Fetch market to get minimum borrow amount constraint.
    const marketResult = await LiqwidProviderV2.Data.market(
      apiConfig,
      marketConfig.borrowMarketIdShort as LiqwidProviderV2.MarketId,
    );
    if (marketResult.type === "err") {
      throw new Error(`Failed to fetch market for short partial repay: ${marketResult.error.message}`);
    }
    invariant(marketResult.value, `Market ${marketConfig.borrowMarketIdShort} not found`);
    const minValueRaw = Math.round(marketResult.value.parameters.minValue * 1_000_000);

    // loan.amount is human-readable; convert to raw units
    const currentDebtRaw = Math.round(loan.amount * 1_000_000);
    const availableRaw = Number(order.amountIn); // raw units of asset B

    // Query wallet balance via Kupo — if wallet has enough asset B, build full repay tx instead
    const walletBalance = await kupoService.getBalanceOfPubKeyAddress(userAddress);
    const walletAssetB = walletBalance.get(marketConfig.assetB);
    if (walletAssetB >= BigInt(currentDebtRaw)) {
      logger.info("handleShortRepayFraction: wallet has enough for full repay, redirecting", {
        walletAssetB: walletAssetB.toString(),
        currentDebtRaw,
      });
      const fullRepayResult = await handleShortRepay({
        ...options,
        order: { ...order, orderType: ShortOrderType.SHORT_REPAY, amountIn: walletAssetB.toString() },
      });
      return {
        ...fullRepayResult,
        redirectToFullRepay: {
          targetOrderType: ShortOrderType.SHORT_REPAY,
          amountIn: walletAssetB.toString(),
          assetIn: marketConfig.assetB.toString(),
          assetOut: marketConfig.assetAQTokenRaw,
          deleteOrderTypes: [
            ShortOrderType.SHORT_REPAY_FRACTION,
            ShortOrderType.SHORT_WITHDRAW_FRACTION,
            ShortOrderType.SHORT_BUY_FREED,
          ],
        },
      };
    }

    const collateral = loan.collaterals[0];
    invariant(collateral, "Loan has no collateral — cannot compute partial repay");
    const qTokenAmountRaw = Math.round(collateral.qTokenAmount * 1_000_000);

    // Remaining debt must stay >= minValue so the position stays protocol-legal.
    const newDebt = Math.max(currentDebtRaw - availableRaw, minValueRaw);

    // Check: both the repay amount AND remaining debt must be >= minValue.
    // If debt <= minValue * REPAY_MIN_VALUE_THRESHOLD_NUM / DEFAULT_DENOMINATOR, neither full nor fractional repay is possible.
    const repayAmount = currentDebtRaw - newDebt;
    if (repayAmount < minValueRaw || (availableRaw < currentDebtRaw && newDebt < minValueRaw)) {
      throw new Error(ERROR_BUILD_TX_CODE.ERROR_CANNOT_REPAY);
    }

    invariant(collateral.market, "Loan collateral has no market info");
    const collateralId = `${collateral.market.id}.${collateral.id}`;

    logger.info("handleShortRepayFraction", {
      currentDebtRaw,
      availableRaw,
      minValueRaw,
      qTokenAmountRaw,
      newDebt,
      loanId: loan.id,
      collateralId,
    });

    // Step 1 of fractional close: reduce debt only, keep FULL collateral unchanged.
    const buildTxResult = await LiqwidProviderV2.Transactions.repayLoanFraction(apiConfig, {
      address: userAddress,
      utxos,
      loanUtxoId,
      amount: newDebt,
      collaterals: [{ id: collateralId, amount: qTokenAmountRaw }],
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build short repay-fraction transaction: ${buildTxResult.error.message}`);
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

    return { txRaw, txId, validTo: validTo.getTime() };
  };

  /**
   * Wait for SHORT_REPAY_FRACTION tx confirmation.
   *
   * SHORT_REPAY_FRACTION is a Liqwid modifyBorrow tx that reduces debt while keeping
   * full collateral. Asset B is consumed as repayment — no tokens returned to user.
   *
   * On confirmation → transition to SHORT_WITHDRAW_FRACTION:
   *   amountIn = originalDebtRaw (for proportional collateral calc in handleShortWithdrawFraction)
   */
  export const waitingShortRepayFraction = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider, originalDebtLovelace } = options;
    invariant(originalDebtLovelace, "originalDebtLovelace is required for waitingShortRepayFraction");

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      return {
        isConfirmed: true,
        nextOrderType: ShortOrderType.SHORT_WITHDRAW_FRACTION,
        assetIn: marketConfig.assetA.toString(), // placeholder (handler fetches loan from API)
        amountIn: originalDebtLovelace, // original debt for proportional collateral calc
        assetOut: marketConfig.assetA.toString(), // ADA will be received after withdraw
      };
    }

    return { isConfirmed: false };
  };

  /**
   * Build SHORT_WITHDRAW_FRACTION: Reduce collateral via modifyBorrow after a partial repay.
   * Keeps the same debt level, reduces qADA collateral proportionally, and redeems freed qADA
   * to ADA (sent to wallet for buying more asset B in SHORT_BUY_FREED).
   */
  export const handleShortWithdrawFraction = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(
      order.orderType === ShortOrderType.SHORT_WITHDRAW_FRACTION,
      "Invalid order type for handleShortWithdrawFraction",
    );

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);

    // Fetch current loan state (after SHORT_REPAY_FRACTION: debt reduced, collateral unchanged)
    const userAddr = Address.fromBech32(userAddress);
    const pkh = userAddr.toPubKeyHash()?.keyHash.hex;
    invariant(pkh, "Failed to extract public key hash from user address");
    const loansResult = await LiqwidProviderV2.Data.loansForUser(apiConfig, [pkh]);
    if (loansResult.type === "err") {
      throw new Error(`Failed to fetch loans for short withdraw fraction: ${loansResult.error.message}`);
    }
    const loan = loansResult.value.find((l) => l.marketId === marketConfig.borrowMarketIdShort);
    invariant(loan, `No active loan found for market ${marketConfig.borrowMarketIdShort}`);

    // Use loan UTXO info from the API (always up-to-date after modifyBorrow calls)
    const loanUtxoId = `${loan.transactionId}-${loan.transactionIndex}`;

    const currentDebtRaw = Math.round(loan.amount * 1_000_000);
    const collateral = loan.collaterals[0];
    invariant(collateral, "Loan has no collateral");
    const qTokenAmountRaw = Math.round(collateral.qTokenAmount * 1_000_000);

    // order.amountIn stores the original debt (before SHORT_REPAY_FRACTION) for proportional calc.
    const originalDebtRaw = order.amountIn ? Number(order.amountIn) : currentDebtRaw;
    const proportionalCollateral = Math.floor(qTokenAmountRaw * (currentDebtRaw / originalDebtRaw));

    invariant(collateral.market, "Loan collateral has no market info");
    const collateralId = `${collateral.market.id}.${collateral.id}`;

    logger.info("handleShortWithdrawFraction", {
      currentDebtRaw,
      originalDebtRaw,
      qTokenAmountRaw,
      proportionalCollateral,
      freedCollateral: qTokenAmountRaw - proportionalCollateral,
      loanId: loan.id,
      collateralId,
    });

    // Step 2: keep same debt, reduce collateral proportionally, redeem freed qADA to ADA.
    const buildTxResult = await LiqwidProviderV2.Transactions.repayLoanFraction(apiConfig, {
      address: userAddress,
      utxos,
      loanUtxoId,
      amount: currentDebtRaw,
      collaterals: [{ id: collateralId, amount: proportionalCollateral }],
      redeemCollateral: true,
    });

    if (buildTxResult.type === "err") {
      throw new Error(`Failed to build short withdraw-fraction transaction: ${buildTxResult.error.message}`);
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

    return { txRaw, txId, validTo: validTo.getTime() };
  };

  /**
   * Wait for SHORT_WITHDRAW_FRACTION tx confirmation.
   * Finds ADA received (freed qADA redeemed to underlying) and transitions to SHORT_BUY_FREED.
   */
  export const waitingShortWithdrawFraction = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, userAddress, cardanoscanProvider } = options;

    const txFoundOnChain = await cardanoscanProvider.findTransactionByHash(
      userAddress,
      txHash,
      CardanoscanProvider.PAGE_SIZE,
      CardanoscanProvider.MAX_PAGE,
    );

    if (txFoundOnChain) {
      const userAddressHex = userAddress.toHex();

      for (const output of txFoundOnChain.outputs) {
        if (output.address === userAddressHex) {
          // For SHORT, freed collateral is qADA → redeemed to ADA (native lovelace in output.value)
          const amountOut = BigInt(output.value);
          return {
            isConfirmed: true,
            nextOrderType: ShortOrderType.SHORT_BUY_FREED,
            assetIn: marketConfig.assetA.toString(), // ADA
            amountIn: amountOut.toString(),
            assetOut: marketConfig.assetB.toString(), // asset B to buy
            amountOut: amountOut.toString(),
          };
        }
      }

      throw new Error(`SHORT_WITHDRAW_FRACTION tx confirmed (${txHash}) but could not find ADA output for user`);
    }

    return { isConfirmed: false };
  };

  /**
   * Build SHORT_BUY_FREED: Buy asset B with freed ADA. Same DEX swap as handleShortBuy.
   */
  export const handleShortBuyFreed = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    invariant(options.order.orderType === ShortOrderType.SHORT_BUY_FREED, "Invalid order type for handleShortBuyFreed");
    return handleShortBuy({ ...options, order: { ...options.order, orderType: ShortOrderType.SHORT_BUY } });
  };

  /**
   * Wait for SHORT_BUY_FREED order output to be spent (DEX consumed).
   *
   * On confirmation, checks if enough asset B to fully repay the remaining loan.
   * If yes → SHORT_REPAY (full repay). If no → loop back to SHORT_REPAY_FRACTION.
   */
  export const waitingShortBuyFreed = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, orderOutputIndex, userAddress, cardanoscanProvider, assetOut, networkEnv } = options;
    invariant(orderOutputIndex !== undefined, "orderOutputIndex is required for waitingShortBuyFreed");
    invariant(assetOut, "assetOut is required for waitingShortBuyFreed");

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

              // Check if we now have enough asset B to fully repay the remaining loan.
              const { canFullRepay, canRepay, loanAmountRaw } = await checkShortRepayFunds(
                networkEnv,
                userAddress.bech32,
                marketConfig,
                Number(amountOut),
              );

              logger.info("waitingShortBuyFreed: repay check", {
                available: amountOut.toString(),
                loanAmountRaw: loanAmountRaw.toString(),
                canFullRepay,
                canRepay,
              });

              if (!canRepay) {
                throw new Error(ERROR_BUILD_TX_CODE.ERROR_CANNOT_REPAY);
              }

              if (canFullRepay) {
                // Enough asset B → transition to SHORT_REPAY (full repay)
                return {
                  isConfirmed: true,
                  nextOrderType: ShortOrderType.SHORT_REPAY,
                  assetIn: marketConfig.assetB.toString(),
                  amountIn: amountOut.toString(),
                  assetOut: marketConfig.assetAQTokenRaw,
                  amountOut: amountOut.toString(),
                };
              }

              // Still not enough → loop: create another fractional cycle
              return {
                isConfirmed: true,
                nextOrderType: ShortOrderType.SHORT_REPAY_FRACTION,
                assetIn: marketConfig.assetB.toString(),
                amountIn: amountOut.toString(),
                assetOut: marketConfig.assetB.toString(),
                amountOut: amountOut.toString(),
                additionalOrders: [
                  { orderType: ShortOrderType.SHORT_REPAY_FRACTION },
                  { orderType: ShortOrderType.SHORT_WITHDRAW_FRACTION },
                  { orderType: ShortOrderType.SHORT_BUY_FREED },
                ],
                originalDebtLovelace: loanAmountRaw.toString(),
              };
            }
          }
        }
      }

      throw new Error(
        `SHORT_BUY_FREED output spent (tx: ${spendingTx.hash}) but could not find matching output with asset ${assetOut.toString()}`,
      );
    }

    return { isConfirmed: false };
  };

  /**
   * Build SHORT_WITHDRAW transaction: Withdraw asset A (ADA) from Liqwid
   */
  export const handleShortWithdraw = async (options: HandleBuildTxOptions): Promise<BuiltResult> => {
    const { order, marketConfig, userAddress, networkEnv, utxos } = options;
    invariant(order.orderType === ShortOrderType.SHORT_WITHDRAW, "Invalid order type for handleShortWithdraw");

    const apiConfig = LiqwidProviderV2.createConfig(networkEnv);
    const marketId = marketConfig.shortCollateralMarketId as LiqwidProviderV2.MarketId;

    // Get current qToken balance from UTxOs
    const qTokenAsset = Asset.fromString(marketConfig.assetAQTokenRaw);
    let qTokenBalance = 0n;
    for (const utxoHex of utxos) {
      const utxo = Utxo.fromHex(utxoHex);
      const amount = utxo.output.value.get(qTokenAsset);
      if (amount > 0n) {
        qTokenBalance += amount;
      }
    }
    invariant(qTokenBalance > 0n, "No qToken balance found in user UTxOs for SHORT_WITHDRAW");

    // Convert qToken amount to underlying amount via market exchange rate
    const marketResult = await LiqwidProviderV2.Data.market(apiConfig, marketId);
    if (marketResult.type === "err") {
      throw new Error(`Failed to fetch market data: ${marketResult.error.message}`);
    }
    const market = marketResult.value;
    invariant(market, `Market ${marketId} not found`);
    const withdrawAmount = Math.floor(Number(qTokenBalance) * market.exchangeRate);

    logger.info("handleShortWithdraw", {
      qTokenBalance: qTokenBalance.toString(),
      exchangeRate: market.exchangeRate,
      withdrawAmount,
    });

    const buildTxResult = await LiqwidProviderV2.Transactions.withdraw(apiConfig, {
      address: userAddress,
      utxos,
      marketId,
      amount: withdrawAmount,
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
        /** Expected output asset for the next order (undefined if the order has no output, e.g. LONG_REPAY_FRACTION) */
        assetOut?: string;
        /** Amount received from this order (to update order.amount_out). Undefined if no output (e.g. LONG_REPAY_FRACTION) */
        amountOut?: string;
        /** Orders to create for fractional repay flow (first one = nextOrderType) */
        additionalOrders?: Array<{ orderType: string }>;
        /** Debt in lovelace before fractional repay (stored in next order's amountOut for propagation) */
        originalDebtLovelace?: string;
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
    /** Network environment (needed for Liqwid API calls in waiting functions) */
    networkEnv: NetworkEnvironment;
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
    /**
     * Debt in lovelace before the partial repay (LONG_REPAY_FRACTION).
     * Used by waitingLongRepayFraction to pass to LONG_WITHDRAW_FRACTION
     * for proportional collateral calculation.
     */
    originalDebtLovelace?: string;
    /**
     * Running total of ADA accumulated across LONG_SELL + LONG_SELL_FREED iterations
     * (used for LONG_SELL_FREED to decide whether to loop back to LONG_REPAY_FRACTION
     * or transition to the final LONG_REPAY).
     * Stored as a string to avoid BigInt serialisation issues.
     */
    accumulatedAda?: string;
    /** Kupo service for querying user wallet balance (SHORT_WITHDRAW leftover check) */
    kupoService: KupoService;
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
    const { marketConfig, txHash, orderOutputIndex, userAddress, cardanoscanProvider, orderType, networkEnv, kupoService } =
      options;
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
          let amountOut = BigInt(output.value);

          // For LONG_SELL_ALL, this is the final step - position becomes CLOSED
          if (orderType === LongOrderType.LONG_SELL_ALL) {
            return {
              isConfirmed: true,
              isFinal: true,
              positionStatus: PositionStatus.CLOSED,
              amountOut: amountOut.toString(),
            };
          }

          if (orderType === LongOrderType.LONG_SELL) {
            // Query wallet assetA (ADA) balance via Kupo — handles DEX swaps that split proceeds
            // across multiple UTxOs, which the spending-tx output alone would under-count.
            logger.info("waitingLongSell: querying wallet balance via Kupo to get total ADA received from sell", {
              userAddress: userAddress.bech32,
              asset: marketConfig.assetA,
            });
            const walletBalance = await kupoService.getBalanceOfPubKeyAddress(userAddress.bech32);
            amountOut = walletBalance.get(marketConfig.assetA);
          }

          // For LONG_SELL, check if we have enough ADA to fully repay the loan.
          const { canFullRepay, canRepay, loanAmount } = await checkLongRepayFunds(
            networkEnv,
            userAddress.bech32,
            marketConfig,
            Number(amountOut),
          );

          logger.info("waitingLongSell: repay check", {
            available: amountOut.toString(),
            loanAmount: loanAmount.toString(),
            canFullRepay,
            canRepay,
          });

          if (!canRepay) {
            throw new Error(ERROR_BUILD_TX_CODE.ERROR_CANNOT_REPAY);
          }

          if (canFullRepay) {
            // Happy path: enough ADA → full repay
            return {
              isConfirmed: true,
              nextOrderType: LongOrderType.LONG_REPAY,
              assetIn: marketConfig.assetA.toString(),
              amountIn: amountOut.toString(),
              assetOut: marketConfig.assetBQTokenRaw,
              amountOut: amountOut.toString(),
            };
          }

          // Insufficient ADA → start fractional repay cycle
          return {
            isConfirmed: true,
            nextOrderType: LongOrderType.LONG_REPAY_FRACTION,
            assetIn: marketConfig.assetA.toString(),
            amountIn: amountOut.toString(),
            assetOut: marketConfig.assetA.toString(),
            amountOut: amountOut.toString(),
            additionalOrders: [
              { orderType: LongOrderType.LONG_REPAY_FRACTION },
              { orderType: LongOrderType.LONG_WITHDRAW_FRACTION },
              { orderType: LongOrderType.LONG_SELL_FREED },
            ],
            originalDebtLovelace: loanAmount.toString(),
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
   * Wait for SHORT_SELL / SHORT_SELL_ALL order output to be spent (consumed by DEX)
   * - SHORT_SELL: final opening step — position becomes OPEN
   * - SHORT_SELL_ALL: final closing step — position becomes CLOSED
   */
  export const waitingShortSell = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { txHash, orderOutputIndex, userAddress, cardanoscanProvider, orderType } = options;
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
      // SHORT_SELL / SHORT_SELL_ALL sell asset B for ADA, so we look for ADA in outputs
      for (const output of spendingTx.outputs) {
        if (output.address === userAddressHex) {
          const amountOut = BigInt(output.value);
          const positionStatus =
            orderType === ShortOrderType.SHORT_SELL_ALL ? PositionStatus.CLOSED : PositionStatus.OPEN;
          return {
            isConfirmed: true,
            isFinal: true,
            positionStatus,
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
   * Extract asset B received and check if enough for full repay or fractional flow
   */
  export const waitingShortBuy = async (options: WaitingOptions): Promise<WaitingResult> => {
    const { marketConfig, txHash, orderOutputIndex, userAddress, cardanoscanProvider, assetOut, networkEnv } = options;
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

              // Check if we have enough asset B to fully repay the loan
              const { canFullRepay, canRepay, loanAmountRaw } = await checkShortRepayFunds(
                networkEnv,
                userAddress.bech32,
                marketConfig,
                Number(amountOut),
              );

              logger.info("waitingShortBuy: repay check", {
                available: amountOut.toString(),
                loanAmountRaw: loanAmountRaw.toString(),
                canFullRepay,
                canRepay,
              });

              if (!canRepay) {
                throw new Error(ERROR_BUILD_TX_CODE.ERROR_CANNOT_REPAY);
              }

              if (canFullRepay) {
                // Happy path: enough asset B → full repay
                return {
                  isConfirmed: true,
                  nextOrderType: ShortOrderType.SHORT_REPAY,
                  assetIn: assetOut.toString(),
                  amountIn: amountOut.toString(),
                  assetOut: marketConfig.assetAQTokenRaw, // qADA to be redeemed
                  amountOut: amountOut.toString(),
                };
              }

              // Insufficient asset B → start fractional repay cycle
              return {
                isConfirmed: true,
                nextOrderType: ShortOrderType.SHORT_REPAY_FRACTION,
                assetIn: assetOut.toString(),
                amountIn: amountOut.toString(),
                assetOut: marketConfig.assetB.toString(),
                amountOut: amountOut.toString(),
                additionalOrders: [
                  { orderType: ShortOrderType.SHORT_REPAY_FRACTION },
                  { orderType: ShortOrderType.SHORT_WITHDRAW_FRACTION },
                  { orderType: ShortOrderType.SHORT_BUY_FREED },
                ],
                originalDebtLovelace: loanAmountRaw.toString(),
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
    const { marketConfig, txHash, userAddress, cardanoscanProvider, kupoService } = options;

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
          // Query wallet assetB balance — always transition to SHORT_SELL_ALL (pre-created in closePosition)
          const walletBalance = await kupoService.getBalanceOfPubKeyAddress(userAddress.bech32);
          const leftoverB = walletBalance.get(marketConfig.assetB);
          logger.info("waitingShortWithdraw: leftover assetB", {
            leftoverB: leftoverB.toString(),
            assetB: marketConfig.assetB.toString(),
          });

          return {
            isConfirmed: true,
            nextOrderType: ShortOrderType.SHORT_SELL_ALL,
            assetIn: marketConfig.assetB.toString(),
            amountIn: leftoverB.toString(),
            assetOut: marketConfig.assetA.toString(),
            amountOut: leftoverB.toString(),
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
    [LongOrderType.LONG_REPAY_FRACTION]: handleLongRepayFraction,
    [LongOrderType.LONG_WITHDRAW_FRACTION]: handleLongWithdrawFraction,
    [LongOrderType.LONG_SELL_FREED]: handleLongSellFreed,
    [LongOrderType.LONG_WITHDRAW]: handleLongWithdraw,
    [LongOrderType.LONG_SELL_ALL]: handleLongSell,
    [ShortOrderType.SHORT_SUPPLY]: handleShortSupply,
    [ShortOrderType.SHORT_BORROW]: handleShortBorrow,
    [ShortOrderType.SHORT_SELL]: handleShortSell,
    [ShortOrderType.SHORT_BUY]: handleShortBuy,
    [ShortOrderType.SHORT_REPAY]: handleShortRepay,
    [ShortOrderType.SHORT_REPAY_FRACTION]: handleShortRepayFraction,
    [ShortOrderType.SHORT_WITHDRAW_FRACTION]: handleShortWithdrawFraction,
    [ShortOrderType.SHORT_BUY_FREED]: handleShortBuyFreed,
    [ShortOrderType.SHORT_WITHDRAW]: handleShortWithdraw,
    [ShortOrderType.SHORT_SELL_ALL]: handleShortSell,
  };

  /** Map of order types to their waiting functions */
  export const MAP_WAITING_FN: Record<string, (options: WaitingOptions) => Promise<WaitingResult>> = {
    [LongOrderType.LONG_BUY]: waitingLongBuy,
    [LongOrderType.LONG_SUPPLY]: waitingLongSupply,
    [LongOrderType.LONG_BORROW]: waitingLongBorrow,
    [LongOrderType.LONG_BUY_MORE]: waitingLongBuy, // Reuse waitingLongBuy
    [LongOrderType.LONG_SELL]: waitingLongSell,
    [LongOrderType.LONG_REPAY]: waitingLongRepay,
    [LongOrderType.LONG_REPAY_FRACTION]: waitingLongRepayFraction,
    [LongOrderType.LONG_WITHDRAW_FRACTION]: waitingLongWithdrawFraction,
    [LongOrderType.LONG_SELL_FREED]: waitingLongSellFreed,
    [LongOrderType.LONG_WITHDRAW]: waitingLongWithdraw,
    [LongOrderType.LONG_SELL_ALL]: waitingLongSell,
    [ShortOrderType.SHORT_SUPPLY]: waitingShortSupply,
    [ShortOrderType.SHORT_BORROW]: waitingShortBorrow,
    [ShortOrderType.SHORT_SELL]: waitingShortSell,
    [ShortOrderType.SHORT_BUY]: waitingShortBuy,
    [ShortOrderType.SHORT_REPAY]: waitingShortRepay,
    [ShortOrderType.SHORT_REPAY_FRACTION]: waitingShortRepayFraction,
    [ShortOrderType.SHORT_WITHDRAW_FRACTION]: waitingShortWithdrawFraction,
    [ShortOrderType.SHORT_BUY_FREED]: waitingShortBuyFreed,
    [ShortOrderType.SHORT_WITHDRAW]: waitingShortWithdraw,
    [ShortOrderType.SHORT_SELL_ALL]: waitingShortSell,
  };
}
