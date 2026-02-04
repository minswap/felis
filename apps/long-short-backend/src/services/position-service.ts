import type { Kysely } from "kysely";
import { Address, type NetworkEnvironment } from "@minswap/felis-ledger-core";
import { getMarketConfig, isSupportedMarket } from "../config/market";
import type { DB } from "../database";
import { type Position, PositionRepository } from "../repository/position-repository";
import { OrderRepository } from "../repository/order-repository";
import { StateMachine } from "../api/state-machine";
import { logger } from "../utils";
import { CardanoscanProvider } from "../provider";

export type CreatePositionInput = {
  userAddress: string;
  marketId: string;
  side: "LONG";
  amountIn: bigint;
};

export type CreatePositionResult =
  | { success: true; position: Position }
  | { success: false; error: string };

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
    const existingPosition = await PositionRepository.getOpenPositionByUserAndMarket(
      this.db,
      userAddress,
      marketId,
    );

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
    const position = await PositionRepository.getOpenPositionByUserAndMarket(
      this.db,
      userAddress,
      marketId,
    );

    if (!position) {
      return { success: false, error: "No open position found for this market" };
    }

    // Find next unhandled order
    const order = await OrderRepository.getNextUnhandledOrder(this.db, position.id);
    if (!order) {
      return { success: false, error: "No unhandled order found" };
    }

    try {
      // Case 1: Order has built_tx_id not null => check if tx appears on chain
      if (order.builtTxId) {
        logger.info("Order has built_tx_id, checking transaction status", {
          orderId: order.id,
          builtTxId: order.builtTxId,
        });

        const address = Address.fromBech32(userAddress);
        const txFound = await this.cardanoscanProvider.findTransactionByHash(
          address,
          order.builtTxId,
          50, // pageSize
          10, // maxPage - search up to 10 pages (500 transactions)
        );

        // Case 1a: Transaction found on chain => order is handled, move to next
        if (txFound) {
          logger.info("Transaction found on chain", {
            orderId: order.id,
            txHash: order.builtTxId,
          });
          return {
            success: false,
            error: "Transaction already submitted and found on chain. This order is being processed.",
          };
        }

        // Case 3: Transaction not found on chain
        // Check if transaction has expired
        const now = new Date();
        const validTo = order.builtValidTo;

        if (!validTo) {
          logger.warn("Order has built_tx_id but no built_valid_to, rebuilding", {
            orderId: order.id,
          });
          // Fall through to rebuild
        } else if (validTo < now) {
          // Case 3a: Transaction expired => rebuild
          logger.info("Transaction expired, rebuilding", {
            orderId: order.id,
            validTo: validTo.toISOString(),
            now: now.toISOString(),
          });
          // Fall through to rebuild
        } else {
          // Case 3b: Transaction not expired yet => wait
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

      // Case 2: Order has no built_tx_id OR transaction expired => build new transaction
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
