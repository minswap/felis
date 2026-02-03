import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("market_config")
    .addColumn("market_id", "varchar(64)", (col) => col.primaryKey())
    .addColumn("asset_a", "varchar(128)", (col) => col.notNull())
    .addColumn("asset_b", "varchar(128)", (col) => col.notNull())
    .addColumn("amm_lp_asset", "varchar(128)", (col) => col.notNull())
    .addColumn("asset_a_q_token_ticker", "varchar(32)", (col) => col.notNull())
    .addColumn("asset_a_q_token_raw", "varchar(128)", (col) => col.notNull())
    .addColumn("asset_b_q_token_ticker", "varchar(32)", (col) => col.notNull())
    .addColumn("asset_b_q_token_raw", "varchar(128)", (col) => col.notNull())
    .addColumn("collateral_market_id", "varchar(64)", (col) => col.notNull())
    .addColumn("leverage", "integer", (col) => col.notNull())
    .addColumn("min_collateral", "numeric", (col) => col.notNull())
    .addColumn("enable", "boolean", (col) => col.notNull().defaultTo(true))
    .execute();

  // Create index on enable for filtering active markets
  await db.schema
    .createIndex("idx_market_config_enable")
    .on("market_config")
    .column("enable")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("market_config").ifExists().execute();
}
