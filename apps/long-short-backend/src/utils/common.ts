import type * as OgmiosSchema from "@cardano-ogmios/schema";
import { parseIntSafe } from "@minswap/felis-ledger-utils";
import invariant from "@minswap/tiny-invariant";
import { logger } from "./logger";

export enum EnvKey {
  DATABASE_URL = "DATABASE_URL",
  OGMIOS_HOST = "OGMIOS_HOST",
  REDIS_URL = "REDIS_URL",
  SYNCER_START_POINT = "SYNCER_START_POINT",
}

export function parseHostPort(env: string): { host: string; port: number } {
  const parts = env.split(":");
  invariant(parts.length === 2, `expect format host:port, get ${env}`);
  return {
    host: parts[0],
    port: parseIntSafe(parts[1]),
  };
}

export function getEnvOr(key: string, defaultValue: string): string {
  const val = process.env[key];
  if (!val) {
    return defaultValue;
  }
  return val;
}

export function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    logger.error(`Require environment variable ${key}`);
    throw new Error("Server init error");
  }
  return val;
}

export function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}

export function parsePointOrOrigin(env: string): OgmiosSchema.PointOrOrigin {
  if (env === "origin") {
    return env;
  }
  return parsePoint(env);
}

export function parsePoint(env: string): OgmiosSchema.Point {
  try {
    const parts = env.split(".");
    return {
      id: parts[0],
      slot: parseIntSafe(parts[1]),
    };
  } catch (_err) {
    throw new Error(`fail to parse point, expect format $headerHash.$slot, got ${env}`);
  }
}
