import invariant from "@minswap/tiny-invariant";
import type { FastifyInstance } from "fastify";
import { API_ENDPOINTS } from "../../constants";
import type { Position } from "../../repository/position-repository";
import type { PositionService } from "../../services/position-service";
import { ApiHelper } from "../helper";
import {
  type AuthenBuildTxBodyType,
  AuthenBuildTxBodyTypeSchema,
  type AuthenCreatePositionBodyType,
  AuthenCreatePositionBodyTypeSchema,
  BuildTxResponseSchema,
  type BuildTxResponseType,
  CreatePositionResponseSchema,
  type CreatePositionResponseType,
  ErrorResponseSchema,
  GetPositionQuerySchema,
  type GetPositionQueryType,
  GetPositionResponseSchema,
  type GetPositionResponseType,
  type PositionResponseType,
} from "../schemas";

function positionToResponse(position: Position): PositionResponseType {
  return {
    id: position.id.toString(),
    market_id: position.marketId,
    user_address: position.userAddress,
    side: position.side,
    status: position.status,
    amount_in: position.amountIn,
    amount_borrow: position.amountBorrow,
    created_at: position.createdAt.toISOString(),
    closed_at: position.closedAt?.toISOString() ?? null,
  };
}

export function registerPositionRoutes(fastify: FastifyInstance, positionService: PositionService): void {
  // GET /position/get?user_address=...
  fastify.get<{
    Querystring: GetPositionQueryType;
    Reply: GetPositionResponseType;
  }>(
    API_ENDPOINTS.POSITION_GET,
    {
      schema: {
        querystring: GetPositionQuerySchema,
        response: {
          200: GetPositionResponseSchema,
          400: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { user_address } = request.query;

      const position = await positionService.getOpenPositionByUser(user_address);

      return reply.status(200).send({
        success: true,
        data: position ? positionToResponse(position) : null,
      });
    },
  );

  // POST /position/create
  fastify.post<{
    Body: AuthenCreatePositionBodyType;
    Reply: CreatePositionResponseType;
  }>(
    API_ENDPOINTS.POSITION_CREATE,
    {
      schema: {
        body: AuthenCreatePositionBodyTypeSchema,
        response: {
          200: CreatePositionResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { data, user_address, witness } = request.body;
      const { market_id, side, amount_in } = data;

      // Authenticate request
      const authResult = ApiHelper.authenticate(data, user_address, witness);
      if (!authResult.success) {
        return reply.status(401).send({
          success: false,
          error: authResult.error,
        });
      }

      // Create position via service
      const result = await positionService.createPosition({
        userAddress: user_address,
        marketId: market_id,
        side,
        amountIn: BigInt(amount_in),
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error,
        });
      }

      return reply.status(200).send({
        success: true,
        data: positionToResponse(result.position),
      });
    },
  );

  // POST /position/build-tx
  fastify.post<{
    Body: AuthenBuildTxBodyType;
    Reply: BuildTxResponseType;
  }>(
    API_ENDPOINTS.POSITION_BUILD_TX,
    {
      schema: {
        body: AuthenBuildTxBodyTypeSchema,
        response: {
          200: BuildTxResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { data, user_address, witness } = request.body;
      const { market_id, utxos } = data;

      // Authenticate request
      const authResult = ApiHelper.authenticate(data, user_address, witness);
      if (!authResult.success) {
        return reply.status(401).send({
          success: false,
          error: authResult.error,
        });
      }

      // Build transaction via service
      const result = await positionService.buildTx({
        userAddress: user_address,
        marketId: market_id,
        utxos,
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error,
        });
      }

      // Handle waiting state (transaction already built, waiting for confirmation)
      if ("waiting" in result && result.waiting) {
        return reply.status(200).send({
          success: true,
          data: {
            order_type: result.orderType,
            waiting: true,
            message: result.message,
          },
        });
      }

      // Return newly built transaction
      invariant("txRaw" in result && result.txRaw, "type-safe");
      return reply.status(200).send({
        success: true,
        data: {
          tx_raw: result.txRaw,
          order_type: result.orderType,
        },
      });
    },
  );
}
