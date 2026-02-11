import type { Kysely } from "kysely";

/**
 * Seed data for market_config table
 *
 * Note: Update asset values with actual mainnet/testnet values before deployment
 */
export async function seed(db: Kysely<any>): Promise<void> {
  // Clear existing data
  await db.deleteFrom("market_config").execute();

  // Insert seed data
  await db
    .insertInto("market_config")
    .values([
      {
        market_id: "ADA-MIN",
        asset_a: "lovelace", // ADA
        asset_b: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6.4d494e", // MIN
        amm_lp_asset: "TODO_LP_ASSET", // Minswap ADA-MIN LP token
        asset_a_q_token_ticker: "qADA",
        asset_a_q_token_raw: "TODO_QADA_ASSET", // Liqwid qADA token
        asset_b_q_token_ticker: "qMIN",
        asset_b_q_token_raw: "TODO_QMIN_ASSET", // Liqwid qMIN token
        long_collateral_market_id: "ADA", // Liqwid market ID for long collateral
        short_collateral_market_id: "ADA", // Liqwid market ID for short collateral
        long_leverage: 1.5,
        short_leverage: 0.5,
        min_collateral: "100000000", // 100 ADA in lovelace
        enable: true,
      },
    ])
    .execute();

  console.log("Seeded market_config table");
}
