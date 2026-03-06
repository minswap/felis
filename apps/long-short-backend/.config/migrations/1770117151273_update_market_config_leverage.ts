import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "market_config" ALTER COLUMN "leverage" TYPE numeric USING leverage::numeric`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "market_config" ALTER COLUMN "leverage" TYPE integer USING leverage::integer`.execute(db);
}
