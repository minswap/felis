import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "order" ADD COLUMN "waiting" BOOLEAN NOT NULL DEFAULT true`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "order" DROP COLUMN "waiting"`.execute(db);
}
