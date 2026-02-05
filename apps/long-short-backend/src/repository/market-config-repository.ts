import type { Kysely, Selectable, Transaction } from "kysely";
import type { DB } from "../database";

export type MarketConfigRow = Selectable<DB["market_config"]>;

export namespace MarketConfigRepository {
  /**
   * Get market config row by market ID
   */
  export async function getMarketConfigRowById(
    db: Kysely<DB> | Transaction<DB>,
    marketId: string,
  ): Promise<MarketConfigRow | null> {
    const result = await db
      .selectFrom("market_config")
      .selectAll()
      .where("market_id", "=", marketId)
      .executeTakeFirst();

    return result ?? null;
  }

  /**
   * Get market config row by market ID (throws if not found)
   */
  export async function getMarketConfigRowByIdOrThrow(
    db: Kysely<DB> | Transaction<DB>,
    marketId: string,
  ): Promise<MarketConfigRow> {
    return db.selectFrom("market_config").selectAll().where("market_id", "=", marketId).executeTakeFirstOrThrow();
  }
}
