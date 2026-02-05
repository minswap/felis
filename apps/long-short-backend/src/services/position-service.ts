import { Address, Asset, type NetworkEnvironment } from "@minswap/felis-ledger-core";
import invariant from "@minswap/tiny-invariant";
import type { Kysely } from "kysely";
import { StateMachine } from "../api/state-machine";
import { getMarketConfig, isSupportedMarket } from "../config/market";
import type { DB } from "../database";
import type { CardanoscanProvider } from "../provider";
import { OrderRepository } from "../repository/order-repository";
import { type Position, PositionRepository } from "../repository/position-repository";
import { logger } from "../utils";

export type CreatePositionInput = {
  userAddress: string;
  marketId: string;
  side: "LONG";
  amountIn: bigint;
};

export type CreatePositionResult = { success: true; position: Position } | { success: false; error: string };

export type BuildTxInput = {
  userAddress: string;
  marketId: string;
  utxos: string[];
};

export type BuildTxResult =
  | { success: true; txRaw: string; orderType: string }
  | { success: true; waiting: true; orderType: string; message: string }
  | { success: false; error: string };

export class PositionService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly networkEnv: NetworkEnvironment,
    private readonly cardanoscanProvider: CardanoscanProvider,
  ) {}

  async createPosition(input: CreatePositionInput): Promise<CreatePositionResult> {
    const { userAddress, marketId, side, amountIn } = input;

    // Only LONG side is supported
    if (side !== "LONG") {
      return { success: false, error: "Only LONG side is supported" };
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

    // Calculate amount_borrow = amount_in * (leverage - 1)
    const amountBorrow = BigInt(Math.floor(Number(amountIn) * (marketConfig.leverage - 1)));

    // Execute transaction: create position + 4 orders
    const position = await this.db.transaction().execute(async (trx) => {
      const pos = await PositionRepository.createPosition(trx, {
        marketId,
        userAddress,
        side: side as StateMachine.PositionSide,
        amountIn: amountIn.toString(),
        amountBorrow: amountBorrow.toString(),
      });

      // Create 4 LONG orders
      await OrderRepository.createOrders(trx, [
        {
          positionId: pos.id,
          orderType: StateMachine.LongOrderType.LONG_BUY,
          assetIn: marketConfig.assetA.toString(),
          amountIn: pos.amountIn,
          assetOut: marketConfig.assetB.toString(),
          amountOut: "1",
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
        logger.info("Found waiting order, checking if output is spent", {
          orderId: waitingOrder.id,
          orderType: waitingOrder.orderType,
          createdTxId: waitingOrder.createdTxId,
        });
        invariant(waitingOrder.assetOut, "Waiting order must have assetOut defined");
        invariant(waitingOrder.createdTxId, "Waiting order must have createdTxId defined");

        const address = Address.fromBech32(userAddress);

        // Call appropriate waiting function based on order type
        if (waitingOrder.orderType === StateMachine.LongOrderType.LONG_BUY) {
          const waitingResult = await StateMachine.waitingLongBuy({
            marketConfig,
            txHash: waitingOrder.createdTxId,
            orderOutputIndex: waitingOrder.createdTxIndex ?? 0,
            userAddress: address,
            assetOut: Asset.fromString(waitingOrder.assetOut),
            cardanoscanProvider: this.cardanoscanProvider,
          });

          if (waitingResult.isSpent) {
            // Order output has been spent - find and update the next order
            logger.info("Order output spent, updating next order", {
              orderId: waitingOrder.id,
              nextOrderType: waitingResult.nextOrderType,
            });

            // Find the order with the next order type
            const nextOrder = await this.db
              .selectFrom("order")
              .selectAll()
              .where("position_id", "=", waitingOrder.positionId.toString())
              .where("order_type", "=", waitingResult.nextOrderType)
              .executeTakeFirst();

            if (!nextOrder) {
              logger.error("Next order not found", {
                positionId: waitingOrder.positionId,
                nextOrderType: waitingResult.nextOrderType,
              });
              return {
                success: false,
                error: `Next order with type "${waitingResult.nextOrderType}" not found`,
              };
            }

            // Update the next order with details and set current order waiting = false
            await OrderRepository.updateOrderNextDetails(
              this.db,
              BigInt(nextOrder.id),
              waitingResult.assetIn,
              waitingResult.amountIn,
              waitingResult.assetOut,
            );
            await OrderRepository.setOrderWaiting(this.db, waitingOrder.id, false);

            logger.info("Next order updated, current order no longer waiting", {
              currentOrderId: waitingOrder.id,
              nextOrderId: nextOrder.id,
              assetIn: waitingResult.assetIn,
              amountIn: waitingResult.amountIn,
              assetOut: waitingResult.assetOut,
            });

            return {
              success: false,
              error: "Order processed. Next order details updated. Call build-tx again to continue.",
            };
          } else {
            // Order output not spent yet
            return {
              success: false,
              error: "Transaction confirmed on chain. Waiting for order to be processed.",
            };
          }
        } else {
          // Other order types not implemented yet
          return {
            success: false,
            error: `Waiting logic for order type "${waitingOrder.orderType}" is not implemented yet`,
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
          50, // pageSize
          10, // maxPage - search up to 10 pages (500 transactions)
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

      // Fetch raw DB rows for StateMachine handlers
      const orderRow = await this.db
        .selectFrom("order")
        .selectAll()
        .where("id", "=", order.id.toString())
        .executeTakeFirstOrThrow();

      const marketConfigRow = await this.db
        .selectFrom("market_config")
        .selectAll()
        .where("market_id", "=", marketId)
        .executeTakeFirstOrThrow();

      // Build transaction based on order type
      let txResult: { txRaw: string; txId: string; outputsHash: string; validTo: number };

      switch (order.orderType) {
        case StateMachine.LongOrderType.LONG_BUY:
          txResult = await StateMachine.handleLongBuy({
            order: orderRow,
            marketConfig: marketConfigRow,
            userAddress,
            networkEnv: this.networkEnv,
            utxos,
          });
          break;
        case StateMachine.LongOrderType.LONG_SUPPLY:
          txResult = await StateMachine.handleLongSupply({
            order: orderRow,
            userAddress,
            networkEnv: this.networkEnv,
            utxos,
          });
          break;
        default:
          return { success: false, error: `Order type "${order.orderType}" is not implemented` };
      }

      // Update order built_tx fields
      await OrderRepository.updateOrderBuiltTx(
        this.db,
        order.id,
        txResult.txId,
        txResult.outputsHash,
        new Date(txResult.validTo),
      );

      logger.info("Transaction built successfully", {
        orderId: order.id,
        txId: txResult.txId,
        validTo: new Date(txResult.validTo).toISOString(),
      });

      return { success: true, txRaw: txResult.txRaw, orderType: order.orderType };
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
}
