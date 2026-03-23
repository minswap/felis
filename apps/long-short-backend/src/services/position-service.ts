import { Address, Asset, type NetworkEnvironment } from "@minswap/felis-ledger-core";
import { LiqwidProviderV2 } from "@minswap/felis-lending-market";
import invariant from "@minswap/tiny-invariant";
import type { Kysely } from "kysely";
import { StateMachine } from "../api/state-machine";
import { getMarketConfig, isSupportedMarket, type MarketConfig } from "../config/market";
import type { DB } from "../database";
import { CardanoscanProvider, type MinswapAggregatorProvider } from "../provider";
import { OrderRepository } from "../repository/order-repository";
import { type Position, PositionRepository } from "../repository/position-repository";
import { logger } from "../utils";

export type CreatePositionInput = {
  userAddress: string;
  marketId: string;
  side: "LONG" | "SHORT";
  amountIn: bigint;
};

export type CreatePositionResult = { success: true; position: Position } | { success: false; error: string };

export type BuildTxInput = {
  userAddress: string;
  marketId: string;
  utxos: string[];
};

export type BuildTxResult =
  | { success: true; txRaw: string; txId: string; orderType: string }
  | { success: true; waiting: true; orderType: string; message: string }
  | { success: false; error: string };

export type ClosePositionInput = {
  userAddress: string;
  marketId: string;
};

export type ClosePositionResult = { success: true; position: Position } | { success: false; error: string };

export type PositionMetrics = {
  entryPrice: number | null;
  liqPrice: number | null;
  interest: bigint | null;
  unrealizedPnl: bigint | null;
  health: number | null;
};

export class PositionService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly networkEnv: NetworkEnvironment,
    private readonly cardanoscanProvider: CardanoscanProvider,
    private readonly aggregatorProvider: MinswapAggregatorProvider,
  ) {}

  async createPosition(input: CreatePositionInput): Promise<CreatePositionResult> {
    const { userAddress, marketId, side, amountIn } = input;

    // Validate side
    if (side !== "LONG" && side !== "SHORT") {
      return { success: false, error: "Side must be LONG or SHORT" };
    }

    // Validate market
    if (!isSupportedMarket(marketId)) {
      return { success: false, error: `Market "${marketId}" is not supported or disabled` };
    }

    const marketConfig = getMarketConfig(marketId);
    if (!marketConfig) {
      return { success: false, error: `Market "${marketId}" configuration not found` };
    }

    // Validate minimum collateral
    if (amountIn < marketConfig.minCollateral) {
      return {
        success: false,
        error: `Minimum collateral is ${marketConfig.minCollateral} lovelace`,
      };
    }

    // Check for existing open position in this market
    const existingPosition = await PositionRepository.getOpenPositionByUserAndMarket(this.db, userAddress, marketId);

    if (existingPosition) {
      return {
        success: false,
        error: "User already has an open position for this market",
      };
    }

    // Calculate amount_borrow
    let amountBorrow: bigint;
    if (side === StateMachine.PositionSide.LONG) {
      // LONG: borrow ADA = amountIn * (leverage - 1) + fee
      amountBorrow = BigInt(Math.floor(Number(amountIn) * (marketConfig.longLeverage - 1))) + 4_000_000n;
    } else {
      // SHORT: borrow asset B equivalent to amountIn * shortLeverage ADA
      // e.g. short 600 ADA with leverage 0.5 => estimate 300 ADA worth of asset B
      const adaAmountToEstimate = BigInt(Math.floor(Number(amountIn) * marketConfig.shortLeverage));
      const estimate = await this.aggregatorProvider.estimate({
        amount: adaAmountToEstimate.toString(),
        tokenIn: marketConfig.assetA.toBlockFrostString(),
        tokenOut: marketConfig.assetB.toBlockFrostString(),
      });
      amountBorrow = BigInt(estimate.amountOut);
    }
    // Execute transaction: create position + orders
    const position = await this.db.transaction().execute(async (trx) => {
      const pos = await PositionRepository.createPosition(trx, {
        marketId,
        userAddress,
        side: side as StateMachine.PositionSide,
        amountIn: amountIn.toString(),
        amountBorrow: amountBorrow.toString(),
      });

      if (side === "LONG") {
        // Create 4 LONG opening orders
        await OrderRepository.createOrders(trx, [
          {
            positionId: pos.id,
            orderType: StateMachine.LongOrderType.LONG_BUY,
            assetIn: marketConfig.assetA.toString(),
            amountIn: pos.amountIn,
            assetOut: marketConfig.assetB.toString(),
          },
          {
            positionId: pos.id,
            orderType: StateMachine.LongOrderType.LONG_SUPPLY,
          },
          {
            positionId: pos.id,
            orderType: StateMachine.LongOrderType.LONG_BORROW,
          },
          {
            positionId: pos.id,
            orderType: StateMachine.LongOrderType.LONG_BUY_MORE,
          },
        ]);
      } else {
        // Create 3 SHORT opening orders: supply ADA → borrow asset B → sell asset B
        await OrderRepository.createOrders(trx, [
          {
            positionId: pos.id,
            orderType: StateMachine.ShortOrderType.SHORT_SUPPLY,
            assetIn: marketConfig.assetA.toString(),
            amountIn: pos.amountIn,
            assetOut: marketConfig.assetAQTokenRaw,
          },
          {
            positionId: pos.id,
            orderType: StateMachine.ShortOrderType.SHORT_BORROW,
          },
          {
            positionId: pos.id,
            orderType: StateMachine.ShortOrderType.SHORT_SELL,
          },
        ]);
      }

      return pos;
    });

    return { success: true, position };
  }

  async buildTx(input: BuildTxInput): Promise<BuildTxResult> {
    const { userAddress, marketId, utxos } = input;

    // Validate market
    if (!isSupportedMarket(marketId)) {
      return { success: false, error: `Market "${marketId}" is not supported or disabled` };
    }

    // Check if user has an open position for this market
    const position = await PositionRepository.getOpenPositionByUserAndMarket(this.db, userAddress, marketId);

    if (!position) {
      return { success: false, error: "No open position found for this market" };
    }

    const marketConfig = getMarketConfig(marketId);
    if (!marketConfig) {
      return { success: false, error: `Market "${marketId}" configuration not found` };
    }

    try {
      // STEP 1: Check if there's a waiting order (created_tx_id not null, waiting = true)
      const waitingOrder = await OrderRepository.getWaitingOrder(this.db, position.id);
      if (waitingOrder) {
        logger.info("Found waiting order, checking status", {
          orderId: waitingOrder.id,
          orderType: waitingOrder.orderType,
          createdTxId: waitingOrder.createdTxId,
        });
        invariant(waitingOrder.assetOut, "Waiting order must have assetOut defined");
        invariant(waitingOrder.createdTxId, "Waiting order must have createdTxId defined");

        // Get the waiting function for this order type
        const waitingFn = StateMachine.MAP_WAITING_FN[waitingOrder.orderType];
        if (!waitingFn) {
          return {
            success: false,
            error: `Waiting logic for order type "${waitingOrder.orderType}" is not implemented yet`,
          };
        }

        // Build common waiting options
        const waitingOptions: StateMachine.WaitingOptions = {
          marketConfig,
          txHash: waitingOrder.createdTxId,
          userAddress: Address.fromBech32(userAddress),
          cardanoscanProvider: this.cardanoscanProvider,
          networkEnv: this.networkEnv,
          orderType: waitingOrder.orderType,
          orderOutputIndex: waitingOrder.createdTxIndex ?? 0,
          assetOut: Asset.fromString(waitingOrder.assetOut),
          positionAmountIn: position.amountIn,
        };

        // For fractional repay flows, pass the original debt (stored in amountOut during creation)
        if (
          waitingOrder.orderType === StateMachine.LongOrderType.LONG_REPAY_FRACTION ||
          waitingOrder.orderType === StateMachine.ShortOrderType.SHORT_REPAY_FRACTION
        ) {
          waitingOptions.originalDebtLovelace = waitingOrder.amountOut ?? undefined;
        }

        const waitingResult = await waitingFn(waitingOptions);

        if (waitingResult.isConfirmed) {
          // Check if this is a transition state (has nextOrderType)
          if ("nextOrderType" in waitingResult) {
            // If the waiting function signals a fractional flow, create the additional orders first
            // so that transitionToNextOrder can find the next order by type.
            if (waitingResult.additionalOrders && waitingResult.additionalOrders.length > 0) {
              const newOrders = await OrderRepository.createOrders(
                this.db,
                waitingResult.additionalOrders.map((o) => ({
                  positionId: waitingOrder.positionId,
                  orderType: o.orderType,
                })),
              );

              logger.info("Fractional flow: created additional orders", {
                currentOrderId: waitingOrder.id,
                additionalOrders: waitingResult.additionalOrders.map((o) => o.orderType),
              });

              // Store originalDebtLovelace in the first additional order's amountOut
              // (LONG_REPAY_FRACTION — needed by waitingLongRepayFraction for proportional collateral calc)
              if (waitingResult.originalDebtLovelace && newOrders.length > 0) {
                await OrderRepository.updateOrderAmountOut(
                  this.db,
                  newOrders[0].id,
                  waitingResult.originalDebtLovelace,
                );
              }
            }

            const transitionResult = await OrderRepository.transitionToNextOrder(this.db, {
              currentOrderId: waitingOrder.id,
              positionId: waitingOrder.positionId,
              nextOrderType: waitingResult.nextOrderType,
              assetIn: waitingResult.assetIn,
              amountIn: waitingResult.amountIn,
              assetOut: waitingResult.assetOut,
              amountOut: waitingResult.amountOut,
            });

            if (!transitionResult.success) {
              // Next order doesn't exist — create it dynamically.
              logger.info("Next order not found, creating dynamically", {
                currentOrderId: waitingOrder.id,
                nextOrderType: waitingResult.nextOrderType,
              });

              const newOrder = await OrderRepository.createOrder(this.db, {
                positionId: waitingOrder.positionId,
                orderType: waitingResult.nextOrderType,
                assetIn: waitingResult.assetIn,
                amountIn: waitingResult.amountIn,
                assetOut: waitingResult.assetOut,
              });

              // Complete current order
              await OrderRepository.completeOrder(this.db, waitingOrder.id, waitingResult.amountOut);

              logger.info("Order completed, created new order", {
                currentOrderId: waitingOrder.id,
                currentOrderType: waitingOrder.orderType,
                nextOrderId: newOrder.id,
                nextOrderType: waitingResult.nextOrderType,
              });

              return {
                success: false,
                error: `${waitingOrder.orderType} completed. ${waitingResult.nextOrderType} order ready. Call build-tx again to continue.`,
              };
            }

            logger.info("Order completed, transitioned to next order", {
              currentOrderId: waitingOrder.id,
              currentOrderType: waitingOrder.orderType,
              nextOrderId: transitionResult.nextOrder.id,
              nextOrderType: waitingResult.nextOrderType,
            });

            return {
              success: false,
              error: `${waitingOrder.orderType} completed. ${waitingResult.nextOrderType} order ready. Call build-tx again to continue.`,
            };
          }

          // This is the final state (no more orders to process)
          await this.db.transaction().execute(async (trx) => {
            // Update position status
            await PositionRepository.updatePositionStatus(trx, position.id, waitingResult.positionStatus);
            // Complete order: set amount_out and waiting = false
            await OrderRepository.completeOrder(trx, waitingOrder.id, waitingResult.amountOut);
          });

          logger.info("Position completed, status updated to OPEN", {
            positionId: position.id,
            currentOrderId: waitingOrder.id,
            currentOrderType: waitingOrder.orderType,
            newStatus: waitingResult.positionStatus,
            amountOut: waitingResult.amountOut,
          });

          return {
            success: false,
            error: `${waitingOrder.orderType} completed. Position is now ${waitingResult.positionStatus}.`,
          };
        } else {
          return {
            success: false,
            error: `${waitingOrder.orderType} transaction not yet confirmed on chain.`,
          };
        }
      }

      // STEP 2: No waiting order, find next unhandled order
      const order = await OrderRepository.getNextUnhandledOrder(this.db, position.id);
      if (!order) {
        return { success: false, error: "No unhandled order found" };
      }

      // STEP 3: Handle order - check if transaction already built
      if (order.builtTxId) {
        logger.info("Order has built_tx_id, checking transaction status", {
          orderId: order.id,
          builtTxId: order.builtTxId,
          hasCreatedTxId: !!order.createdTxId,
        });

        const address = Address.fromBech32(userAddress);

        // If order.createdTxId exists, transaction was already found on chain
        if (order.createdTxId) {
          logger.info("Transaction already confirmed on chain", {
            orderId: order.id,
            createdTxId: order.createdTxId,
          });
          // Transaction is confirmed, waiting for it to be spent
          return {
            success: false,
            error: "Transaction confirmed on chain. Waiting for order to be processed.",
          };
        }

        // Search for transaction on chain
        const txFoundOnChain = await this.cardanoscanProvider.findTransactionByHash(
          address,
          order.builtTxId,
          CardanoscanProvider.PAGE_SIZE,
          CardanoscanProvider.MAX_PAGE,
        );

        if (txFoundOnChain) {
          logger.info("Transaction found on chain", {
            orderId: order.id,
            txHash: txFoundOnChain.hash,
          });

          // Update order with created_tx_id (this will set waiting = true by default)
          await OrderRepository.updateOrderCreatedTx(this.db, order.id, txFoundOnChain.hash, 0);

          return {
            success: false,
            error: "Transaction confirmed on chain. Waiting for order to be processed.",
          };
        }

        // Transaction not found on chain - check if expired
        const now = new Date();
        const validTo = order.builtValidTo;

        if (!validTo) {
          logger.warn("Order has built_tx_id but no built_valid_to, rebuilding", {
            orderId: order.id,
          });
          // Fall through to rebuild
        } else if (validTo < now) {
          // Transaction expired => rebuild
          logger.info("Transaction expired, rebuilding", {
            orderId: order.id,
            validTo: validTo.toISOString(),
            now: now.toISOString(),
          });
          // Fall through to rebuild
        } else {
          // Transaction not expired yet => wait
          const remainingMs = validTo.getTime() - now.getTime();
          const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
          logger.info("Transaction not yet expired, waiting", {
            orderId: order.id,
            validTo: validTo.toISOString(),
            remainingMinutes,
          });
          return {
            success: true,
            waiting: true,
            orderType: order.orderType,
            message: `Transaction already built and waiting for confirmation. Expires in ${remainingMinutes} minutes.`,
          };
        }
      }

      // STEP 4: Build new transaction
      logger.info("Building new transaction", {
        orderId: order.id,
        orderType: order.orderType,
        hasPreviousBuild: !!order.builtTxId,
      });

      // Get the build function for this order type
      const buildFn = StateMachine.MAP_BUILD_TX_FN[order.orderType];
      if (!buildFn) {
        return { success: false, error: `Order type "${order.orderType}" is not implemented` };
      }

      // Build common options
      const buildOptions: StateMachine.HandleBuildTxOptions = {
        order: {
          orderType: order.orderType,
          assetIn: order.assetIn,
          amountIn: order.amountIn,
          assetOut: order.assetOut,
        },
        marketConfig,
        userAddress,
        networkEnv: this.networkEnv,
        utxos,
        amountBorrow: position.amountBorrow,
      };

      // LONG_REPAY, LONG_REPAY_FRACTION, SHORT_REPAY, SHORT_REPAY_FRACTION: no extra options needed —
      // handlers fetch loan data directly from the Liqwid API (always up-to-date, even after modifyBorrow).

      // LONG_WITHDRAW and SHORT_WITHDRAW: handlers compute withdraw amount dynamically
      // from UTxO qToken balance and market exchange rate (no DB lookup needed).

      const txResult = await buildFn(buildOptions);

      // Update order built_tx fields
      await OrderRepository.updateOrderBuiltTx(this.db, order.id, txResult.txId, new Date(txResult.validTo));

      logger.info("Transaction built successfully", {
        orderId: order.id,
        txId: txResult.txId,
        validTo: new Date(txResult.validTo).toISOString(),
      });

      return { success: true, txRaw: txResult.txRaw, txId: txResult.txId, orderType: order.orderType };
    } catch (error) {
      logger.error("error building tx", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to build transaction",
      };
    }
  }

  async getOpenPositionByUser(userAddress: string): Promise<Position | null> {
    return PositionRepository.getOpenPositionByUser(this.db, userAddress);
  }

  /**
   * Compute trading metrics for an OPEN position:
   * entry_price, liq_price, interest, unrealized_pnl, health
   */
  async getPositionMetrics(position: Position): Promise<PositionMetrics> {
    const empty: PositionMetrics = {
      entryPrice: null,
      liqPrice: null,
      interest: null,
      unrealizedPnl: null,
      health: null,
    };

    if (position.status === StateMachine.PositionStatus.PENDING) {
      return empty;
    }

    const marketConfig = getMarketConfig(position.marketId);
    if (!marketConfig) return empty;

    try {
      // 1. Entry price + total token quantity from completed orders
      const entryData = await this.computeEntryData(position, marketConfig);
      const entryPrice = entryData?.entryPrice ?? null;

      // 2. Loan data from Liqwid (health, interest)
      const apiConfig = LiqwidProviderV2.createConfig(this.networkEnv);
      const userAddr = Address.fromBech32(position.userAddress);
      const pkh = userAddr.toPubKeyHash()?.keyHash.hex;
      if (!pkh) return { ...empty, entryPrice };

      const borrowMarketId =
        position.side === StateMachine.PositionSide.LONG
          ? marketConfig.borrowMarketIdLong
          : marketConfig.borrowMarketIdShort;

      const loansResult = await LiqwidProviderV2.Data.loansForUser(apiConfig, [pkh]);
      const loan = loansResult.type === "ok" ? loansResult.value.find((l) => l.marketId === borrowMarketId) : undefined;

      const health = loan?.healthFactor ?? null;
      const interest = loan?.interest != null ? BigInt(Math.floor(loan.interest * 1000000)) : null;

      // 3. Current asset value from aggregator for unrealized PnL and liq price
      // Estimate current value of totalTokenB in asset A (e.g. token B → ADA)
      let currentPrice: number | null = null;
      let currentAssetValueInA: number | null = null;
      try {
        if (entryData != null) {
          const estimate = await this.aggregatorProvider.estimate({
            amount: String(Math.floor(entryData.totalTokenB)),
            tokenIn: marketConfig.assetB.toBlockFrostString(),
            tokenOut: marketConfig.assetA.toBlockFrostString(),
          });
          currentAssetValueInA = Number(estimate.amountOut);
          currentPrice = Number(estimate.amountOut) / Number(estimate.amountIn);
        }
      } catch {
        // aggregator unavailable
      }

      // 4. Unrealized PnL (in lovelace, using bigint for precision)
      let unrealizedPnl: bigint | null = null;
      if (currentAssetValueInA != null) {
        const currentValueBigInt = BigInt(currentAssetValueInA);
        if (position.side === StateMachine.PositionSide.LONG) {
          // LONG: PnL = current token B value - (amount_in + amount_borrow), all in lovelace
          unrealizedPnl = currentValueBigInt - BigInt(position.amountIn) - BigInt(position.amountBorrow);
        } else if (entryData?.saleProceedsLovelace != null) {
          // SHORT: PnL = sale proceeds at entry - current buyback cost
          unrealizedPnl = BigInt(entryData.saleProceedsLovelace) - currentValueBigInt;
        }
      }

      // 5. Liquidation price
      let liqPrice: number | null = null;
      if (loan && health != null && currentPrice != null && health > 0) {
        if (position.side === StateMachine.PositionSide.LONG) {
          // When health = 1, price = liq_price. health = collateral_value / (debt * liq_threshold).
          // liq_price ≈ current_price / health_factor
          liqPrice = currentPrice / health;
        } else {
          liqPrice = currentPrice * health;
        }
      }

      return { entryPrice, liqPrice, interest, unrealizedPnl, health };
    } catch (error) {
      logger.error("Failed to compute position metrics", { error, positionId: position.id.toString() });
      return empty;
    }
  }

  private async computeEntryData(
    position: Position,
    _marketConfig: MarketConfig,
  ): Promise<{ entryPrice: number; totalTokenB: number; saleProceedsLovelace?: string } | null> {
    if (position.side === StateMachine.PositionSide.LONG) {
      // Entry price = total ADA spent / total token B received (across LONG_BUY + LONG_BUY_MORE)
      const buyOrder = await OrderRepository.getOrderByPositionAndType(
        this.db,
        position.id,
        StateMachine.LongOrderType.LONG_BUY,
      );
      const buyMoreOrder = await OrderRepository.getOrderByPositionAndType(
        this.db,
        position.id,
        StateMachine.LongOrderType.LONG_BUY_MORE,
      );

      let totalAdaIn = 0;
      let totalTokenOut = 0;
      if (buyOrder?.amountIn && buyOrder?.amountOut) {
        totalAdaIn += Number(buyOrder.amountIn);
        totalTokenOut += Number(buyOrder.amountOut);
      }
      if (buyMoreOrder?.amountIn && buyMoreOrder?.amountOut) {
        totalAdaIn += Number(buyMoreOrder.amountIn);
        totalTokenOut += Number(buyMoreOrder.amountOut);
      }

      return totalTokenOut > 0 ? { entryPrice: totalAdaIn / totalTokenOut, totalTokenB: totalTokenOut } : null;
    }

    // SHORT: entry price = ADA received / token B sold
    const sellOrder = await OrderRepository.getOrderByPositionAndType(
      this.db,
      position.id,
      StateMachine.ShortOrderType.SHORT_SELL,
    );
    if (sellOrder?.amountIn && sellOrder?.amountOut) {
      const tokenBIn = Number(sellOrder.amountIn);
      const adaOut = Number(sellOrder.amountOut);
      return tokenBIn > 0
        ? { entryPrice: adaOut / tokenBIn, totalTokenB: tokenBIn, saleProceedsLovelace: sellOrder.amountOut }
        : null;
    }
    return null;
  }

  async closePosition(input: ClosePositionInput): Promise<ClosePositionResult> {
    const { userAddress, marketId } = input;

    // Validate market
    if (!isSupportedMarket(marketId)) {
      return { success: false, error: `Market "${marketId}" is not supported or disabled` };
    }

    const marketConfig = getMarketConfig(marketId);
    if (!marketConfig) {
      return { success: false, error: `Market "${marketId}" configuration not found` };
    }

    // Check if user has an open position for this market
    const position = await PositionRepository.getOpenPositionByUserAndMarket(this.db, userAddress, marketId);

    if (!position) {
      return { success: false, error: "No open position found for this market" };
    }

    // Check if position is OPEN (only OPEN positions can be closed)
    if (position.status !== StateMachine.PositionStatus.OPEN) {
      return {
        success: false,
        error: `Position is in "${position.status}" status. Only OPEN positions can be closed.`,
      };
    }

    // Execute transaction: update position status + create closing orders
    const updatedPosition = await this.db.transaction().execute(async (trx) => {
      // Update position status to CLOSING
      await PositionRepository.updatePositionStatus(trx, position.id, StateMachine.PositionStatus.CLOSING);

      if (position.side === StateMachine.PositionSide.LONG) {
        // Get the LONG_BUY_MORE order to get the amountOut (total asset B received)
        const longBuyMoreOrder = await OrderRepository.getOrderByPositionAndType(
          this.db,
          position.id,
          StateMachine.LongOrderType.LONG_BUY_MORE,
        );
        if (!longBuyMoreOrder || !longBuyMoreOrder.amountOut) {
          throw new Error("LONG_BUY_MORE order not found or amountOut not set");
        }

        // Create 4 LONG closing orders
        await OrderRepository.createOrders(trx, [
          {
            positionId: position.id,
            orderType: StateMachine.LongOrderType.LONG_SELL,
            assetIn: marketConfig.assetB.toString(),
            amountIn: longBuyMoreOrder.amountOut,
            assetOut: marketConfig.assetA.toString(),
          },
          {
            positionId: position.id,
            orderType: StateMachine.LongOrderType.LONG_REPAY,
          },
          {
            positionId: position.id,
            orderType: StateMachine.LongOrderType.LONG_WITHDRAW,
          },
          {
            positionId: position.id,
            orderType: StateMachine.LongOrderType.LONG_SELL_ALL,
          },
        ]);
      } else {
        // Get the SHORT_SELL order to get the amountOut (ADA received from selling)
        const shortSellOrder = await OrderRepository.getOrderByPositionAndType(
          this.db,
          position.id,
          StateMachine.ShortOrderType.SHORT_SELL,
        );
        if (!shortSellOrder || !shortSellOrder.amountOut) {
          throw new Error("SHORT_SELL order not found or amountOut not set");
        }

        // Create 3 SHORT closing orders: buy asset B → repay loan → withdraw ADA
        await OrderRepository.createOrders(trx, [
          {
            positionId: position.id,
            orderType: StateMachine.ShortOrderType.SHORT_BUY,
            assetIn: marketConfig.assetA.toString(),
            amountIn: shortSellOrder.amountOut,
            assetOut: marketConfig.assetB.toString(),
          },
          {
            positionId: position.id,
            orderType: StateMachine.ShortOrderType.SHORT_REPAY,
          },
          {
            positionId: position.id,
            orderType: StateMachine.ShortOrderType.SHORT_WITHDRAW,
          },
        ]);
      }

      // Return updated position
      return {
        ...position,
        status: StateMachine.PositionStatus.CLOSING,
      };
    });

    logger.info("Position close initiated", {
      positionId: position.id,
      userAddress,
      marketId,
      previousStatus: position.status,
      newStatus: StateMachine.PositionStatus.CLOSING,
    });

    return { success: true, position: updatedPosition };
  }
}
