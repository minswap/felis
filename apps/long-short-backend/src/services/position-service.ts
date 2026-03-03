import { Address, Asset, type NetworkEnvironment } from "@minswap/felis-ledger-core";
import invariant from "@minswap/tiny-invariant";
import type { Kysely } from "kysely";
import { StateMachine } from "../api/state-machine";
import { getMarketConfig, isSupportedMarket } from "../config/market";
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

        // For LONG_REPAY_FRACTION, pass the original debt (stored in amountOut during creation)
        if (waitingOrder.orderType === StateMachine.LongOrderType.LONG_REPAY_FRACTION) {
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

      // LONG_REPAY and LONG_REPAY_FRACTION: no extra options needed — handlers fetch
      // loan data directly from the Liqwid API (always up-to-date, even after modifyBorrow).

      // For LONG_WITHDRAW, we need the amountOut from LONG_SUPPLY order
      if (order.orderType === StateMachine.LongOrderType.LONG_WITHDRAW) {
        const supplyOrder = await OrderRepository.getOrderByPositionAndType(
          this.db,
          position.id,
          StateMachine.LongOrderType.LONG_SUPPLY,
        );
        if (!supplyOrder?.amountOut) {
          return { success: false, error: "LONG_SUPPLY order not found or amountOut not set" };
        }
        buildOptions.supplyAmountOut = supplyOrder.amountOut;
      }

      // For SHORT_REPAY, we need the loan transaction ID, output index, and collateral amount from SHORT_BORROW
      if (order.orderType === StateMachine.ShortOrderType.SHORT_REPAY) {
        const borrowOrder = await OrderRepository.getOrderByPositionAndType(
          this.db,
          position.id,
          StateMachine.ShortOrderType.SHORT_BORROW,
        );
        if (!borrowOrder?.createdTxId) {
          return { success: false, error: "SHORT_BORROW order not found or not confirmed yet" };
        }
        if (!borrowOrder.amountIn) {
          return { success: false, error: "SHORT_BORROW order amountIn (collateral amount) not set" };
        }
        buildOptions.loanTxId = borrowOrder.createdTxId;
        buildOptions.loanOutputIndex = borrowOrder.createdTxIndex ?? 0;
        buildOptions.collateralAmount = borrowOrder.amountIn; // qADA amount used as collateral
      }

      // For SHORT_WITHDRAW, we need the amountIn from SHORT_SUPPLY order (original ADA supplied, not qADA)
      if (order.orderType === StateMachine.ShortOrderType.SHORT_WITHDRAW) {
        const supplyOrder = await OrderRepository.getOrderByPositionAndType(
          this.db,
          position.id,
          StateMachine.ShortOrderType.SHORT_SUPPLY,
        );
        if (!supplyOrder?.amountIn) {
          return { success: false, error: "SHORT_SUPPLY order not found or amountIn not set" };
        }
        buildOptions.supplyAmountOut = supplyOrder.amountIn;
      }

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
