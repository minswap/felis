import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Step 1: Drop existing order table
  await db.schema.dropTable("order").ifExists().execute();

  // Step 2: Create new order table
  await db.schema
    .createTable("order")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("position_id", "bigint", (col) => col.notNull()) // ref to position.id (not FK)
    .addColumn("order_type", "varchar(32)", (col) => col.notNull()) // OPEN | CLOSE | INCREASE | DECREASE
    .addColumn("created_tx_id", "varchar(64)", (col) => col.notNull())
    .addColumn("created_tx_index", "integer", (col) => col.notNull())
    .addColumn("asset_in", "varchar(128)")
    .addColumn("amount_in", "numeric")
    .addColumn("asset_out", "varchar(128)")
    .addColumn("amount_out", "numeric")
    .execute();

  // Create index on position_id
  await db.schema
    .createIndex("idx_order_position_id")
    .on("order")
    .column("position_id")
    .execute();

  // Create index on created_tx_id
  await db.schema
    .createIndex("idx_order_created_tx_id")
    .on("order")
    .column("created_tx_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("order").ifExists().execute();
}
