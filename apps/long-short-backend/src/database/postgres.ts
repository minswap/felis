/** biome-ignore-all lint/suspicious/noExplicitAny: skip file */
import { Duration } from "@minswap/felis-ledger-utils";
import * as Kysely from "kysely";
import * as Pg from "pg";
import { logger } from "../utils";

export const DEFAULT_DATABASE_TIMEOUT = Duration.newSeconds(30);

export type PostgresOptions = {
  logSQL: boolean;
  logSlowSQL: Duration;
  skipHealthcheck?: boolean;
};

const DEFAULT_POSTGRES_OPTIONS: PostgresOptions = {
  logSQL: false,
  logSlowSQL: Duration.newSeconds(1),
  skipHealthcheck: true,
};

/**
 * Precedence:
 * 1. Env var
 * 2. Options passed in code
 * 3. Default options
 */
function parsePostgresOptions(userOptions?: Partial<PostgresOptions>): PostgresOptions {
  let finalOptions: PostgresOptions = DEFAULT_POSTGRES_OPTIONS;
  if (userOptions) {
    finalOptions = Object.assign(finalOptions, userOptions);
  }
  return finalOptions;
}

export async function newKyselyClient<T>(
  url: string,
  userOptions?: Partial<PostgresOptions>,
): Promise<Kysely.Kysely<T>> {
  const { logSQL, logSlowSQL, skipHealthcheck } = parsePostgresOptions(userOptions);

  function formatEvent(e: Kysely.LogEvent): Record<string, any> {
    const ret: Record<string, any> = {
      sql: e.query.sql,
      params: e.query.parameters,
      duration: Duration.newMilliseconds(e.queryDurationMillis),
    };
    if (e.level === "error") {
      ret.error = e.error;
    }
    return ret;
  }

  const dialect = new Kysely.PostgresDialect({ pool: await newPgPool(url, skipHealthcheck) });
  const client = new Kysely.Kysely<T>({
    dialect,
    log(event) {
      if (event.level === "error") {
        logger.error("kysely query fail", formatEvent(event));
      } else {
        if (event.queryDurationMillis >= logSlowSQL.milliseconds) {
          logger.warn("kysely slow query", formatEvent(event));
        } else if (logSQL) {
          logger.info("kysely raw query", formatEvent(event));
        }
      }
    },
  });
  return client;
}

export async function newPgPool(url: string, skipHealthcheck?: boolean): Promise<Pg.Pool> {
  const pool = new Pg.Pool({ connectionString: url });
  if (!skipHealthcheck) {
    await pool.query("SELECT 1;"); // healthcheck
  }
  return pool;
}
