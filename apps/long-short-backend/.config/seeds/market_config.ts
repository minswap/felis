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
        market_id: "ADA-NIGHT",
        asset_a: "lovelace",
        asset_b: "0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa.4e49474854", // NIGHT
        amm_lp_asset:
          "f5808c2c990d86da54bfc97d89cee6efa20cd8461616359478d96b4c.e74c52975908a612d5ce68327040d449aae99f8b463bb6de046a1b23c5713169",
        asset_a_q_token_ticker: "qAda",
        asset_a_q_token_raw: "a04ce7a52545e5e33c2867e148898d9e667a69602285f6a1298f9d68",
        asset_b_q_token_ticker: "qNIGHT",
        asset_b_q_token_raw: "c45fa8aefc662c003a32be67f6a4652d8ce56bd9e54d7696efd40c86",
        long_collateral_market_id: "NIGHT",
        short_collateral_market_id: "Ada",
        borrow_market_id_long: "Ada",
        borrow_market_id_short: "NIGHT",
        long_leverage: 1.5,
        short_leverage: 0.5,
        min_collateral: "200000000", // 200 ADA in lovelace
        enable: true,
      },
    ])
    .execute();

  console.log("Seeded market_config table");
}
