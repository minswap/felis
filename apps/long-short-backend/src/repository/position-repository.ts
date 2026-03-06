import type { Kysely, Transaction } from "kysely";
import { StateMachine } from "../api/state-machine";
import type { DB } from "../database";

export type CreatePositionParams = {
  marketId: string;
  userAddress: string;
  side: StateMachine.PositionSide;
  amountIn: string;
  amountBorrow: string;
};

export type Position = {
  id: bigint;
  marketId: string;
  userAddress: string;
  side: StateMachine.PositionSide;
  status: StateMachine.PositionStatus;
  amountIn: string;
  amountBorrow: string;
  createdAt: Date;
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
        market_id: params.marketId,
        user_address: params.userAddress,
        side: params.side,
        status: StateMachine.PositionStatus.PENDING,
        amount_in: params.amountIn,
        amount_borrow: params.amountBorrow,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapPositionRow(result);
  }

  export async function getPositionById(db: Kysely<DB> | Transaction<DB>, id: bigint): Promise<Position | null> {
    const result = await db.selectFrom("position").selectAll().where("id", "=", id.toString()).executeTakeFirst();

    return result ? mapPositionRow(result) : null;
  }

  export async function getOpenPositionByUser(
    db: Kysely<DB> | Transaction<DB>,
    userAddress: string,
  ): Promise<Position | null> {
    const result = await db
      .selectFrom("position")
      .selectAll()
      .where("user_address", "=", userAddress)
      .where("closed_at", "is", null)
      .executeTakeFirst();

    return result ? mapPositionRow(result) : null;
  }

  export async function getOpenPositionByUserAndMarket(
    db: Kysely<DB> | Transaction<DB>,
    userAddress: string,
    marketId: string,
  ): Promise<Position | null> {
    const result = await db
      .selectFrom("position")
      .selectAll()
      .where("user_address", "=", userAddress)
      .where("market_id", "=", marketId)
      .where("closed_at", "is", null)
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
      .where("closed_at", "is", null)
      .orderBy("created_at", "desc")
      .execute();

    return results.map(mapPositionRow);
  }

  export async function getUserPositions(
    db: Kysely<DB> | Transaction<DB>,
    userAddress: string,
    options?: { includesClosed?: boolean; limit?: number; offset?: number },
  ): Promise<Position[]> {
    let query = db.selectFrom("position").selectAll().where("user_address", "=", userAddress);

    if (!options?.includesClosed) {
      query = query.where("closed_at", "is", null);
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
    status: StateMachine.PositionStatus,
  ): Promise<void> {
    const updates: Record<string, unknown> = { status };

    if (status === StateMachine.PositionStatus.CLOSED) {
      updates.closed_at = new Date();
    }

    await db.updateTable("position").set(updates).where("id", "=", id.toString()).execute();
  }

  // biome-ignore lint/suspicious/noExplicitAny: DB row type
  function mapPositionRow(row: any): Position {
    return {
      id: BigInt(row.id),
      marketId: row.market_id,
      userAddress: row.user_address,
      side: row.side as StateMachine.PositionSide,
      status: row.status as StateMachine.PositionStatus,
      amountIn: row.amount_in,
      amountBorrow: row.amount_borrow,
      createdAt: new Date(row.created_at),
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
    };
  }
}
