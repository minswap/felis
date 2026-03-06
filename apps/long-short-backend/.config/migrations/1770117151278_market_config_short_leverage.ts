import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "market_config" RENAME COLUMN "leverage" TO "long_leverage"`.execute(db);
  await sql`ALTER TABLE "market_config" ADD COLUMN "short_leverage" NUMERIC NOT NULL DEFAULT 0`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "market_config" DROP COLUMN "short_leverage"`.execute(db);
  await sql`ALTER TABLE "market_config" RENAME COLUMN "long_leverage" TO "leverage"`.execute(db);
}
