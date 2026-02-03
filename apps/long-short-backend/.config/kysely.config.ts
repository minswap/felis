import { PostgresAdapter, PostgresDriver, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import { defineConfig } from "kysely-ctl";
import { Pool } from "pg";

export default defineConfig({
  dialect: {
    createAdapter() {
      return new PostgresAdapter();
    },
    createDriver() {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
      });
      return new PostgresDriver({ pool });
    },
    createIntrospector(db) {
      return new PostgresIntrospector(db);
    },
    createQueryCompiler() {
      return new PostgresQueryCompiler();
    },
  },
  migrations: {
    migrationFolder: "migrations",
  },
  seeds: {
    seedFolder: "seeds",
  },
});
