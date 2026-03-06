import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "order" ADD COLUMN "built_tx_id" TEXT`.execute(db);
  await sql`ALTER TABLE "order" ADD COLUMN "built_outputs_hash" TEXT`.execute(db);
  await sql`ALTER TABLE "order" ADD COLUMN "built_valid_to" TIMESTAMPTZ`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "order" DROP COLUMN "built_valid_to"`.execute(db);
  await sql`ALTER TABLE "order" DROP COLUMN "built_outputs_hash"`.execute(db);
  await sql`ALTER TABLE "order" DROP COLUMN "built_tx_id"`.execute(db);
}
