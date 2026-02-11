import { Asset } from "@minswap/felis-ledger-core";
import type { Kysely } from "kysely";
import type { DB } from "../database";

/**
 * Market configuration loaded from database
 */
export type MarketConfig = {
  marketId: string;
  assetA: Asset;
  assetB: Asset;
  ammLpAsset: string;
  assetAQTokenTicker: string;
  assetAQTokenRaw: string;
  assetBQTokenTicker: string;
  assetBQTokenRaw: string;
  longCollateralMarketId: string;
  shortCollateralMarketId: string;
  borrowMarketIdLong: string;
  borrowMarketIdShort: string;
  longLeverage: number;
  shortLeverage: number;
  minCollateral: bigint;
  enable: boolean;
};

/**
 * In-memory cache for market configs
 */
let marketConfigCache: Map<string, MarketConfig> | null = null;

/**
 * Load all market configs from database
 */
export async function loadMarketConfigs(db: Kysely<DB>): Promise<Map<string, MarketConfig>> {
  const rows = await db.selectFrom("market_config").selectAll().execute();

  const configs = new Map<string, MarketConfig>();
  for (const row of rows) {
    configs.set(row.market_id, {
      marketId: row.market_id,
      assetA: Asset.fromString(row.asset_a),
      assetB: Asset.fromString(row.asset_b),
      ammLpAsset: row.amm_lp_asset,
      assetAQTokenTicker: row.asset_a_q_token_ticker,
      assetAQTokenRaw: row.asset_a_q_token_raw,
      assetBQTokenTicker: row.asset_b_q_token_ticker,
      assetBQTokenRaw: row.asset_b_q_token_raw,
      longCollateralMarketId: row.long_collateral_market_id,
      shortCollateralMarketId: row.short_collateral_market_id,
      borrowMarketIdLong: row.borrow_market_id_long,
      borrowMarketIdShort: row.borrow_market_id_short,
      longLeverage: Number(row.long_leverage),
      shortLeverage: Number(row.short_leverage),
      minCollateral: BigInt(row.min_collateral),
      enable: row.enable,
    });
  }

  // Update cache
  marketConfigCache = configs;
  return configs;
}

/**
 * Get all enabled market configs from cache
 * Call loadMarketConfigs first to populate cache
 */
export function getEnabledMarketConfigs(): MarketConfig[] {
  if (!marketConfigCache) {
    throw new Error("Market configs not loaded. Call loadMarketConfigs first.");
  }
  return Array.from(marketConfigCache.values()).filter((c) => c.enable);
}

/**
 * Get market config by market ID from cache
 */
export function getMarketConfig(marketId: string): MarketConfig | null {
  if (!marketConfigCache) {
    throw new Error("Market configs not loaded. Call loadMarketConfigs first.");
  }
  return marketConfigCache.get(marketId) ?? null;
}

/**
 * Check if market is supported and enabled
 */
export function isSupportedMarket(marketId: string): boolean {
  const config = getMarketConfig(marketId);
  return config ? config.enable : false;
}

/**
 * Reload market configs from database (for hot reload)
 */
export async function reloadMarketConfigs(db: Kysely<DB>): Promise<void> {
  await loadMarketConfigs(db);
}
