import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Position table
  await sql`ALTER TABLE "position" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC'`.execute(db);
  await sql`ALTER TABLE "position" ALTER COLUMN "closed_at" TYPE timestamptz USING "closed_at" AT TIME ZONE 'UTC'`.execute(db);

  // Order table
  await sql`ALTER TABLE "order" ALTER COLUMN "built_valid_to" TYPE timestamptz USING "built_valid_to" AT TIME ZONE 'UTC'`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Position table
  await sql`ALTER TABLE "position" ALTER COLUMN "created_at" TYPE timestamp USING "created_at" AT TIME ZONE 'UTC'`.execute(db);
  await sql`ALTER TABLE "position" ALTER COLUMN "closed_at" TYPE timestamp USING "closed_at" AT TIME ZONE 'UTC'`.execute(db);

  // Order table
  await sql`ALTER TABLE "order" ALTER COLUMN "built_valid_to" TYPE timestamp USING "built_valid_to" AT TIME ZONE 'UTC'`.execute(db);
}
