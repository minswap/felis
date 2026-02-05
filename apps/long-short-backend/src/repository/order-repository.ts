import type { Kysely, Transaction } from "kysely";
import type { DB } from "../database";

export type CreateOrderParams = {
  positionId: bigint;
  orderType: string;
  createdTxId?: string | null;
  createdTxIndex?: number | null;
  assetIn?: string | null;
  amountIn?: string | null;
  assetOut?: string | null;
  amountOut?: string | null;
};

export type Order = {
  id: bigint;
  positionId: bigint;
  orderType: string;
  createdTxId: string | null;
  createdTxIndex: number | null;
  assetIn: string | null;
  amountIn: string | null;
  assetOut: string | null;
  amountOut: string | null;
  builtTxId: string | null;
  builtOutputsHash: string | null;
  builtValidTo: Date | null;
  waiting: boolean;
};

export namespace OrderRepository {
  export async function createOrder(db: Kysely<DB> | Transaction<DB>, params: CreateOrderParams): Promise<Order> {
    const result = await db
      .insertInto("order")
      .values({
        position_id: params.positionId.toString(),
        order_type: params.orderType,
        created_tx_id: params.createdTxId ?? null,
        created_tx_index: params.createdTxIndex ?? null,
        asset_in: params.assetIn ?? null,
        amount_in: params.amountIn ?? null,
        asset_out: params.assetOut ?? null,
        amount_out: params.amountOut ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapOrderRow(result);
  }

  export async function createOrders(db: Kysely<DB> | Transaction<DB>, params: CreateOrderParams[]): Promise<Order[]> {
    const results = await db
      .insertInto("order")
      .values(
        params.map((p) => ({
          position_id: p.positionId.toString(),
          order_type: p.orderType,
          created_tx_id: p.createdTxId ?? null,
          created_tx_index: p.createdTxIndex ?? null,
          asset_in: p.assetIn ?? null,
          amount_in: p.amountIn ?? null,
          asset_out: p.assetOut ?? null,
          amount_out: p.amountOut ?? null,
        })),
      )
      .returningAll()
      .execute();

    return results.map(mapOrderRow);
  }

  export async function getOrdersByPositionId(db: Kysely<DB> | Transaction<DB>, positionId: bigint): Promise<Order[]> {
    const results = await db.selectFrom("order").selectAll().where("position_id", "=", positionId.toString()).execute();

    return results.map(mapOrderRow);
  }

  /**
   * Find the next unhandled order for a position.
   * An order is ready to handle if it has asset_in, amount_in, asset_out and created_tx_id is null or empty.
   */
  export async function getNextUnhandledOrder(
    db: Kysely<DB> | Transaction<DB>,
    positionId: bigint,
  ): Promise<Order | null> {
    const result = await db
      .selectFrom("order")
      .selectAll()
      .where("position_id", "=", positionId.toString())
      .where((eb) => eb.or([eb("created_tx_id", "is", null), eb("created_tx_id", "=", "")]))
      .where("asset_in", "is not", null)
      .where("amount_in", "is not", null)
      .where("asset_out", "is not", null)
      .orderBy("id", "asc")
      .executeTakeFirst();

    return result ? mapOrderRow(result) : null;
  }

  /**
   * Update order built_tx fields after building transaction
   */
  export async function updateOrderBuiltTx(
    db: Kysely<DB> | Transaction<DB>,
    orderId: bigint,
    builtTxId: string,
    builtOutputsHash: string | null | undefined,
    builtValidTo: Date,
  ): Promise<void> {
    await db
      .updateTable("order")
      .set({
        built_tx_id: builtTxId,
        built_outputs_hash: builtOutputsHash,
        built_valid_to: builtValidTo,
      })
      .where("id", "=", orderId.toString())
      .execute();
  }

  /**
   * Update order created_tx fields when transaction is found on chain
   */
  export async function updateOrderCreatedTx(
    db: Kysely<DB> | Transaction<DB>,
    orderId: bigint,
    createdTxId: string,
    createdTxIndex: number,
  ): Promise<void> {
    await db
      .updateTable("order")
      .set({
        created_tx_id: createdTxId,
        created_tx_index: createdTxIndex,
      })
      .where("id", "=", orderId.toString())
      .execute();
  }

  /**
   * Update order with next order details when current order output is spent
   */
  export async function updateOrderNextDetails(
    db: Kysely<DB> | Transaction<DB>,
    orderId: bigint,
    assetIn: string,
    amountIn: string,
    assetOut: string,
  ): Promise<void> {
    await db
      .updateTable("order")
      .set({
        asset_in: assetIn,
        amount_in: amountIn,
        asset_out: assetOut,
      })
      .where("id", "=", orderId.toString())
      .execute();
  }

  /**
   * Find an order that has created_tx_id not null and waiting = true
   * This order has been confirmed on chain and is waiting for its output to be spent
   */
  export async function getWaitingOrder(db: Kysely<DB> | Transaction<DB>, positionId: bigint): Promise<Order | null> {
    const result = await db
      .selectFrom("order")
      .selectAll()
      .where("position_id", "=", positionId.toString())
      .where("created_tx_id", "is not", null)
      .where("waiting", "=", true)
      .orderBy("id", "asc")
      .executeTakeFirst();

    return result ? mapOrderRow(result) : null;
  }

  /**
   * Set order waiting flag to false
   */
  export async function setOrderWaiting(
    db: Kysely<DB> | Transaction<DB>,
    orderId: bigint,
    waiting: boolean,
  ): Promise<void> {
    await db.updateTable("order").set({ waiting }).where("id", "=", orderId.toString()).execute();
  }

  /**
   * Get order by position ID and order type
   */
  export async function getOrderByPositionAndType(
    db: Kysely<DB> | Transaction<DB>,
    positionId: bigint,
    orderType: string,
  ): Promise<Order | null> {
    const result = await db
      .selectFrom("order")
      .selectAll()
      .where("position_id", "=", positionId.toString())
      .where("order_type", "=", orderType)
      .executeTakeFirst();

    return result ? mapOrderRow(result) : null;
  }

  /**
   * Get order by ID
   */
  export async function getOrderById(db: Kysely<DB> | Transaction<DB>, orderId: bigint): Promise<Order | null> {
    const result = await db.selectFrom("order").selectAll().where("id", "=", orderId.toString()).executeTakeFirst();

    return result ? mapOrderRow(result) : null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: DB row type
  function mapOrderRow(row: any): Order {
    return {
      id: BigInt(row.id),
      positionId: BigInt(row.position_id),
      orderType: row.order_type,
      createdTxId: row.created_tx_id,
      createdTxIndex: row.created_tx_index,
      assetIn: row.asset_in,
      amountIn: row.amount_in,
      assetOut: row.asset_out,
      amountOut: row.amount_out,
      builtTxId: row.built_tx_id,
      builtOutputsHash: row.built_outputs_hash,
      builtValidTo: row.built_valid_to ? new Date(row.built_valid_to) : null,
      waiting: row.waiting,
    };
  }
}
