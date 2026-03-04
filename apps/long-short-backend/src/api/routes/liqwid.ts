import type { NetworkEnvironment } from "@minswap/felis-ledger-core";
import { LiqwidProvider } from "@minswap/felis-lending-market";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { API_ENDPOINTS } from "../../constants";
import type { DB } from "../../database";
import { OrderRepository } from "../../repository/order-repository";
import { PositionRepository } from "../../repository/position-repository";
import { logger } from "../../utils";
import { ApiHelper } from "../helper";
import {
  type AuthenLiqwidSubmitBodyType,
  AuthenLiqwidSubmitBodyTypeSchema,
  ErrorResponseSchema,
  LiqwidSubmitResponseSchema,
  type LiqwidSubmitResponseType,
} from "../schemas";

/**
 * If the Liqwid submit error indicates a tx evaluation failure (EvaluateTx / SubmitFail),
 * clear the order's built_tx so the next build-tx call rebuilds with fresh data.
 */
async function maybeClearBuiltTxOnEvalError(db: Kysely<DB>, userAddress: string, errorMessage: string): Promise<void> {
  if (!errorMessage.includes("EvaluateTx") && !errorMessage.includes("SubmitFail")) {
    return;
  }

  try {
    const position = await PositionRepository.getOpenPositionByUser(db, userAddress);
    if (!position) return;

    const order = await OrderRepository.getNextUnhandledOrder(db, position.id);
    if (!order || !order.builtTxId) return;

    await OrderRepository.clearOrderBuiltTx(db, order.id);
    logger.info("Cleared built_tx after EvaluateTx failure, order will be rebuilt", {
      orderId: order.id.toString(),
      orderType: order.orderType,
      userAddress,
    });
  } catch (err) {
    logger.error("Failed to clear built_tx after EvaluateTx failure", { error: err, userAddress });
  }
}

export function registerLiqwidRoutes(fastify: FastifyInstance, networkEnv: NetworkEnvironment, db: Kysely<DB>): void {
  // POST /liqwid/submit
  fastify.post<{
    Body: AuthenLiqwidSubmitBodyType;
    Reply: LiqwidSubmitResponseType;
  }>(
    API_ENDPOINTS.LIQWID_SUBMIT,
    {
      schema: {
        body: AuthenLiqwidSubmitBodyTypeSchema,
        response: {
          200: LiqwidSubmitResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { data, user_address, witness } = request.body;
      const { raw_tx, witness_set } = data;

      // Authenticate request
      const authResult = ApiHelper.authenticate(data, user_address, witness);
      if (!authResult.success) {
        return reply.status(401).send({
          success: false,
          error: authResult.error,
        });
      }

      logger.info("Submitting Liqwid transaction", {
        userAddress: user_address,
        rawTxLength: raw_tx.length,
        witnessSetLength: witness_set.length,
      });

      try {
        // Submit transaction to Liqwid
        const submitResult = await LiqwidProvider.submitTransaction({
          transaction: raw_tx,
          signature: witness_set,
          networkEnv,
        });

        if (submitResult.type === "err") {
          const errorMessage = submitResult.error.message;
          logger.error("Failed to submit Liqwid transaction", {
            error: errorMessage,
            userAddress: user_address,
          });

          await maybeClearBuiltTxOnEvalError(db, user_address, errorMessage);

          return reply.status(400).send({
            success: false,
            error: errorMessage,
          });
        }

        const txHash = submitResult.value;
        logger.info("Liqwid transaction submitted successfully", {
          txHash,
          userAddress: user_address,
        });

        return reply.status(200).send({
          success: true,
          data: {
            tx_hash: txHash,
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to submit transaction";
        logger.error("Exception submitting Liqwid transaction", {
          error,
          userAddress: user_address,
        });

        await maybeClearBuiltTxOnEvalError(db, user_address, errorMessage);

        return reply.status(400).send({
          success: false,
          error: errorMessage,
        });
      }
    },
  );
}
