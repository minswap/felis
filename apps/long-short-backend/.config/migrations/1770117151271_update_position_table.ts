import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Step 1: Drop the FK constraint on order.position_id (keep as indexed column only)
  await sql`ALTER TABLE "order" DROP CONSTRAINT IF EXISTS "order_position_id_fkey"`.execute(db);

  // Step 2: Drop existing position table
  await db.schema.dropTable("position").ifExists().execute();

  // Step 3: Create new position table
  await db.schema
    .createTable("position")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("market_id", "varchar(64)", (col) => col.notNull().references("market_config.market_id"))
    .addColumn("user_address", "varchar(128)", (col) => col.notNull())
    .addColumn("side", "varchar(8)", (col) => col.notNull()) // LONG | SHORT
    .addColumn("status", "varchar(16)", (col) => col.notNull().defaultTo("PENDING")) // PENDING | OPEN | CLOSING | CLOSE
    .addColumn("amount_in", "numeric", (col) => col.notNull())
    .addColumn("amount_borrow", "numeric", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("closed_at", "timestamp")
    .execute();

  // Create index on market_id
  await db.schema
    .createIndex("idx_position_market_id")
    .on("position")
    .column("market_id")
    .execute();

  // Create index on user_address
  await db.schema
    .createIndex("idx_position_user_address")
    .on("position")
    .column("user_address")
    .execute();

  // Create index on closed_at
  await db.schema
    .createIndex("idx_position_closed_at")
    .on("position")
    .column("closed_at")
    .execute();

  // Create partial unique index for open positions (closed_at IS NULL)
  // This ensures only one open position per user per market
  await sql`CREATE UNIQUE INDEX idx_position_user_market_unique_open
    ON position (user_address, market_id)
    WHERE closed_at IS NULL`.execute(db);

  // Create unique constraint for closed positions
  await sql`CREATE UNIQUE INDEX idx_position_user_market_closed_unique
    ON position (user_address, market_id, closed_at)
    WHERE closed_at IS NOT NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("position").ifExists().execute();
}
