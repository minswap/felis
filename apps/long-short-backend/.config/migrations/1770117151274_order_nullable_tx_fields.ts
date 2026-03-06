import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "order" ALTER COLUMN "created_tx_id" DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE "order" ALTER COLUMN "created_tx_index" DROP NOT NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "order" ALTER COLUMN "created_tx_id" SET NOT NULL`.execute(db);
  await sql`ALTER TABLE "order" ALTER COLUMN "created_tx_index" SET NOT NULL`.execute(db);
}
