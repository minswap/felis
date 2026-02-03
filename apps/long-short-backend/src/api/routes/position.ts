import type { FastifyInstance } from "fastify";
import { API_ENDPOINTS } from "../../constants";
import type { Position } from "../../repository/position-repository";
import type { PositionService } from "../../services/position-service";
import { ApiHelper } from "../helper";
import {
  type AuthenCreatePositionBodyType,
  AuthenCreatePositionBodyTypeSchema,
  CreatePositionResponseSchema,
  type CreatePositionResponseType,
  ErrorResponseSchema,
  type PositionResponseType,
} from "../schemas";

function positionToResponse(position: Position): PositionResponseType {
  return {
    id: position.id.toString(),
    user_address: position.userAddress,
    market: position.market,
    side: position.side,
    status: position.status,
    leverage: position.leverage,
    collateral_asset: position.collateralAsset,
    collateral_amount: position.collateralAmount,
    entry_price: position.entryPrice,
    position_size: position.positionSize,
    borrowed_amount: position.borrowedAmount,
    liquidation_price: position.liquidationPrice,
    take_profit_price: position.takeProfitPrice,
    stop_loss_price: position.stopLossPrice,
    realized_pnl: position.realizedPnl,
    unrealized_pnl: position.unrealizedPnl,
    funding_paid: position.fundingPaid,
    created_at: position.createdAt.toISOString(),
    updated_at: position.updatedAt.toISOString(),
    closed_at: position.closedAt?.toISOString() ?? null,
  };
}

export function registerPositionRoutes(
  fastify: FastifyInstance,
  positionService: PositionService,
): void {
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
      const { market, side, amount } = data;

      // Authenticate request
      const authResult = ApiHelper.authenticate(data, user_address, witness);
      if (!authResult.success) {
        return reply.status(401).send({
          success: false,
          error: authResult.error,
        });
      }

      // Parse amount
      let amountBigInt: bigint;
      try {
        amountBigInt = BigInt(amount);
      } catch {
        return reply.status(400).send({
          success: false,
          error: "Invalid amount format",
        });
      }

      // Create position
      const result = await positionService.createPosition({
        userAddress: user_address,
        market,
        side,
        amount: amountBigInt,
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
}
