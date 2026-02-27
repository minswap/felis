import type { NetworkEnvironment } from "@minswap/felis-ledger-core";
import { LiqwidProviderV2 } from "@minswap/felis-lending-market";
import type { FastifyInstance } from "fastify";
import { getEnabledMarketConfigs, type MarketConfig } from "../../config/market";
import { API_ENDPOINTS } from "../../constants";
import { logger } from "../../utils";
import { type MarketConfigResponseType, MetadataResponseSchema, type MetadataResponseType } from "../schemas";

type LiqwidMarketApyMap = Map<string, { borrowAPY: number; supplyAPY: number }>;

function marketConfigToResponse(config: MarketConfig, liqwidApys: LiqwidMarketApyMap): MarketConfigResponseType {
  const assetAApys = liqwidApys.get(config.borrowMarketIdLong);
  const assetBApys = liqwidApys.get(config.borrowMarketIdShort);

  return {
    market_id: config.marketId,
    asset_a: config.assetA.toString(),
    asset_b: config.assetB.toString(),
    amm_lp_asset: config.ammLpAsset,
    asset_a_q_token_ticker: config.assetAQTokenTicker,
    asset_a_q_token_raw: config.assetAQTokenRaw,
    asset_b_q_token_ticker: config.assetBQTokenTicker,
    asset_b_q_token_raw: config.assetBQTokenRaw,
    long_collateral_market_id: config.longCollateralMarketId,
    short_collateral_market_id: config.shortCollateralMarketId,
    long_leverage: config.longLeverage,
    short_leverage: config.shortLeverage,
    min_collateral: config.minCollateral.toString(),
    asset_a_borrow_apy: assetAApys?.borrowAPY ?? null,
    asset_a_supply_apy: assetAApys?.supplyAPY ?? null,
    asset_b_borrow_apy: assetBApys?.borrowAPY ?? null,
    asset_b_supply_apy: assetBApys?.supplyAPY ?? null,
  };
}

async function fetchLiqwidMarketApys(networkEnv: NetworkEnvironment): Promise<LiqwidMarketApyMap> {
  const apyMap: LiqwidMarketApyMap = new Map();
  const config = LiqwidProviderV2.createConfig(networkEnv);
  const result = await LiqwidProviderV2.Data.markets(config);
  if (result.type === "ok") {
    for (const market of result.value.results) {
      apyMap.set(market.id, { borrowAPY: market.borrowAPY, supplyAPY: market.supplyAPY });
    }
  } else {
    logger.error("Failed to fetch Liqwid market data", { error: result.error });
  }
  return apyMap;
}

export function registerMetadataRoutes(fastify: FastifyInstance, networkEnv: NetworkEnvironment): void {
  // GET /metadata
  fastify.get<{
    Reply: MetadataResponseType;
  }>(
    API_ENDPOINTS.METADATA,
    {
      schema: {
        response: {
          200: MetadataResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const marketConfigs = getEnabledMarketConfigs();
      const liqwidApys = await fetchLiqwidMarketApys(networkEnv);

      return reply.status(200).send({
        success: true,
        data: {
          markets: marketConfigs.map((c) => marketConfigToResponse(c, liqwidApys)),
        },
      });
    },
  );
}
