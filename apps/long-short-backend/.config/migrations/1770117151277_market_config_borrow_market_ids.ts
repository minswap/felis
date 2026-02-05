import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "market_config" ADD COLUMN "borrow_market_id_long" TEXT NOT NULL DEFAULT ''`.execute(db);
  await sql`ALTER TABLE "market_config" ADD COLUMN "borrow_market_id_short" TEXT NOT NULL DEFAULT ''`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "market_config" DROP COLUMN "borrow_market_id_long"`.execute(db);
  await sql`ALTER TABLE "market_config" DROP COLUMN "borrow_market_id_short"`.execute(db);
}
