import type { FastifyInstance } from "fastify";
import { getEnabledMarketConfigs, type MarketConfig } from "../../config/market";
import { type MarketConfigResponseType, MetadataResponseSchema, type MetadataResponseType } from "../schemas";
import { API_ENDPOINTS } from "../../constants";

function marketConfigToResponse(config: MarketConfig): MarketConfigResponseType {
  return {
    market_id: config.marketId,
    asset_a: config.assetA.toString(),
    asset_b: config.assetB.toString(),
    amm_lp_asset: config.ammLpAsset,
    asset_a_q_token_ticker: config.assetAQTokenTicker,
    asset_a_q_token_raw: config.assetAQTokenRaw,
    asset_b_q_token_ticker: config.assetBQTokenTicker,
    asset_b_q_token_raw: config.assetBQTokenRaw,
    collateral_market_id: config.collateralMarketId,
    leverage: config.leverage,
    min_collateral: config.minCollateral.toString(),
  };
}

export function registerMetadataRoutes(fastify: FastifyInstance): void {
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

      return reply.status(200).send({
        success: true,
        data: {
          markets: marketConfigs.map(marketConfigToResponse),
        },
      });
    },
  );
}
