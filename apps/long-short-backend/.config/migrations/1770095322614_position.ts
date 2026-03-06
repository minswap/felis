import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Create position table
  await db.schema
    .createTable("position")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("user_address", "varchar(128)", (col) => col.notNull())
    .addColumn("market", "varchar(128)", (col) => col.notNull())
    .addColumn("side", "varchar(8)", (col) => col.notNull()) // LONG, SHORT
    .addColumn("status", "varchar(16)", (col) => col.notNull().defaultTo("OPEN")) // OPEN, CLOSED, LIQUIDATED
    .addColumn("leverage", "numeric", (col) => col.notNull())
    .addColumn("collateral_asset", "varchar(128)", (col) => col.notNull())
    .addColumn("collateral_amount", "numeric", (col) => col.notNull())
    .addColumn("entry_price", "numeric", (col) => col.notNull())
    .addColumn("position_size", "numeric", (col) => col.notNull())
    .addColumn("borrowed_amount", "numeric", (col) => col.notNull())
    .addColumn("liquidation_price", "numeric", (col) => col.notNull())
    .addColumn("take_profit_price", "numeric")
    .addColumn("stop_loss_price", "numeric")
    .addColumn("realized_pnl", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("unrealized_pnl", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("funding_paid", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("liqwid_supply_id", "varchar(128)")
    .addColumn("liqwid_borrow_id", "varchar(128)")
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamp", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("closed_at", "timestamp")
    .execute();

  // Create indexes for position table
  await db.schema
    .createIndex("idx_position_user_address")
    .on("position")
    .column("user_address")
    .execute();

  await db.schema
    .createIndex("idx_position_market")
    .on("position")
    .column("market")
    .execute();

  await db.schema
    .createIndex("idx_position_status")
    .on("position")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_position_user_status")
    .on("position")
    .columns(["user_address", "status"])
    .execute();

  // Create order table
  await db.schema
    .createTable("order")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("position_id", "bigint", (col) => col.references("position.id").onDelete("set null"))
    .addColumn("user_address", "varchar(128)", (col) => col.notNull())
    .addColumn("market", "varchar(128)", (col) => col.notNull())
    .addColumn("order_type", "varchar(16)", (col) => col.notNull()) // MARKET, LIMIT, STOP_MARKET, STOP_LIMIT
    .addColumn("side", "varchar(8)", (col) => col.notNull()) // LONG, SHORT
    .addColumn("action", "varchar(16)", (col) => col.notNull()) // OPEN, CLOSE, INCREASE, DECREASE
    .addColumn("status", "varchar(16)", (col) => col.notNull().defaultTo("PENDING")) // PENDING, FILLED, CANCELLED, EXPIRED
    .addColumn("leverage", "numeric")
    .addColumn("collateral_amount", "numeric")
    .addColumn("size", "numeric", (col) => col.notNull())
    .addColumn("price", "numeric") // limit price
    .addColumn("trigger_price", "numeric") // for stop orders
    .addColumn("slippage_tolerance", "numeric")
    .addColumn("tx_hash", "varchar(64)")
    .addColumn("filled_price", "numeric")
    .addColumn("filled_at", "timestamp")
    .addColumn("expires_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create indexes for order table
  await db.schema
    .createIndex("idx_order_user_address")
    .on("order")
    .column("user_address")
    .execute();

  await db.schema
    .createIndex("idx_order_position_id")
    .on("order")
    .column("position_id")
    .execute();

  await db.schema
    .createIndex("idx_order_market")
    .on("order")
    .column("market")
    .execute();

  await db.schema
    .createIndex("idx_order_status")
    .on("order")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_order_user_status")
    .on("order")
    .columns(["user_address", "status"])
    .execute();

  await db.schema
    .createIndex("idx_order_tx_hash")
    .on("order")
    .column("tx_hash")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop order table first (has FK to position)
  await db.schema.dropTable("order").ifExists().execute();

  // Drop position table
  await db.schema.dropTable("position").ifExists().execute();
}
