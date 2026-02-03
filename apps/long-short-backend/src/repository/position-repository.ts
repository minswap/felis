import type { Kysely, Transaction } from "kysely";
import type { DB } from "../database";

export type PositionStatus = "OPEN" | "CLOSED" | "LIQUIDATED";
export type PositionSide = "LONG" | "SHORT";

export type CreatePositionParams = {
  userAddress: string;
  market: string;
  side: PositionSide;
  leverage: string;
  collateralAsset: string;
  collateralAmount: string;
  entryPrice: string;
  positionSize: string;
  borrowedAmount: string;
  liquidationPrice: string;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  liqwidSupplyId?: string;
  liqwidBorrowId?: string;
};

export type Position = {
  id: bigint;
  userAddress: string;
  market: string;
  side: PositionSide;
  status: PositionStatus;
  leverage: string;
  collateralAsset: string;
  collateralAmount: string;
  entryPrice: string;
  positionSize: string;
  borrowedAmount: string;
  liquidationPrice: string;
  takeProfitPrice: string | null;
  stopLossPrice: string | null;
  realizedPnl: string;
  unrealizedPnl: string;
  fundingPaid: string;
  liqwidSupplyId: string | null;
  liqwidBorrowId: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
};

export namespace PositionRepository {
  export async function createPosition(
    db: Kysely<DB> | Transaction<DB>,
    params: CreatePositionParams,
  ): Promise<Position> {
    const result = await db
      .insertInto("position")
      .values({
        user_address: params.userAddress,
        market: params.market,
        side: params.side,
        status: "OPEN",
        leverage: params.leverage,
        collateral_asset: params.collateralAsset,
        collateral_amount: params.collateralAmount,
        entry_price: params.entryPrice,
        position_size: params.positionSize,
        borrowed_amount: params.borrowedAmount,
        liquidation_price: params.liquidationPrice,
        take_profit_price: params.takeProfitPrice ?? null,
        stop_loss_price: params.stopLossPrice ?? null,
        liqwid_supply_id: params.liqwidSupplyId ?? null,
        liqwid_borrow_id: params.liqwidBorrowId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapPositionRow(result);
  }

  export async function getPositionById(
    db: Kysely<DB> | Transaction<DB>,
    id: bigint,
  ): Promise<Position | null> {
    const result = await db
      .selectFrom("position")
      .selectAll()
      .where("id", "=", id.toString())
      .executeTakeFirst();

    return result ? mapPositionRow(result) : null;
  }

  export async function getOpenPositionByUserAndMarket(
    db: Kysely<DB> | Transaction<DB>,
    userAddress: string,
    market: string,
  ): Promise<Position | null> {
    const result = await db
      .selectFrom("position")
      .selectAll()
      .where("user_address", "=", userAddress)
      .where("market", "=", market)
      .where("status", "=", "OPEN")
      .executeTakeFirst();

    return result ? mapPositionRow(result) : null;
  }

  export async function getUserOpenPositions(
    db: Kysely<DB> | Transaction<DB>,
    userAddress: string,
  ): Promise<Position[]> {
    const results = await db
      .selectFrom("position")
      .selectAll()
      .where("user_address", "=", userAddress)
      .where("status", "=", "OPEN")
      .orderBy("created_at", "desc")
      .execute();

    return results.map(mapPositionRow);
  }

  export async function getUserPositions(
    db: Kysely<DB> | Transaction<DB>,
    userAddress: string,
    options?: { status?: PositionStatus; limit?: number; offset?: number },
  ): Promise<Position[]> {
    let query = db
      .selectFrom("position")
      .selectAll()
      .where("user_address", "=", userAddress);

    if (options?.status) {
      query = query.where("status", "=", options.status);
    }

    query = query.orderBy("created_at", "desc");

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const results = await query.execute();
    return results.map(mapPositionRow);
  }

  export async function updatePositionStatus(
    db: Kysely<DB> | Transaction<DB>,
    id: bigint,
    status: PositionStatus,
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };

    if (status === "CLOSED" || status === "LIQUIDATED") {
      updates.closed_at = new Date();
    }

    await db
      .updateTable("position")
      .set(updates)
      .where("id", "=", id.toString())
      .execute();
  }

  // biome-ignore lint/suspicious/noExplicitAny: DB row type
  function mapPositionRow(row: any): Position {
    return {
      id: BigInt(row.id),
      userAddress: row.user_address,
      market: row.market,
      side: row.side as PositionSide,
      status: row.status as PositionStatus,
      leverage: row.leverage,
      collateralAsset: row.collateral_asset,
      collateralAmount: row.collateral_amount,
      entryPrice: row.entry_price,
      positionSize: row.position_size,
      borrowedAmount: row.borrowed_amount,
      liquidationPrice: row.liquidation_price,
      takeProfitPrice: row.take_profit_price,
      stopLossPrice: row.stop_loss_price,
      realizedPnl: row.realized_pnl,
      unrealizedPnl: row.unrealized_pnl,
      fundingPaid: row.funding_paid,
      liqwidSupplyId: row.liqwid_supply_id,
      liqwidBorrowId: row.liqwid_borrow_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
    };
  }
}
