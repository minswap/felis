import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "market_config" RENAME COLUMN "collateral_market_id" TO "long_collateral_market_id"`.execute(db);
  await sql`ALTER TABLE "market_config" ADD COLUMN "short_collateral_market_id" VARCHAR(64) NOT NULL DEFAULT ''`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "market_config" DROP COLUMN "short_collateral_market_id"`.execute(db);
  await sql`ALTER TABLE "market_config" RENAME COLUMN "long_collateral_market_id" TO "collateral_market_id"`.execute(db);
}
